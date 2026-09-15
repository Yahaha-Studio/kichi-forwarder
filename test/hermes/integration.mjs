import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

// This fixture supplies Kichi's wire responses. Hermes itself is imported from
// the supplied checkout, and every tool is called through its real registry.
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
assert.ok(args.includes("--python") && args.includes("--hermes-source"),
  "Usage: node test/hermes/integration.mjs --python <venv-python> --hermes-source <checkout>");
const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "../../packages/kichi-hermes");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kichi-hermes-integration-"));
const home = path.join(temporaryRoot, "home");
fs.mkdirSync(path.join(home, "plugins"), { recursive: true });
fs.cpSync(pluginRoot, path.join(home, "plugins", "kichi"), { recursive: true });
fs.writeFileSync(path.join(home, "config.yaml"), "plugins:\n  enabled: [kichi]\n", "utf8");
const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
const frames = [];
const sessions = [];
let currentSocket;
server.on("connection", (socket, request) => {
  assert.equal(request.url, "/ws/openclaw");
  currentSocket = socket;
  socket.on("message", data => {
    const message = JSON.parse(data.toString());
    frames.push(message);
    if (message.type === "join") socket.send(JSON.stringify({ type: "join_ack", success: true, authKey: "integration-key" }));
    if (message.type === "query_status") socket.send(JSON.stringify({
      type: "query_status_result", requestId: message.requestId, isAvatarInScene: true, notes: [],
    }));
    if (message.type === "status" && message.requestId) socket.send(JSON.stringify({
      type: "status_ack", requestId: message.requestId, poseType: message.poseType, action: message.action,
    }));
    if (message.type === "bot_message") socket.send(JSON.stringify({
      type: "bot_message_ack", requestId: message.requestId, success: true,
    }));
    if (message.type === "leave") socket.send(JSON.stringify({ type: "leave_ack", success: true }));
  });
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function deadline(promise, label, ms = 20000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  })]).finally(() => clearTimeout(timer));
}

