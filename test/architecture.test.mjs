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
const {
  KichiForwarderService,
  normalizeDiaryListInput,
  normalizeDiaryCreateInput,
  normalizeDiaryUpdateInput,
  normalizeDiaryIdInput,
} = await import("@yahaha-studio/kichi-core");
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
  const manifest = JSON.parse(fs.readFileSync(new URL("../packages/kichi-openclaw/openclaw.plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(registeredTools.map(({ options }) => options.name).sort(), [...manifest.contracts.tools].sort());
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

test("Diary validation preserves diary text and cursor precision while rejecting invalid requests", () => {
  const cursor = { cursorCreateTime: "2026-11-06T08:09:10.1234567+08:00", cursorId: "diary-1" };
  assert.deepEqual(normalizeDiaryListInput({}), {});
  assert.deepEqual(normalizeDiaryListInput({ start: 2147483647, count: 200 }), { start: 2147483647, count: 200 });
  assert.deepEqual(normalizeDiaryListInput(cursor), cursor);
  assert.deepEqual(normalizeDiaryIdInput({ id: " diary-1 " }), { id: "diary-1" });
  for (const mood of ["Happy", "Adore", "Amaze", "Bored", "Upset", "Mad"]) {
    const diary = { title: "", content: "  日记内容\n\n", mood };
    assert.deepEqual(normalizeDiaryCreateInput(diary), diary);
    assert.deepEqual(normalizeDiaryUpdateInput({ id: "diary-1", ...diary }), { id: "diary-1", ...diary });
  }
  const longestDiary = { title: "😀".repeat(10), content: "😀".repeat(500), mood: "Happy" };
  assert.deepEqual(normalizeDiaryCreateInput(longestDiary), longestDiary);
  const emptyDiary = { title: "", content: "", mood: "Happy" };
  for (const input of [
    { start: -1 }, { start: 0.5 }, { start: 2147483648 },
    { count: 0 }, { count: 201 }, { count: 1.5 }, { count: "20" },
    { cursorCreateTime: cursor.cursorCreateTime }, { cursorId: cursor.cursorId },
    { ...cursor, cursorId: " " }, { ...cursor, cursorCreateTime: "2026-11-06T08:09:10" },
    { ...cursor, cursorCreateTime: "not-a-date" }, { count: 20, unexpected: true },
  ]) assert.throws(() => normalizeDiaryListInput(input));
  for (const input of [
    { ...emptyDiary, title: "😀".repeat(11) }, { ...emptyDiary, content: "😀".repeat(501) },
    { ...emptyDiary, title: null }, { ...emptyDiary, content: null },
    { title: "", mood: "Happy" }, { content: "", mood: "Happy" },
    { ...emptyDiary, mood: "happy" }, { ...emptyDiary, mood: " Happy " },
    { ...emptyDiary, mood: 0 }, { ...emptyDiary, id: "caller-provided-id" },
  ]) assert.throws(() => normalizeDiaryCreateInput(input));
  assert.throws(() => normalizeDiaryUpdateInput(emptyDiary));
  for (const input of [{}, { id: " " }, { id: null }, { id: "diary-1", unexpected: true }]) {
    assert.throws(() => normalizeDiaryIdInput(input));
  }
});

test("OpenClaw diary tools route parameters and preserve server confirmation and errors", async (t) => {
  t.mock.method(KichiForwarderService.prototype, "isConnected", () => true);
  t.mock.method(KichiForwarderService.prototype, "hasValidIdentity", () => true);
  const calls = [];
  const cases = [
    ["list", "listDiaries", { start: 5, count: 10 }, { diaries: [], total: 5 }],
    ["get", "getDiary", { id: "diary-1" }, { diary: { id: "diary-1", title: "Saved" } }],
    ["create", "createDiary", { title: "", content: "First diary", mood: "Adore" }, { diary: { id: "created" }, clientRefreshNotified: false }],
    ["update", "updateDiary", { id: "diary-1", title: "New title", content: "", mood: "Upset" }, { diary: { id: "diary-1" }, clientRefreshNotified: true }],
    ["delete", "deleteDiary", { id: "diary-1" }, { clientRefreshNotified: false }],
  ];
  for (const [operation, method, input, response] of cases) {
    const requestId = `tool-diary-${operation}`;
    const ack = { type: `diary_${operation}_ack`, requestId, success: true, ...response };
    t.mock.method(KichiForwarderService.prototype, method, async (...args) => {
      calls.push({ method, args });
      if (operation === "get" && args[0].id === "missing") throw new Error("diary_not_found: Diary does not exist");
      return ack;
    });
    const { factory } = registeredTools.find(({ options }) => options.name === `kichi_diary_${operation}`);
    const tool = factory(toolContext);
    assert.deepEqual((await tool.execute("diary-adapter", { ...input, requestId })).details, ack);
    assert.deepEqual(calls.at(-1), { method, args: [input, requestId] });
  }
  const { factory } = registeredTools.find(({ options }) => options.name === "kichi_diary_get");
  assert.deepEqual((await factory(toolContext).execute("diary-error", { id: "missing" })).details, {
    success: false, error: "diary_not_found: Diary does not exist",
  });
});

test("Core joins, correlates requests, persists identity and bot history, and rejoins independently of OpenClaw", { timeout: 10000 }, async (t) => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const received = new EventEmitter();
  const runtimeDir = path.join(temporaryRoot, "independent-core");
  const serviceOptions = { agentId: "standalone", runtimeDir, resolveEnvironmentHost: () => null };
  const service = new KichiForwarderService(logger, serviceOptions);
  const diaryRequests = [];
  const savedDiary = {
    id: "diary-1", ownerId: "owner-1", createTime: "2026-11-06T08:09:10.1234567Z",
    updateTime: "2026-11-06T08:09:10.1234567Z", title: "", content: "  日记内容\n", mood: "Amaze",
  };
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
      if (message.type === "kichi_environment") {
        socket.send(JSON.stringify({
          type: "kichi_environment_ack", requestId: message.requestId, success: true, environment: message.environment,
        }));
      }
      if (message.type.startsWith("diary_")) {
        diaryRequests.push(message);
        if (message.id === "missing") {
          socket.send(JSON.stringify({ type: "command_error", requestId: message.requestId, errorCode: "diary_not_found", errorMessage: "Diary does not exist" }));
        } else {
          const result = message.type === "diary_list" ? { diaries: [savedDiary], total: 3 }
            : message.type === "diary_delete" ? { clientRefreshNotified: false }
            : { diary: savedDiary, ...(message.type === "diary_get" ? {} : { clientRefreshNotified: false }) };
          socket.send(JSON.stringify({
            type: message.requestId === "diary-wrong-ack" ? "diary_list_ack" : `${message.type}_ack`,
            requestId: message.requestId, success: true, ...result,
          }));
        }
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

  const ambientPatch = {
    ambientSoundOperations: [
      { title: "Light Rain", action: "Play" },
      { title: "Forest", action: "Play" },
      { title: "Light Rain", action: "Stop" },
    ],
    ambientSoundOverwrite: false,
    musicPaused: false,
  };
  const stopAll = { ambientSoundOperations: [], ambientSoundOverwrite: true };
  for (const [requestId, environment] of [["ambient-patch", ambientPatch], ["ambient-stop-all", stopAll]]) {
    const sent = once(received, "kichi_environment");
    assert.deepEqual(await service.sendEnvironmentControl(environment, requestId), {
      type: "kichi_environment_ack", requestId, success: true, environment,
    });
    assert.deepEqual((await sent)[0], {
      type: "kichi_environment", requestId, avatarId: "self", authKey: "test-key", environment,
    });
  }

  for (const operation of [
    { title: "light rain", action: "Play" },
    { title: " Light Rain", action: "Play" },
    { title: "Light Rain", action: "play" },
    { title: "Light Rain", action: "Play", volume: 0.5 },
  ]) {
    await assert.rejects(service.sendEnvironmentControl({ ambientSoundOperations: [operation] }), /ambientSoundOperations/);
  }
  await assert.rejects(service.sendEnvironmentControl({ ambientSoundOverwrite: false }), /ambientSoundOverwrite/);
  await assert.rejects(service.sendEnvironmentControl({ ambientSoundOperations: [], ambientSoundOverwrite: "true" }), /ambientSoundOverwrite/);

  const diaryText = { title: "", content: "  日记内容\n", mood: "Amaze" };
  for (const [operation, input, result] of [
    ["list", {}, { diaries: [savedDiary], total: 3 }],
    ["list", { start: 1, count: 200 }, { diaries: [savedDiary], total: 3 }],
    ["list", { cursorCreateTime: savedDiary.createTime, cursorId: savedDiary.id }, { diaries: [savedDiary], total: 3 }],
    ["get", { id: savedDiary.id }, { diary: savedDiary }],
    ["create", diaryText, { diary: savedDiary, clientRefreshNotified: false }],
    ["update", { id: savedDiary.id, ...diaryText }, { diary: savedDiary, clientRefreshNotified: false }],
    ["delete", { id: savedDiary.id }, { clientRefreshNotified: false }],
  ]) {
    const requestId = `diary-${diaryRequests.length}`;
    const method = operation === "list" ? "listDiaries" : `${operation}Diary`;
    assert.deepEqual(await service[method](input, requestId), { type: `diary_${operation}_ack`, requestId, success: true, ...result });
    assert.deepEqual(diaryRequests.at(-1), { ...input, type: `diary_${operation}`, requestId, avatarId: "self", authKey: "test-key" });
  }
  const validRequestCount = diaryRequests.length;
  await assert.rejects(async () => service.listDiaries({ count: 201 }));
  await assert.rejects(async () => service.getDiary({ id: " " }));
  await assert.rejects(async () => service.createDiary({ ...diaryText, mood: "amaze" }));
  await assert.rejects(async () => service.updateDiary({ id: savedDiary.id, title: "", mood: "Happy" }));
  await assert.rejects(async () => service.deleteDiary({ id: savedDiary.id, unexpected: true }));
  assert.equal(diaryRequests.length, validRequestCount);
  await assert.rejects(service.getDiary({ id: "missing" }, "diary-error"), /diary_not_found: Diary does not exist/);
  await assert.rejects(service.getDiary({ id: savedDiary.id }, "diary-wrong-ack"), /Unexpected response type/);
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
