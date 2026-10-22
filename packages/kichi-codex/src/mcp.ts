import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { callBridge, errorMessage, type BridgeConfig } from './ipc.js';

export async function runMcp(config: BridgeConfig): Promise<void> {
  const server = new Server({ name: 'kichi', version: '0.2.0-beta.10' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async ({ params }) =>
    await callBridge(config, '/tools/list', params ?? {}) as ListToolsResult);
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      return await callBridge(config, '/tool', params) as CallToolResult;
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] };
    }
  });
  server.onerror = (error) => process.stderr.write(`[kichi-mcp] ${errorMessage(error)}\n`);
  await server.connect(new StdioServerTransport());
}
