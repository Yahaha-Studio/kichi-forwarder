import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [coreInstallDir, pluginInstallDir, openClawHostDir] = process.argv.slice(2);
assert.ok(coreInstallDir && pluginInstallDir && openClawHostDir,
  "Usage: node test/package-install-smoke.mjs <core-alone-install-dir> <plugin-install-dir> <openclaw-host-dir>");

// ESM eval resolves package names from cwd, so these checks cannot use workspace links.
async function checkInstallation(mode, hostRoot) {
  const { default: assert } = await import("node:assert/strict");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { default: os } = await import("node:os");
  const { pathToFileURL } = await import("node:url");
  const { registerHooks, syncBuiltinESMExports } = await import("node:module");
  const coreName = "@yahaha-studio/kichi-core";
  const pluginName = "@yahaha-studio/kichi-forwarder";
  const coreDir = path.join(process.cwd(), "node_modules", coreName);
  const pluginDir = path.join(process.cwd(), "node_modules", pluginName);
  const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

  assert.equal(fs.existsSync(path.join(process.cwd(), "node_modules", "openclaw")), false);
  assert.throws(() => import.meta.resolve("openclaw/plugin-sdk/agent-runtime"), { code: "ERR_MODULE_NOT_FOUND" });
  assert.equal(fs.lstatSync(coreDir).isSymbolicLink(), false);
  if (mode === "core") {
    assert.equal(fs.existsSync(pluginDir), false);
    assert.throws(() => import.meta.resolve(pluginName), { code: "ERR_MODULE_NOT_FOUND" });
  }

  const pluginCoreImports = [];
  const pluginSdkImports = [];
  const pluginRootUrl = pathToFileURL(pluginDir + path.sep).href;
  const sdkHook = registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      if (specifier.startsWith("openclaw/") && context.parentURL?.startsWith(pluginRootUrl)) {
        pluginSdkImports.push(result.url);
      }
      if (specifier === coreName && context.parentURL?.startsWith(pluginRootUrl)) {
        pluginCoreImports.push(result.url);
      }
      return result;
    },
  });

  const coreEntry = import.meta.resolve(coreName);
  const core = await import(coreName);
  assert.equal(coreEntry, pathToFileURL(path.join(coreDir, "dist", "index.js")).href);
  assert.equal(typeof core.KichiForwarderService, "function");
  assert.equal(core.getActionDefinition("sit", "Thinking").name, "Thinking");
  assert.ok(core.getMusicTitleEnum().length > 0);
  assert.ok(Object.hasOwn(core.loadEnvironmentsConfig(), "test"));
  const coreManifest = readJson(path.join(coreDir, "package.json"));
  assert.ok(fs.statSync(path.join(coreDir, coreManifest.exports["."].types)).isFile());

  if (mode === "plugin") {
    assert.equal(fs.lstatSync(pluginDir).isSymbolicLink(), false);
    const pluginManifest = readJson(path.join(pluginDir, "package.json"));
    assert.equal(pluginManifest.dependencies[coreName], coreManifest.version);
    assert.equal(typeof pluginManifest.peerDependencies.openclaw, "string");
    assert.ok(pluginManifest.openclaw.extensions.length > 0);
    assert.ok(pluginManifest.openclaw.runtimeExtensions.length > 0);
    for (const entry of [...pluginManifest.openclaw.extensions, ...pluginManifest.openclaw.runtimeExtensions]) {
      assert.ok(fs.statSync(path.join(pluginDir, entry)).isFile(), `Missing plugin entry: ${entry}`);
    }
    const manifest = readJson(path.join(pluginDir, "openclaw.plugin.json"));
    assert.ok(manifest.skills.length > 0);
    for (const skill of manifest.skills) {
      assert.ok(fs.statSync(path.join(pluginDir, skill, "SKILL.md")).isFile(), `Missing declared skill: ${skill}`);
    }
    for (const copiedCoreDir of ["core", "src/core", "dist/core", "dist/src/core"]) {
      assert.equal(fs.existsSync(path.join(pluginDir, copiedCoreDir)), false, `Core copied into plugin: ${copiedCoreDir}`);
    }

    os.homedir = () => path.join(process.cwd(), ".smoke-home");
    syncBuiltinESMExports();
    assert.equal(readJson(path.join(hostRoot, "package.json")).name, "openclaw");
    const pluginDependencies = path.join(pluginDir, "node_modules");
    fs.mkdirSync(pluginDependencies, { recursive: true });
    fs.symlinkSync(hostRoot, path.join(pluginDependencies, "openclaw"), process.platform === "win32" ? "junction" : "dir");
    const { default: plugin } = await import(pluginName);
    assert.equal(plugin.id, manifest.id);
    const registeredTools = [];
    const services = [];
    plugin.register({
      logger: Object.fromEntries(["debug", "info", "warn", "error"].map(level => [level, () => {}])),
      on() {},
      registerTool(_factory, options) { registeredTools.push(options.name); },
      registerService(service) { services.push(service); },
    });
    assert.deepEqual(registeredTools.sort(), [...manifest.contracts.tools].sort());
    assert.ok(pluginCoreImports.length > 0, "Plugin did not import its core dependency");
    assert.ok(pluginCoreImports.every(entry => entry === coreEntry));
    assert.ok(pluginSdkImports.length > 0, "Plugin did not import its host SDK");
    const hostRootUrl = pathToFileURL(fs.realpathSync(hostRoot) + path.sep).href;
    assert.ok(pluginSdkImports.every(entry => entry.startsWith(hostRootUrl)), "Plugin imported a different OpenClaw SDK");
    for (const service of services) await service.stop();
  }

  sdkHook.deregister();
  console.log(`${mode} installation smoke passed`);
}

for (const [mode, directory] of [["core", coreInstallDir], ["plugin", pluginInstallDir]]) {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `(${checkInstallation.toString()})(${JSON.stringify(mode)}, ${JSON.stringify(path.resolve(openClawHostDir))})`], {
    cwd: path.resolve(directory),
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${mode} installation smoke failed`);
}
