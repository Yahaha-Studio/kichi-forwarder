#!/usr/bin/env node
import { createRequire as __kichiCreateRequire } from "node:module"; const require = __kichiCreateRequire(import.meta.url);
import {
  DEFAULT_MCP_URL,
  configureConnection,
  parseHook
} from "./chunk-SZZF527N.js";
import {
  BridgeNotReadyError,
  callBridge,
  errorMessage,
  getBridgeConfig
} from "./chunk-F3QS47XT.js";

// src/cli.ts
import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
async function bridgeState(config) {
  try {
    const status = await callBridge(config, "/ping", {}, 1e3);
    if (status.transport !== "streamable-http") throw new Error("Stop the existing Kichi bridge before starting the MCP bridge.");
    return "ready";
  } catch (error) {
    if (error instanceof BridgeNotReadyError) return "starting";
    const code = error.code;
    if (code === "ENOENT" || code === "ECONNREFUSED") return "stopped";
    throw error;
  }
}
async function start(config) {
  const state = await bridgeState(config);
  if (state === "ready") return;
  const deadline = Date.now() + 8e3;
  if (state === "stopped" && await launch(config)) return;
  while (Date.now() < deadline) {
    if (await bridgeState(config) === "ready") return;
    await delay(100);
  }
  throw new Error(`Kichi startup timed out; see ${config.logPath}`);
}
async function launch(config) {
  await mkdir(config.runtimeDir, { recursive: true, mode: 448 });
  const log = await open(config.logPath, "a", 384);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"], {
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log.fd, log.fd, "ipc"]
  });
  const readiness = new Promise((resolveStarted, reject) => {
    const deadline = setTimeout(() => {
      child.kill();
      reject(new Error(`Kichi startup timed out; see ${config.logPath}`));
    }, 8e3);
    child.once("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(deadline);
      reject(new Error(`Kichi startup exited (${code}); see ${config.logPath}`));
    });
    child.once("message", (message) => {
      clearTimeout(deadline);
      if (child.connected) child.disconnect();
      child.unref();
      if (!message.ready && !message.busy) {
        reject(new Error(message.error ?? "Kichi startup failed."));
        return;
      }
      resolveStarted(message.ready === true);
    });
  });
  try {
    return await readiness;
  } finally {
    await log.close();
  }
}
async function main() {
  const command = process.argv[2];
  if (command === "--help" || command === "help" || command === void 0) {
    process.stdout.write(`kichi-codex configure --token-file PATH [--server-url URL]
kichi-codex start | stop | status | mcp | hook
Default MCP: ${DEFAULT_MCP_URL}
Profile: KICHI_CODEX_PROFILE (default: default).
`);
    return;
  }
  const config = getBridgeConfig();
  if (command === "configure") {
    const options = /* @__PURE__ */ new Map();
    for (let index = 3; index < process.argv.length; index += 2) {
      const key = process.argv[index];
      const value = process.argv[index + 1];
      if (!["--server-url", "--token-file"].includes(key) || !value || options.has(key)) {
        throw new Error("Use configure --token-file PATH [--server-url URL].");
      }
      options.set(key, value);
    }
    const tokenFile = options.get("--token-file");
    if (!tokenFile) throw new Error("--token-file is required.");
    try {
      await callBridge(config, "/ping", {}, 1e3);
      throw new Error("Stop the bridge before changing its MCP connection configuration.");
    } catch (error) {
      const code = error.code;
      if (code !== "ENOENT" && code !== "ECONNREFUSED") throw error;
    }
    const serverUrl = options.get("--server-url") ?? DEFAULT_MCP_URL;
    await configureConnection(config, serverUrl, tokenFile);
    process.stdout.write(`MCP connection configured (${config.profile}): ${serverUrl}
`);
    return;
  }
  if (process.argv.length !== 3) throw new Error("Unexpected arguments. Use kichi-codex --help.");
  switch (command) {
    case "start":
      await start(config);
      process.stdout.write(`Kichi bridge ready (${config.profile}).
`);
      return;
    case "serve": {
      const { serve } = await import("./runtime-SHBYI4M7.js");
      const runtime = await serve(config);
      process.send?.({ ready: true });
      const stop = () => {
        runtime.close().catch((error) => {
          process.stderr.write(`${errorMessage(error)}
`);
          process.exitCode = 1;
        });
      };
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
      return;
    }
    case "mcp": {
      await start(config);
      const { runMcp } = await import("./mcp-AJ2JII5E.js");
      await runMcp(config);
      return;
    }
    case "hook": {
      let input = "";
      process.stdin.setEncoding("utf8");
      for await (const chunk of process.stdin) input += chunk;
      const event = parseHook(JSON.parse(input));
      if (event?.event === "SessionStart") await start(config);
      if (event) await callBridge(config, "/hook", event, 12e3);
      process.stdout.write("{}\n");
      return;
    }
    case "status":
      process.stdout.write(`${JSON.stringify(await callBridge(config, "/status"))}
`);
      return;
    case "stop":
      await callBridge(config, "/stop");
      process.stdout.write(`Kichi bridge stopped (${config.profile}).
`);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
main().catch((error) => {
  if (process.argv[2] === "serve" && error.code === "EADDRINUSE") {
    process.send?.({ busy: true });
    return;
  }
  process.stderr.write(`kichi-codex: ${errorMessage(error)}
`);
  if (process.argv[2] === "serve") process.send?.({ error: errorMessage(error) });
  process.exitCode = 1;
});
