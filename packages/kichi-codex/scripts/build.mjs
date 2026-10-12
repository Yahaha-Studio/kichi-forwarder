import { build } from 'esbuild';
import { mkdir, readdir, unlink } from 'node:fs/promises';
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
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: 'import { createRequire as __kichiCreateRequire } from "node:module"; const require = __kichiCreateRequire(import.meta.url);',
  },
  logLevel: 'info',
});
