import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ErrorCode, ListToolsResultSchema, McpError, ToolSchema, type CallToolRequest, type CallToolResult, type ListToolsRequest } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import type { JsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/types.js';
import { z } from 'zod/v4';
import type { ConnectionConfig } from './connection.js';

// JSON Schema permits boolean property schemas; preserve the remote definitions.
const listToolsResultSchema = ListToolsResultSchema.extend({
  tools: ToolSchema.extend({
    outputSchema: ToolSchema.shape.outputSchema.unwrap().extend({
      properties: z.record(z.string(), z.union([z.boolean(), z.looseObject({})])).optional(),
    }).optional(),
  }).array(),
});

export function requireToolSuccess(name: string, result: CallToolResult): void {
  if (result.isError || result.structuredContent?.success === false) {
    throw new Error(`${name} failed: ${JSON.stringify(result)}`);
  }
}

export class KichiMcpClient {
  private readonly jsonSchemaValidator = new AjvJsonSchemaValidator();
  private readonly client = new Client({ name: 'kichi-codex', version: '0.2.0-beta.6' }, {
    capabilities: {}, jsonSchemaValidator: this.jsonSchemaValidator,
  });
  private readonly outputValidators = new Map<string, JsonSchemaValidator<unknown>>();
  private readonly requiredTaskTools = new Set<string>();
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

  async listTools(params?: ListToolsRequest['params']) {
    const result = await this.client.request({ method: 'tools/list', params }, listToolsResultSchema);
    this.outputValidators.clear();
    this.requiredTaskTools.clear();
    for (const tool of result.tools) {
      if (tool.outputSchema) {
        this.outputValidators.set(tool.name, this.jsonSchemaValidator.getValidator(tool.outputSchema));
      }
      if (tool.execution?.taskSupport === 'required') this.requiredTaskTools.add(tool.name);
    }
    return result;
  }

  async callTool(params: CallToolRequest['params'], timeout = 60_000): Promise<CallToolResult> {
    if (this.requiredTaskTools.has(params.name)) {
      throw new McpError(ErrorCode.InvalidRequest, `Tool ${params.name} requires a task-augmented call.`);
    }
    const request = params.arguments?.request as Record<string, unknown> | undefined;
    const avatarId = typeof request?.avatarId === 'string' ? request.avatarId : undefined;
    if ((params.name === 'kichi_join' || params.name === 'kichi_rejoin') && this.avatarId && avatarId !== this.avatarId) {
      throw new Error('Leave the current avatar before joining another avatar in this profile.');
    }
    const result = await this.client.callTool(params, undefined, { timeout }) as CallToolResult;
    const validator = this.outputValidators.get(params.name);
    if (validator) {
      if (!result.structuredContent && !result.isError) {
        throw new McpError(ErrorCode.InvalidRequest, `Tool ${params.name} has an output schema but did not return structured content`);
      }
      if (result.structuredContent) {
        const validation = validator(result.structuredContent);
        if (!validation.valid) {
          throw new McpError(ErrorCode.InvalidParams, `Structured content does not match the tool's output schema: ${validation.errorMessage}`);
        }
      }
    }
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
