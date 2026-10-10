import { createRequire as __kichiCreateRequire } from "node:module"; const require = __kichiCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/ipc.ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
var BridgeNotReadyError = class extends Error {
};
function getBridgeConfig() {
  const profile = process.env.KICHI_CODEX_PROFILE ?? "default";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile)) {
    throw new Error("KICHI_CODEX_PROFILE must contain 1-64 letters, digits, underscores or hyphens.");
  }
  const codexHome = resolve(process.env.CODEX_HOME ?? join(homedir(), ".codex"));
  const runtimeDir = join(codexHome, "kichi-codex", profile);
  const hash = createHash("sha256").update(process.platform === "win32" ? runtimeDir.toLowerCase() : runtimeDir).digest("hex").slice(0, 24);
  return {
    profile,
    runtimeDir,
    socketPath: process.platform === "win32" ? `\\\\.\\pipe\\kichi-codex-${hash}` : join(runtimeDir, "bridge.sock"),
    tokenPath: join(runtimeDir, "bridge-token"),
    logPath: join(runtimeDir, "bridge.log")
  };
}
async function callBridge(config, path, data = {}, timeout = 6e4) {
  const token = (await readFile(config.tokenPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") throw Object.assign(new Error("Kichi bridge is not running."), { code: "ENOENT" });
    throw error;
  })).trim();
  if (!token) throw new Error("Kichi bridge token is empty. Restart the bridge.");
  const body = JSON.stringify(data);
  return new Promise((resolveResult, reject) => {
    const req = request({
      socketPath: config.socketPath,
      method: "POST",
      path,
      agent: false,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body)
      }
    }, (res) => {
      let output = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        output += chunk;
      });
      res.on("error", reject);
      res.on("end", () => {
        try {
          const response = JSON.parse(output);
          if (res.statusCode === 503) throw new BridgeNotReadyError(response.error);
          if (res.statusCode !== 200) throw new Error(response.error ?? `Bridge HTTP ${res.statusCode}`);
          resolveResult(response.result);
        } catch (error) {
          reject(error);
        }
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error(`Kichi bridge ${path} timed out.`)), timeout);
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
    req.end(body);
  });
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export {
  __require,
  __commonJS,
  __export,
  __toESM,
  BridgeNotReadyError,
  getBridgeConfig,
  callBridge,
  errorMessage
};
