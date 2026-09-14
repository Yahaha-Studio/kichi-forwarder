#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseHook } from './hooks.js';
import { callBridge, errorMessage, getBridgeConfig, type BridgeConfig } from './ipc.js';

async function start(config: BridgeConfig): Promise<void> {
  await mkdir(config.runtimeDir, { recursive: true, mode: 0o700 });
  const log = await open(config.logPath, 'a', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log.fd, log.fd, 'ipc'],
  });
  const readiness = new Promise<void>((resolveStarted, reject) => {
    const deadline = setTimeout(() => {
      child.kill();
      reject(new Error(`Kichi startup timed out; see ${config.logPath}`));
    }, 15_000);
    child.once('error', (error) => { clearTimeout(deadline); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(deadline);
      reject(new Error(`Kichi startup exited (${code}); see ${config.logPath}`));
    });
    child.once('message', (message: { ready?: boolean; error?: string }) => {
      clearTimeout(deadline);
      if (!message.ready) {
        if (child.connected) child.disconnect();
        child.unref();
        reject(new Error(message.error ?? 'Kichi startup failed.'));
        return;
      }
      child.disconnect();
      child.unref();
      resolveStarted();
    });
  });
  await log.close();
  await readiness;
  process.stdout.write(`Kichi bridge started (${config.profile}).\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === '--help' || command === 'help' || command === undefined) {
    process.stdout.write('kichi-codex start | stop | status | mcp | hook\nProfile: KICHI_CODEX_PROFILE (default: default).\n');
    return;
  }
  if (process.argv.length !== 3) throw new Error('Unexpected arguments. Use kichi-codex --help.');
  const config = getBridgeConfig();
  switch (command) {
    case 'start':
      await start(config);
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
      const { runMcp } = await import('./mcp.js');
      await runMcp(config);
      return;
    }
    case 'hook': {
      let input = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) input += chunk;
      const event = parseHook(JSON.parse(input));
      if (event) await callBridge(config, '/hook', event, 1_500);
      process.stdout.write('{}\n');
      return;
    }
    case 'status':
      process.stdout.write(`${JSON.stringify(await callBridge(config, '/tool', { action: 'connection_status', parameters: {} }))}\n`);
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
  process.stderr.write(`kichi-codex: ${errorMessage(error)}\n`);
  if (process.argv[2] === 'serve') process.send?.({ error: errorMessage(error) });
  process.exitCode = 1;
});
