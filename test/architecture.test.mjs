import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter, once } from "node:events";
import { registerHooks } from "node:module";
import { after, test } from "node:test";
import { WebSocketServer } from "ws";

// Never load the user's OpenClaw runtime or read its home directory.
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kichi-architecture-"));
const temporaryHome = path.join(temporaryRoot, "home");
fs.mkdirSync(temporaryHome);
const originalHomedir = os.homedir;
os.homedir = () => temporaryHome;
let adapterImportAllowed = false;
const sdkHook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("openclaw/")) {
      assert.ok(adapterImportAllowed, `Core imported OpenClaw: ${specifier}`);
      assert.equal(specifier, "openclaw/plugin-sdk/agent-runtime");
      return {
        url: 'data:text/javascript,export async function agentCommandFromIngress(){throw new Error("Unexpected agent ingress during isolated regression")}',
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { KichiForwarderService } = await import("@yahaha-studio/kichi-core");
adapterImportAllowed = true;
const { default: plugin } = await import("@yahaha-studio/kichi-forwarder");
const logger = Object.fromEntries(["debug", "info", "warn", "error"].map(level => [level, () => {}]));
const registeredTools = [];
const registeredHooks = [];
const registeredServices = [];
plugin.register({
  logger,
  on(name, handler, options) { registeredHooks.push({ name, handler, options }); },
  registerService(service) { registeredServices.push(service); },
  registerTool(factory, options) { registeredTools.push({ factory, options }); },
});

after(async () => {
  for (const service of registeredServices) await service.stop();
  os.homedir = originalHomedir;
  sdkHook.deregister();
  // mkdtemp returns the specific directory created by this test under os.tmpdir().
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

function normalizeHome(value) {
  if (typeof value === "string") {
    const escapedHome = JSON.stringify(temporaryHome).slice(1, -1);
    const replaced = value.split(escapedHome).join("<HOME>").split(temporaryHome).join("<HOME>");
    return replaced.includes("<HOME>") ? replaced.replaceAll("\\\\", "/").replaceAll("\\", "/") : replaced;
  }
  if (Array.isArray(value)) return value.map(normalizeHome);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeHome(item)]));
  }
  return value;
}

const toolContext = { agentId: "main", sessionKey: "agent:main:main" };

test("OpenClaw tools, schemas, descriptions and empty-input results retain their pre-refactor contracts", async () => {
  const definitions = [];
  for (const { factory, options } of registeredTools) {
    const tool = typeof factory === "function" ? factory(toolContext) : factory;
    const result = tool ? await tool.execute("regression-contract", {}) : null;
    definitions.push({
      registration: options,
      definition: tool ? { name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters } : null,
      emptyParametersResult: result,
    });
  }
  const contract = {
    id: plugin.id,
    name: plugin.name,
    hooks: registeredHooks.map(({ name, options }) => ({ name, options })),
    services: registeredServices.map(({ id }) => id),
    tools: definitions,
  };
  const expected = JSON.parse(fs.readFileSync(new URL("./fixtures/openclaw-contract.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeHome(contract))), expected);
});

test("Official OpenClaw daily schedule and lifecycle notifications retain their pre-refactor contracts", async (t) => {
  const sourcePath = path.join(temporaryHome, ".openclaw", "kichi-world", "join-source.json");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({ source: "kichiclaw" }));
  t.after(() => fs.unlinkSync(sourcePath));
  const expected = JSON.parse(fs.readFileSync(new URL("./fixtures/openclaw-official.json", import.meta.url), "utf8"));
  const tools = [];
  for (const { factory, options } of registeredTools) {
    if (!["kichi_sync_mate_daily_schedule", "kichi_query_status"].includes(options.name)) continue;
    const tool = factory(toolContext);
    tools.push({ name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters,
      emptyParametersResult: await tool.execute("official-contract", {}) });
  }
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeHome(tools))), expected.tools);

  const hookTrace = [];
  t.mock.method(KichiForwarderService.prototype, "isConnected", () => true);
  t.mock.method(KichiForwarderService.prototype, "hasValidIdentity", () => true);
  t.mock.method(KichiForwarderService.prototype, "isLlmRuntimeEnabled", () => false);
  t.mock.method(KichiForwarderService.prototype, "sendStatus", (...args) => { hookTrace.push({ operation: "sendStatus", args }); return true; });
  t.mock.method(KichiForwarderService.prototype, "sendHookNotify", (...args) => { hookTrace.push({ operation: "sendHookNotify", args }); return true; });
  const hooks = new Map(registeredHooks.map(({ name, handler }) => [name, handler]));
  await hooks.get("before_dispatch")({ content: "Hello there" }, toolContext);
  await hooks.get("before_prompt_build")({ prompt: "Please work", messages: [] }, toolContext);
  await hooks.get("before_tool_call")({ toolName: "exec", params: {} }, toolContext);
  await hooks.get("agent_end")({ success: true, messages: [{ role: "assistant", content: "Done" }] }, toolContext);
  await hooks.get("agent_end")({ success: false, messages: [] }, toolContext);
  assert.deepEqual(JSON.parse(JSON.stringify(hookTrace)), expected.hookTrace);
});

