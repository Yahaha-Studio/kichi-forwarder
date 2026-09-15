import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/", root), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("src/bridge.ts", root))],
  outfile: fileURLToPath(new URL("dist/bridge.mjs", root)),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  alias: {
    "@yahaha-studio/kichi-core": fileURLToPath(new URL("../kichi-core/src/index.ts", root)),
  },
  external: ["bufferutil", "utf-8-validate"],
  banner: {
    js: 'import { createRequire as __kichiCreateRequire } from "node:module"; const require = __kichiCreateRequire(import.meta.url);',
  },
  logLevel: "info",
});
await mkdir(new URL("config/", root), { recursive: true });
for (const name of ["kichi-config.json", "environments.json"]) {
  await copyFile(new URL(`../kichi-core/config/${name}`, root), new URL(`config/${name}`, root));
}

