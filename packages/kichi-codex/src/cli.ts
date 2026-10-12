#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseHook } from './hooks.js';
import { configureConnection, DEFAULT_MCP_URL } from './connection.js';
import { BridgeNotReadyError, callBridge, errorMessage, getBridgeConfig, type BridgeConfig } from './ipc.js';

async function bridgeState(config: BridgeConfig): Promise<'ready' | 'stopped' | 'starting'> {
  try {
    const status = await callBridge(config, '/ping', {}, 1_000) as { transport: string };
    if (status.transport !== 'streamable-http') throw new Error('Stop the existing Kichi bridge before starting the MCP bridge.');
    return 'ready';
  } catch (error) {
    if (error instanceof BridgeNotReadyError) return 'starting';
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ECONNREFUSED') return 'stopped';
    throw error;
  }
}

async function start(config: BridgeConfig): Promise<void> {
  const state = await bridgeState(config);
  if (state === 'ready') return;
  const deadline = Date.now() + 8_000;
  if (state === 'stopped' && await launch(config)) return;
  // Another App task owns startup. Wait for its readiness before using the shared MCP client.
  while (Date.now() < deadline) {
    if (await bridgeState(config) === 'ready') return;
    await delay(100);
  }
  throw new Error(`Kichi startup timed out; see ${config.logPath}`);
}

async function launch(config: BridgeConfig): Promise<boolean> {
  await mkdir(config.runtimeDir, { recursive: true, mode: 0o700 });
  const log = await open(config.logPath, 'a', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log.fd, log.fd, 'ipc'],
  });
  const readiness = new Promise<boolean>((resolveStarted, reject) => {
    const deadline = setTimeout(() => {
      child.kill();
      reject(new Error(`Kichi startup timed out; see ${config.logPath}`));
    }, 8_000);
    child.once('error', (error) => { clearTimeout(deadline); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(deadline);
      reject(new Error(`Kichi startup exited (${code}); see ${config.logPath}`));
    });
    child.once('message', (message: { ready?: boolean; busy?: boolean; error?: string }) => {
      clearTimeout(deadline);
      if (child.connected) child.disconnect();
      child.unref();
      if (!message.ready && !message.busy) {
        reject(new Error(message.error ?? 'Kichi startup failed.'));
        return;
      }
      resolveStarted(message.ready === true);
    });
  });
  try { return await readiness; }
  finally { await log.close(); }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === '--help' || command === 'help' || command === undefined) {
    process.stdout.write(`kichi-codex configure --token-file PATH [--server-url URL]\nkichi-codex start | stop | status | mcp | hook\nDefault MCP: ${DEFAULT_MCP_URL}\nProfile: KICHI_CODEX_PROFILE (default: default).\n`);
    return;
  }
  const config = getBridgeConfig();
  if (command === 'configure') {
    const options = new Map<string, string>();
    for (let index = 3; index < process.argv.length; index += 2) {
      const key = process.argv[index]!;
      const value = process.argv[index + 1];
      if (!['--server-url', '--token-file'].includes(key) || !value || options.has(key)) {
        throw new Error('Use configure --token-file PATH [--server-url URL].');
      }
      options.set(key, value);
    }
    const tokenFile = options.get('--token-file');
    if (!tokenFile) throw new Error('--token-file is required.');
    try {
      await callBridge(config, '/ping', {}, 1_000);
      throw new Error('Stop the bridge before changing its MCP connection configuration.');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ECONNREFUSED') throw error;
    }
    const serverUrl = options.get('--server-url') ?? DEFAULT_MCP_URL;
    await configureConnection(config, serverUrl, tokenFile);
    process.stdout.write(`MCP connection configured (${config.profile}): ${serverUrl}\n`);
    return;
  }
  if (process.argv.length !== 3) throw new Error('Unexpected arguments. Use kichi-codex --help.');
  switch (command) {
    case 'start':
      await start(config);
      process.stdout.write(`Kichi bridge ready (${config.profile}).\n`);
      return;
    case 'serve': {
      const { serve } = await import('./runtime.js');
      const runtime = await serve(config);
      process.send?.({ ready: true });
      const stop = () => { runtime.close().catch((error) => { process.stderr.write(`${errorMessage(error)}\n`); process.exitCode = 1; }); };
      process.once('SIGTERM', stop);
      process.once('SIGINT', stop);
      return;
    }
    case 'mcp': {
      await start(config);
      const { runMcp } = await import('./mcp.js');
      await runMcp(config);
      return;
    }
    case 'hook': {
      let input = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) input += chunk;
      const event = parseHook(JSON.parse(input));
      if (event?.event === 'SessionStart') await start(config);
      if (event) await callBridge(config, '/hook', event, 12_000);
      process.stdout.write('{}\n');
      return;
    }
    case 'status':
      process.stdout.write(`${JSON.stringify(await callBridge(config, '/status'))}\n`);
      return;
    case 'stop':
      await callBridge(config, '/stop');
      process.stdout.write(`Kichi bridge stopped (${config.profile}).\n`);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  if (process.argv[2] === 'serve' && error.code === 'EADDRINUSE') {
    process.send?.({ busy: true });
    return;
  }
  process.stderr.write(`kichi-codex: ${errorMessage(error)}\n`);
  if (process.argv[2] === 'serve') process.send?.({ error: errorMessage(error) });
  process.exitCode = 1;
});