function startHermes() {
  const child = spawn(option("--python"), [path.join(here, "hermes_driver.py"),
    "--hermes-source", path.resolve(option("--hermes-source")), "--home", home], {
    env: { ...process.env, HERMES_HOME: home, PYTHONUTF8: "1" }, windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const ready = deferred();
  const exited = deferred();
  const pending = new Map();
  let sequence = 0;
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { stderr += chunk; });
  createInterface({ input: child.stdout }).on("line", line => {
    if (!line.startsWith("KICHI_TEST ")) return;
    const value = JSON.parse(line.slice("KICHI_TEST ".length));
    if (value.event === "ready") { ready.resolve(value); return; }
    if (value.event === "fatal") { ready.reject(new Error(value.error)); return; }
    const reply = pending.get(value.id);
    if (!reply) throw new Error(`Unknown driver response: ${line}`);
    pending.delete(value.id);
    if (value.error) reply.reject(new Error(value.error));
    else reply.resolve(value.result);
  });
  child.once("error", error => { ready.reject(error); exited.resolve({ error }); });
  child.once("exit", (code, signal) => {
    const error = new Error(`Hermes driver exited (${code ?? signal}): ${stderr}`);
    ready.reject(error);
    for (const reply of pending.values()) reply.reject(error);
    pending.clear();
    exited.resolve({ code, signal, stderr });
  });
  const session = {
    child, exited: exited.promise, ready: deadline(ready.promise, "Hermes plugin loading"),
    async call(method, params = {}) {
      const id = ++sequence;
      const reply = deferred();
      pending.set(id, reply);
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
      return deadline(reply.promise, `Hermes ${method}`);
    },
    async close() {
      if (child.exitCode !== null) return;
      await this.call("exit");
      child.stdin.end();
      const result = await deadline(exited.promise, "Hermes shutdown");
      assert.equal(result.code, 0, result.stderr);
    },
  };
  sessions.push(session);
  return session;
}

async function waitUntil(read, accept, label) {
  const limit = Date.now() + 3000;
  while (true) {
    const result = await read();
    if (accept(result)) return result;
    if (Date.now() >= limit) throw new Error(`${label} did not arrive: ${JSON.stringify(result)}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

const tool = (session, name, parameters = {}) => session.call("tool", { name, arguments: parameters });
const hook = (session, name, values) => session.call("hook", { name, values });
const stopped = pid => {
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, `Bridge ${pid} must have exited`);
};

try {
  await once(server, "listening");
  const host = `127.0.0.1:${server.address().port}`;
  const first = startHermes();
  const metadata = await first.ready;
  assert.equal(metadata.tool_count, 15);
  const config = await tool(first, "kichi_get_config");
  const action = config.actions.stand[0].name;
  const actionArgs = { poseType: "stand", action, avatarStatus: metadata.avatar_status };
  for (const [name, parameters] of [
    ["kichi_join", { environment: "test", host, avatarId: "self", unexpected: true }],
    ["kichi_action", { ...actionArgs, verify: "true" }],
    ["kichi_bot_message", { toAvatarId: "peer", depth: -1, bubble: "invalid" }],
  ]) {
    const count = frames.length;
    assert.match((await tool(first, name, parameters)).error, /Unknown parameter|boolean|>=/);
    assert.equal(frames.length, count, `${name} rejected parameters must not send a packet`);
  }
  assert.deepEqual(await tool(first, "kichi_join", {
    environment: "test", host, avatarId: "self", botName: "Hermes Test", bio: "Integration fixture", tags: ["curious"],
  }), { confirmed: true, avatarId: "self", environment: "test" });
  assert.equal(frames.find(frame => frame.type === "join").source, "hermes");
  assert.equal((await tool(first, "kichi_connection_status")).hasAuthKey, true);
  assert.equal((await tool(first, "kichi_query_status", { requestId: "hermes-status" })).isAvatarInScene, true);
  assert.deepEqual(await tool(first, "kichi_action", actionArgs), { confirmed: true, poseType: "stand", action });

  await hook(first, "pre_llm_call", { user_message: "Hello from the user", platform: "cli" });
  await hook(first, "post_llm_call", { assistant_response: "Hello from Hermes", platform: "cli" });
  assert.ok(frames.some(frame => JSON.stringify(frame).includes("Hello from the user")));
  assert.ok(frames.some(frame => JSON.stringify(frame).includes("Hello from Hermes")));
  await first.call("set_runtime", { enabled: false });
  const beforeDisabled = frames.length;
  assert.deepEqual(await hook(first, "pre_llm_call", { user_message: "Muted input", platform: "cli" }), []);
  await hook(first, "post_llm_call", { assistant_response: "Muted output", platform: "cli" });
  assert.equal(frames.length, beforeDisabled, "Disabled runtime must suppress chat hook packets");
  await first.call("set_runtime", { enabled: true });
  const inbound = { type: "bot_message_received", from: "peer", fromName: "Peer", depth: 2, bubble: "A visitor says hello" };
  currentSocket.send(JSON.stringify(inbound));
  const history = await waitUntil(() => tool(first, "kichi_bot_message_history", { limit: 30 }),
    value => value.entries?.some(entry => entry.direction === "received" && entry.bubble === inbound.bubble), "Inbound bot history");
  assert.equal(history.entries.find(entry => entry.direction === "received").from, "peer");
  const context = await waitUntil(() => hook(first, "pre_llm_call", { user_message: "", platform: "test" }),
    value => JSON.stringify(value).includes(inbound.bubble), "Next-turn bot context");
  assert.ok(JSON.stringify(context).includes("external conversation data"));
  assert.equal((await tool(first, "kichi_bot_message", { toAvatarId: "peer", depth: 3, bubble: "Hello back" })).success, true);
  assert.equal((await tool(first, "kichi_bot_message_history", { limit: 30 })).entries.length, 2);

  const contender = startHermes();
  await assert.rejects(contender.ready, /already running|profile|Kichi plugin failed/i);
  assert.notEqual((await deadline(contender.exited, "Concurrent profile rejection")).code, 0);
  assert.equal((await tool(first, "kichi_connection_status")).connected, true);
  await first.close();
  stopped(metadata.bridge_pid);

  const beforeRestart = frames.length;
  const second = startHermes();
  const restored = await second.ready;
  await waitUntil(async () => frames.slice(beforeRestart), value => value.some(frame => frame.type === "rejoin"), "Saved-identity rejoin");
  assert.deepEqual(frames.slice(beforeRestart).find(frame => frame.type === "rejoin"), {
    type: "rejoin", avatarId: "self", authKey: "integration-key",
  });
  assert.equal((await tool(second, "kichi_bot_message_history", { limit: 30 })).entries.length, 2);
  assert.deepEqual(await tool(second, "kichi_leave"), { confirmed: true });
  assert.equal((await tool(second, "kichi_connection_status")).hasAuthKey, false);
  await second.call("kill_bridge");
  assert.match((await tool(second, "kichi_get_config")).error, /exited|closed|write|pipe/i);
  stopped(restored.bridge_pid);
  await second.close();

  const third = startHermes();
  const afterFailure = await third.ready;
  assert.equal((await tool(third, "kichi_connection_status")).hasAuthKey, false);
  await third.close();
  stopped(afterFailure.bridge_pid);
  console.log("PASS: real Hermes loader/registry; 15 tools; validation without packets; Hermes join; status/action ACK; hooks/runtime toggle; bot history/next-turn context/send ACK; profile lock; saved identity rejoin; leave; bridge death and cleanup.");
} finally {
  for (const session of sessions) {
    if (session.child.exitCode === null) {
      session.child.stdin.end();
      await deadline(session.exited, "Fixture cleanup", 12000).catch(() => session.child.kill());
    }
  }
  for (const socket of server.clients) socket.terminate();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
