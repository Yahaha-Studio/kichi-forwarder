import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolRequest, CallToolResult, ListToolsRequest } from '@modelcontextprotocol/sdk/types.js';
import type { ConnectionConfig } from './connection.js';

export function requireToolSuccess(name: string, result: CallToolResult): void {
  if (result.isError || result.structuredContent?.success === false) {
    throw new Error(`${name} failed: ${JSON.stringify(result)}`);
  }
}

export class KichiMcpClient {
  private readonly client = new Client({ name: 'kichi-codex', version: '0.2.0-beta.6' }, { capabilities: {} });
  private avatarId: string | undefined;

  constructor(private readonly config: ConnectionConfig) {}

  get selectedAvatarId(): string | undefined {
    return this.avatarId;
  }

  async connect(): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(this.config.serverUrl), {
      requestInit: { headers: { Authorization: `Bearer ${this.config.token}` }, redirect: 'error' },
    });
    await this.client.connect(transport);
  }

  listTools(params?: ListToolsRequest['params']) {
    return this.client.listTools(params);
  }

  async callTool(params: CallToolRequest['params'], timeout = 60_000): Promise<CallToolResult> {
    const request = params.arguments?.request as Record<string, unknown> | undefined;
    const avatarId = typeof request?.avatarId === 'string' ? request.avatarId : undefined;
    if ((params.name === 'kichi_join' || params.name === 'kichi_rejoin') && this.avatarId && avatarId !== this.avatarId) {
      throw new Error('Leave the current avatar before joining another avatar in this profile.');
    }
    const result = await this.client.callTool(params, undefined, { timeout }) as CallToolResult;
    if (result.isError || result.structuredContent?.success === false) return { ...result, isError: true };
    if (params.name === 'kichi_join' || params.name === 'kichi_rejoin') {
      if (!avatarId || result.structuredContent?.success !== true) {
        throw new Error(`${params.name} returned an invalid join result.`);
      }
      this.avatarId = avatarId;
    } else if (params.name === 'kichi_leave' && avatarId === this.avatarId) {
      this.avatarId = undefined;
    }
    return result;
  }

  async status(): Promise<unknown> {
    if (!this.avatarId) return { serverUrl: this.config.serverUrl, avatarId: null, connected: false };
    const result = await this.callTool({ name: 'kichi_connection_status', arguments: { request: { avatarId: this.avatarId } } });
    requireToolSuccess('kichi_connection_status', result);
    return { serverUrl: this.config.serverUrl, avatarId: this.avatarId, ...result.structuredContent };
  }

  async close(): Promise<void> {
    try {
      if (this.avatarId) {
        const result = await this.callTool({ name: 'kichi_leave', arguments: { request: { avatarId: this.avatarId } } });
        requireToolSuccess('kichi_leave', result);
      }
    } finally {
      await this.client.close();
    }
  }
}
