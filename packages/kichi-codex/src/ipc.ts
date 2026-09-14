import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface BridgeConfig {
  profile: string;
  runtimeDir: string;
  socketPath: string;
  tokenPath: string;
  logPath: string;
}

export function getBridgeConfig(): BridgeConfig {
  const profile = process.env.KICHI_CODEX_PROFILE ?? 'default';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile)) {
    throw new Error('KICHI_CODEX_PROFILE must contain 1-64 letters, digits, underscores or hyphens.');
  }
  const codexHome = resolve(process.env.CODEX_HOME ?? join(homedir(), '.codex'));
  const runtimeDir = join(codexHome, 'kichi-codex', profile);
  const hash = createHash('sha256').update(process.platform === 'win32' ? runtimeDir.toLowerCase() : runtimeDir).digest('hex').slice(0, 24);
  return {
    profile,
    runtimeDir,
    socketPath: process.platform === 'win32' ? `\\\\.\\pipe\\kichi-codex-${hash}` : join(runtimeDir, 'bridge.sock'),
    tokenPath: join(runtimeDir, 'bridge-token'),
    logPath: join(runtimeDir, 'bridge.log'),
  };
}

export async function callBridge(
  config: BridgeConfig,
  path: '/ping' | '/hook' | '/tool' | '/stop',
  data: unknown = {},
  timeout = 60_000,
): Promise<unknown> {
  const token = (await readFile(config.tokenPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') throw new Error('Kichi bridge is not running. Run kichi-codex start first.');
    throw error;
  })).trim();
  if (!token) throw new Error('Kichi bridge token is empty. Restart the bridge.');
  const body = JSON.stringify(data);
  return new Promise((resolveResult, reject) => {
    const req = request({
      socketPath: config.socketPath,
      method: 'POST',
      path,
      agent: false,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let output = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { output += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try {
          const response = JSON.parse(output);
          if (res.statusCode !== 200) throw new Error(response.error ?? `Bridge HTTP ${res.statusCode}`);
          resolveResult(response.result);
        } catch (error) { reject(error); }
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error(`Kichi bridge ${path} timed out.`)), timeout);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end(body);
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
