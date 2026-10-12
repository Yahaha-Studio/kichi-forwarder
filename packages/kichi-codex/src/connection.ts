import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { BridgeConfig } from './ipc.js';

export const DEFAULT_MCP_URL = 'https://focus-steam-playtest-int.yahaha.com/mcp';

export interface ConnectionConfig {
  serverUrl: string;
  token: string;
}

function validateConnection(value: unknown): ConnectionConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MCP connection configuration must be an object.');
  }
  const config = value as Record<string, unknown>;
  if (Object.keys(config).some((key) => key !== 'serverUrl' && key !== 'token')) {
    throw new Error('Unknown MCP connection configuration field.');
  }
  if (typeof config.serverUrl !== 'string' || typeof config.token !== 'string' || !config.token.trim()) {
    throw new Error('MCP serverUrl and a non-empty token are required.');
  }
  const url = new URL(config.serverUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('MCP serverUrl must be an HTTP(S) URL without embedded credentials or a fragment.');
  }
  return { serverUrl: url.href, token: config.token.trim() };
}

export async function readConnectionConfig(config: BridgeConfig): Promise<ConnectionConfig> {
  let text: string;
  try {
    text = await readFile(config.connectionPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('MCP connection is not configured. Run kichi-codex configure --token-file PATH [--server-url URL].');
    }
    throw error;
  }
  return validateConnection(JSON.parse(text));
}

export async function configureConnection(config: BridgeConfig, serverUrl: string, tokenFile: string): Promise<void> {
  const connection = validateConnection({ serverUrl, token: await readFile(tokenFile, 'utf8') });
  await mkdir(config.runtimeDir, { recursive: true, mode: 0o700 });
  await writeFile(config.connectionPath, `${JSON.stringify(connection, null, 2)}\n`, { mode: 0o600 });
}
