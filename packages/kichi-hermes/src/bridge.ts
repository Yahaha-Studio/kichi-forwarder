import { KichiForwarderService, loadEnvironmentsConfig } from "@yahaha-studio/kichi-core";
import { mkdir } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import { connectionStatus, executeKichiTool, listKichiTools } from "./tools.js";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function write(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + "\n");
}

function object(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    if (!keys.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
  }
  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--runtime-dir" || !isAbsolute(args[1])) {
    throw new Error("Usage: node bridge.mjs --runtime-dir <absolute path>");
  }
  const runtimeDir = args[1];
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  const environments = loadEnvironmentsConfig();
  const logger = {
    debug: (_value: string) => {},
    info: (value: string) => process.stderr.write(`[kichi] ${value}\n`),
    warn: (value: string) => process.stderr.write(`[kichi] ${value}\n`),
    error: (value: string) => process.stderr.write(`[kichi] ${value}\n`),
  };
  const service = new KichiForwarderService(logger, {
    agentId: "hermes",
    runtimeDir,
    resolveEnvironmentHost: (environment) => environments[environment],
  });
  service.onBotMessageReceived = (_service, payload) => {
    write({ event: "bot_message", message: payload });
  };
  let stopped = false;
  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    await service.stop();
  }
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  process.once("SIGINT", () => { input.close(); process.stdin.destroy(); });
  process.once("SIGTERM", () => { input.close(); process.stdin.destroy(); });
  try {
    await service.start();
    for await (const line of input) {
      let id: number | null = null;
      let shutdown = false;
      try {
        const request = object(JSON.parse(line), "request", ["id", "method", "params"]);
        if (typeof request.id !== "number" || !Number.isSafeInteger(request.id) || request.id < 0) {
          throw new Error("request.id must be a non-negative safe integer");
        }
        id = request.id;
        if (typeof request.method !== "string") throw new Error("request.method must be a string");
        let result: unknown;
        switch (request.method) {
          case "tools/list":
            object(request.params, "params", []);
            result = listKichiTools();
            break;
          case "tools/call": {
            const params = object(request.params, "params", ["name", "arguments"]);
            if (typeof params.name !== "string") throw new Error("params.name must be a string");
            result = await executeKichiTool(service, params.name, params.arguments);
            break;
          }
          case "status":
            object(request.params, "params", []);
            result = { ...connectionStatus(service), llmRuntimeEnabled: service.isLlmRuntimeEnabled() };
            break;
          case "hook": {
            const params = object(request.params, "params", ["type", "bubble"]);
            if (params.type !== "message_received" && params.type !== "before_send_message") {
              throw new Error("params.type must be message_received or before_send_message");
            }
            if (typeof params.bubble !== "string" || !params.bubble.trim()) {
              throw new Error("params.bubble must be a non-empty string");
            }
            const sent = service.isConnected() && service.isLlmRuntimeEnabled();
            if (sent) service.sendHookNotify(params.type, params.bubble);
            result = { sent };
            break;
          }
          case "shutdown":
            object(request.params, "params", []);
            await stop();
            result = { stopped: true };
            shutdown = true;
            break;
          default:
            throw new Error(`Unknown bridge method: ${request.method}`);
        }
        write({ id, result });
      } catch (error) {
        write({ id, error: message(error) });
      }
      if (shutdown) break;
    }
  } finally {
    input.close();
    process.stdin.destroy();
    await stop();
  }
}

main().catch((error) => {
  process.stderr.write(`kichi-hermes: ${message(error)}\n`);
  process.exitCode = 1;
});

