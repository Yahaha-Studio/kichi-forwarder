import { build } from 'esbuild';
import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await mkdir(dist, { recursive: true });
// Only remove generated JavaScript in this package's output directory.
for (const entry of await readdir(dist, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) await unlink(new URL(entry.name, dist));
}
await build({
  entryPoints: [fileURLToPath(new URL('src/cli.ts', root))],
  outdir: fileURLToPath(dist),
  bundle: true,
  splitting: true,
  chunkNames: '[name]-[hash]',
  platform: 'node',
  target: 'node22',
  format: 'esm',
  alias: {
    '@yahaha-studio/kichi-core': fileURLToPath(new URL('../kichi-core/src/index.ts', root)),
  },
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: 'import { createRequire as __kichiCreateRequire } from "node:module"; const require = __kichiCreateRequire(import.meta.url);',
  },
  logLevel: 'info',
});
await mkdir(new URL('config/', root), { recursive: true });
for (const name of ['kichi-config.json', 'environments.json']) {
  await copyFile(new URL(`../kichi-core/config/${name}`, root), new URL(`config/${name}`, root));
}
