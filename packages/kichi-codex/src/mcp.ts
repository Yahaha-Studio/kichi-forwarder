import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { callBridge, errorMessage, type BridgeConfig } from './ipc.js';
import { describeKichiOperation, listKichiOperations } from './tools.js';

const actions = [...listKichiOperations()];
export const tools: Tool[] = [
  {
    name: 'kichi',
    description: 'Use Kichi avatar/world tools. Call kichi_describe for an action’s parameters when needed.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: actions },
        parameters: { type: 'object', additionalProperties: true },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'kichi_describe',
    description: 'Get parameters for one Kichi action. Lifecycle feedback is automatic; no tool calls needed.',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: actions } },
      required: ['action'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

export async function runMcp(config: BridgeConfig): Promise<void> {
  const server = new Server({ name: 'kichi', version: '0.2.0-beta.1' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const args = params.arguments;
      if (!args || typeof args.action !== 'string') throw new Error('action is required.');
      const allowedKeys = params.name === 'kichi_describe' ? ['action'] : ['action', 'parameters'];
      for (const key of Object.keys(args)) {
        if (!allowedKeys.includes(key)) throw new Error(`Unknown argument: ${key}`);
      }
      let result: unknown;
      if (params.name === 'kichi_describe') {
        result = describeKichiOperation(args.action);
      } else if (params.name === 'kichi') {
        result = await callBridge(config, '/tool', { action: args.action, parameters: args.parameters === undefined ? {} : args.parameters });
      } else {
        throw new Error(`Unknown tool: ${params.name}`);
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] };
    }
  });
  server.onerror = (error) => process.stderr.write(`[kichi-mcp] ${errorMessage(error)}\n`);
  await server.connect(new StdioServerTransport());
}