test("Core joins, correlates requests, persists identity and bot history, and rejoins independently of OpenClaw", { timeout: 10000 }, async (t) => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const received = new EventEmitter();
  const runtimeDir = path.join(temporaryRoot, "independent-core");
  const serviceOptions = { agentId: "standalone", runtimeDir, resolveEnvironmentHost: () => null };
  const service = new KichiForwarderService(logger, serviceOptions);
  let restored;
  t.after(async () => {
    service.stop();
    restored?.stop();
    for (const socket of server.clients) socket.terminate();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  server.on("connection", socket => {
    socket.on("message", data => {
      const message = JSON.parse(data.toString());
      received.emit(message.type, message);
      if (message.type === "join") socket.send(JSON.stringify({ type: "join_ack", success: true, authKey: "test-key" }));
      if (message.type === "query_status") {
        socket.send(JSON.stringify({
          type: message.requestId === "wrong-response" ? "status_ack" : "query_status_result",
          requestId: message.requestId,
          isAvatarInScene: true,
          notes: [],
        }));
      }
      if (message.type === "bot_message") socket.send(JSON.stringify({ type: "bot_message_ack", requestId: message.requestId, success: true }));
      if (message.type === "leave") socket.send(JSON.stringify({ type: "leave_ack", success: true }));
    });
  });
  await once(server, "listening");
  const host = `127.0.0.1:${server.address().port}`;
  const connection = once(server, "connection");
  service.start();
  await service.switchHost(host, "test");
  const [socket] = await connection;
  const joined = once(received, "join");
  assert.deepEqual(await service.join("self", "Standalone", "A test bot", ["curious"], "independent-adapter"), { success: true });
  const [joinPayload] = await joined;
  assert.equal(joinPayload.source, "independent-adapter");
  assert.equal(joinPayload.avatarId, "self");
  assert.equal(service.hasValidIdentity(), true);
  const identityPath = service.getConnectionStatus().identityPath;
  assert.deepEqual(JSON.parse(fs.readFileSync(identityPath, "utf8")), { avatarId: "self", authKey: "test-key" });

  const query = once(received, "query_status");
  assert.deepEqual(await service.queryStatus("status-1"), {
    type: "query_status_result", requestId: "status-1", isAvatarInScene: true, notes: [],
  });
  const [queryPayload] = await query;
  assert.equal(queryPayload.avatarId, "self");
  assert.equal(queryPayload.authKey, "test-key");
  await assert.rejects(service.queryStatus("wrong-response"), /Unexpected response type/);
  assert.equal(service.getConnectionStatus().pendingRequestCount, 0);

  const ack = await service.sendBotMessage("peer", 1, "Hello back");
  assert.equal(ack.success, true);
  const inbound = new Promise(resolve => { service.onBotMessageReceived = (_service, message) => resolve(message); });
  socket.send(JSON.stringify({ type: "bot_message_received", from: "peer", fromName: "Peer", depth: 2, bubble: "See you soon" }));
  assert.equal((await inbound).from, "peer");
  assert.deepEqual(service.readRecentBotMessageTranscript(30).map(({ direction, bubble }) => ({ direction, bubble })), [
    { direction: "sent", bubble: "Hello back" },
    { direction: "received", bubble: "See you soon" },
  ]);

  service.stop();
  const rejoined = once(received, "rejoin");
  restored = new KichiForwarderService(logger, serviceOptions);
  restored.start();
  assert.deepEqual((await rejoined)[0], { type: "rejoin", avatarId: "self", authKey: "test-key" });
  assert.equal(restored.readRecentBotMessageTranscript(30).length, 2);
  assert.deepEqual(await restored.leave(), { success: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(identityPath, "utf8")), { avatarId: "self" });
});
