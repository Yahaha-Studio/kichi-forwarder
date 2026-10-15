import { createRequire as __kichiCreateRequire } from "node:module"; const require = __kichiCreateRequire(import.meta.url);
import {
  HookTracker,
  parseHook,
  readConnectionConfig
} from "./chunk-SZZF527N.js";
import {
  AjvJsonSchemaValidator,
  CallToolResultSchema,
  CompleteResultSchema,
  CreateMessageRequestSchema,
  CreateMessageResultSchema,
  CreateMessageResultWithToolsSchema,
  CreateTaskResultSchema,
  ElicitRequestSchema,
  ElicitResultSchema,
  EmptyResultSchema,
  ErrorCode,
  GetPromptResultSchema,
  InitializeResultSchema,
  JSONRPCMessageSchema,
  LATEST_PROTOCOL_VERSION,
  ListChangedOptionsBaseSchema,
  ListPromptsResultSchema,
  ListResourceTemplatesResultSchema,
  ListResourcesResultSchema,
  ListToolsResultSchema,
  McpError,
  NEVER,
  PromptListChangedNotificationSchema,
  Protocol,
  ReadResourceResultSchema,
  ResourceListChangedNotificationSchema,
  SUPPORTED_PROTOCOL_VERSIONS,
  ToolListChangedNotificationSchema,
  ToolSchema,
  ZodIssueCode,
  any,
  array,
  assertClientRequestTaskCapability,
  assertToolsCallTaskCapability,
  boolean,
  coerce_exports,
  external_exports,
  getLiteralValue,
  getObjectShape,
  isInitializedNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  literal,
  looseObject,
  mergeCapabilities,
  number,
  object,
  safeParse,
  string,
  url
} from "./chunk-COQX75PR.js";
import {
  __commonJS,
  __toESM,
  errorMessage
} from "./chunk-F3QS47XT.js";

// ../../node_modules/content-type/index.js
var require_content_type = __commonJS({
  "../../node_modules/content-type/index.js"(exports) {
    "use strict";
    var PARAM_REGEXP = /; *([!#$%&'*+.^_`|~0-9A-Za-z-]+) *= *("(?:[\u000b\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\u000b\u0020-\u00ff])*"|[!#$%&'*+.^_`|~0-9A-Za-z-]+) */g;
    var TEXT_REGEXP = /^[\u000b\u0020-\u007e\u0080-\u00ff]+$/;
    var TOKEN_REGEXP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
    var QESC_REGEXP = /\\([\u000b\u0020-\u00ff])/g;
    var QUOTE_REGEXP = /([\\"])/g;
    var TYPE_REGEXP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
    exports.format = format;
    exports.parse = parse;
    function format(obj) {
      if (!obj || typeof obj !== "object") {
        throw new TypeError("argument obj is required");
      }
      var parameters = obj.parameters;
      var type = obj.type;
      if (!type || !TYPE_REGEXP.test(type)) {
        throw new TypeError("invalid type");
      }
      var string2 = type;
      if (parameters && typeof parameters === "object") {
        var param;
        var params = Object.keys(parameters).sort();
        for (var i = 0; i < params.length; i++) {
          param = params[i];
          if (!TOKEN_REGEXP.test(param)) {
            throw new TypeError("invalid parameter name");
          }
          string2 += "; " + param + "=" + qstring(parameters[param]);
        }
      }
      return string2;
    }
    function parse(string2) {
      if (!string2) {
        throw new TypeError("argument string is required");
      }
      var header = typeof string2 === "object" ? getcontenttype(string2) : string2;
      if (typeof header !== "string") {
        throw new TypeError("argument string is required to be a string");
      }
      var index = header.indexOf(";");
      var type = index !== -1 ? header.slice(0, index).trim() : header.trim();
      if (!TYPE_REGEXP.test(type)) {
        throw new TypeError("invalid media type");
      }
      var obj = new ContentType(type.toLowerCase());
      if (index !== -1) {
        var key;
        var match;
        var value;
        PARAM_REGEXP.lastIndex = index;
        while (match = PARAM_REGEXP.exec(header)) {
          if (match.index !== index) {
            throw new TypeError("invalid parameter format");
          }
          index += match[0].length;
          key = match[1].toLowerCase();
          value = match[2];
          if (value.charCodeAt(0) === 34) {
            value = value.slice(1, -1);
            if (value.indexOf("\\") !== -1) {
              value = value.replace(QESC_REGEXP, "$1");
            }
          }
          obj.parameters[key] = value;
        }
        if (index !== header.length) {
          throw new TypeError("invalid parameter format");
        }
      }
      return obj;
    }
    function getcontenttype(obj) {
      var header;
      if (typeof obj.getHeader === "function") {
        header = obj.getHeader("content-type");
      } else if (typeof obj.headers === "object") {
        header = obj.headers && obj.headers["content-type"];
      }
      if (typeof header !== "string") {
        throw new TypeError("content-type header is missing from object");
      }
      return header;
    }
    function qstring(val) {
      var str = String(val);
      if (TOKEN_REGEXP.test(str)) {
        return str;
      }
      if (str.length > 0 && !TEXT_REGEXP.test(str)) {
        throw new TypeError("invalid parameter value");
      }
      return '"' + str.replace(QUOTE_REGEXP, "\\$1") + '"';
    }
    function ContentType(type) {
      this.parameters = /* @__PURE__ */ Object.create(null);
      this.type = type;
    }
  }
});

// src/runtime.ts
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";

// ../../node_modules/@modelcontextprotocol/sdk/dist/esm/experimental/tasks/client.js
var ExperimentalClientTasks = class {
  constructor(_client) {
    this._client = _client;
  }
  /**
   * Calls a tool and returns an AsyncGenerator that yields response messages.
   * The generator is guaranteed to end with either a 'result' or 'error' message.
   *
   * This method provides streaming access to tool execution, allowing you to
   * observe intermediate task status updates for long-running tool calls.
   * Automatically validates structured output if the tool has an outputSchema.
   *
   * @example
   * ```typescript
   * const stream = client.experimental.tasks.callToolStream({ name: 'myTool', arguments: {} });
   * for await (const message of stream) {
   *   switch (message.type) {
   *     case 'taskCreated':
   *       console.log('Tool execution started:', message.task.taskId);
   *       break;
   *     case 'taskStatus':
   *       console.log('Tool status:', message.task.status);
   *       break;
   *     case 'result':
   *       console.log('Tool result:', message.result);
   *       break;
   *     case 'error':
   *       console.error('Tool error:', message.error);
   *       break;
   *   }
   * }
   * ```
   *
   * @param params - Tool call parameters (name and arguments)
   * @param resultSchema - Zod schema for validating the result (defaults to CallToolResultSchema)
   * @param options - Optional request options (timeout, signal, task creation params, etc.)
   * @returns AsyncGenerator that yields ResponseMessage objects
   *
   * @experimental
   */
  async *callToolStream(params, resultSchema = CallToolResultSchema, options) {
    const clientInternal = this._client;
    const optionsWithTask = {
      ...options,
      // We check if the tool is known to be a task during auto-configuration, but assume
      // the caller knows what they're doing if they pass this explicitly
      task: options?.task ?? (clientInternal.isToolTask(params.name) ? {} : void 0)
    };
    const stream = clientInternal.requestStream({ method: "tools/call", params }, resultSchema, optionsWithTask);
    const validator = clientInternal.getToolOutputValidator(params.name);
    for await (const message of stream) {
      if (message.type === "result" && validator) {
        const result = message.result;
        if (!result.structuredContent && !result.isError) {
          yield {
            type: "error",
            error: new McpError(ErrorCode.InvalidRequest, `Tool ${params.name} has an output schema but did not return structured content`)
          };
          return;
        }
        if (result.structuredContent) {
          try {
            const validationResult = validator(result.structuredContent);
            if (!validationResult.valid) {
              yield {
                type: "error",
                error: new McpError(ErrorCode.InvalidParams, `Structured content does not match the tool's output schema: ${validationResult.errorMessage}`)
              };
              return;
            }
          } catch (error) {
            if (error instanceof McpError) {
              yield { type: "error", error };
              return;
            }
            yield {
              type: "error",
              error: new McpError(ErrorCode.InvalidParams, `Failed to validate structured content: ${error instanceof Error ? error.message : String(error)}`)
            };
            return;
          }
        }
      }
      yield message;
    }
  }
  /**
   * Gets the current status of a task.
   *
   * @param taskId - The task identifier
   * @param options - Optional request options
   * @returns The task status
   *
   * @experimental
   */
  async getTask(taskId, options) {
    return this._client.getTask({ taskId }, options);
  }
  /**
   * Retrieves the result of a completed task.
   *
   * @param taskId - The task identifier
   * @param resultSchema - Zod schema for validating the result
   * @param options - Optional request options
   * @returns The task result
   *
   * @experimental
   */
  async getTaskResult(taskId, resultSchema, options) {
    return this._client.getTaskResult({ taskId }, resultSchema, options);
  }
  /**
   * Lists tasks with optional pagination.
   *
   * @param cursor - Optional pagination cursor
   * @param options - Optional request options
   * @returns List of tasks with optional next cursor
   *
   * @experimental
   */
  async listTasks(cursor, options) {
    return this._client.listTasks(cursor ? { cursor } : void 0, options);
  }
  /**
   * Cancels a running task.
   *
   * @param taskId - The task identifier
   * @param options - Optional request options
   *
   * @experimental
   */
  async cancelTask(taskId, options) {
    return this._client.cancelTask({ taskId }, options);
  }
  /**
   * Sends a request and returns an AsyncGenerator that yields response messages.
   * The generator is guaranteed to end with either a 'result' or 'error' message.
   *
   * This method provides streaming access to request processing, allowing you to
   * observe intermediate task status updates for task-augmented requests.
   *
   * @param request - The request to send
   * @param resultSchema - Zod schema for validating the result
   * @param options - Optional request options (timeout, signal, task creation params, etc.)
   * @returns AsyncGenerator that yields ResponseMessage objects
   *
   * @experimental
   */
  requestStream(request, resultSchema, options) {
    return this._client.requestStream(request, resultSchema, options);
  }
};

// ../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js
function applyElicitationDefaults(schema, data) {
  if (!schema || data === null || typeof data !== "object")
    return;
  if (schema.type === "object" && schema.properties && typeof schema.properties === "object") {
    const obj = data;
    const props = schema.properties;
    for (const key of Object.keys(props)) {
      const propSchema = props[key];
      if (obj[key] === void 0 && Object.prototype.hasOwnProperty.call(propSchema, "default")) {
        obj[key] = propSchema.default;
      }
      if (obj[key] !== void 0) {
        applyElicitationDefaults(propSchema, obj[key]);
      }
    }
  }
  if (Array.isArray(schema.anyOf)) {
    for (const sub of schema.anyOf) {
      if (typeof sub !== "boolean") {
        applyElicitationDefaults(sub, data);
      }
    }
  }
  if (Array.isArray(schema.oneOf)) {
    for (const sub of schema.oneOf) {
      if (typeof sub !== "boolean") {
        applyElicitationDefaults(sub, data);
      }
    }
  }
}
function getSupportedElicitationModes(capabilities) {
  if (!capabilities) {
    return { supportsFormMode: false, supportsUrlMode: false };
  }
  const hasFormCapability = capabilities.form !== void 0;
  const hasUrlCapability = capabilities.url !== void 0;
  const supportsFormMode = hasFormCapability || !hasFormCapability && !hasUrlCapability;
  const supportsUrlMode = hasUrlCapability;
  return { supportsFormMode, supportsUrlMode };
}
var Client = class extends Protocol {
  /**
   * Initializes this client with the given name and version information.
   */
  constructor(_clientInfo, options) {
    super(options);
    this._clientInfo = _clientInfo;
    this._cachedToolOutputValidators = /* @__PURE__ */ new Map();
    this._cachedKnownTaskTools = /* @__PURE__ */ new Set();
    this._cachedRequiredTaskTools = /* @__PURE__ */ new Set();
    this._listChangedDebounceTimers = /* @__PURE__ */ new Map();
    this._capabilities = options?.capabilities ?? {};
    this._jsonSchemaValidator = options?.jsonSchemaValidator ?? new AjvJsonSchemaValidator();
    if (options?.listChanged) {
      this._pendingListChangedConfig = options.listChanged;
    }
  }
  /**
   * Set up handlers for list changed notifications based on config and server capabilities.
   * This should only be called after initialization when server capabilities are known.
   * Handlers are silently skipped if the server doesn't advertise the corresponding listChanged capability.
   * @internal
   */
  _setupListChangedHandlers(config) {
    if (config.tools && this._serverCapabilities?.tools?.listChanged) {
      this._setupListChangedHandler("tools", ToolListChangedNotificationSchema, config.tools, async () => {
        const result = await this.listTools();
        return result.tools;
      });
    }
    if (config.prompts && this._serverCapabilities?.prompts?.listChanged) {
      this._setupListChangedHandler("prompts", PromptListChangedNotificationSchema, config.prompts, async () => {
        const result = await this.listPrompts();
        return result.prompts;
      });
    }
    if (config.resources && this._serverCapabilities?.resources?.listChanged) {
      this._setupListChangedHandler("resources", ResourceListChangedNotificationSchema, config.resources, async () => {
        const result = await this.listResources();
        return result.resources;
      });
    }
  }
  /**
   * Access experimental features.
   *
   * WARNING: These APIs are experimental and may change without notice.
   *
   * @experimental
   */
  get experimental() {
    if (!this._experimental) {
      this._experimental = {
        tasks: new ExperimentalClientTasks(this)
      };
    }
    return this._experimental;
  }
  /**
   * Registers new capabilities. This can only be called before connecting to a transport.
   *
   * The new capabilities will be merged with any existing capabilities previously given (e.g., at initialization).
   */
  registerCapabilities(capabilities) {
    if (this.transport) {
      throw new Error("Cannot register capabilities after connecting to transport");
    }
    this._capabilities = mergeCapabilities(this._capabilities, capabilities);
  }
  /**
   * Override request handler registration to enforce client-side validation for elicitation.
   */
  setRequestHandler(requestSchema, handler) {
    const shape = getObjectShape(requestSchema);
    const methodSchema = shape?.method;
    if (!methodSchema) {
      throw new Error("Schema is missing a method literal");
    }
    const methodValue = getLiteralValue(methodSchema);
    if (typeof methodValue !== "string") {
      throw new Error("Schema method literal must be a string");
    }
    const method = methodValue;
    if (method === "elicitation/create") {
      const wrappedHandler = async (request, extra) => {
        const validatedRequest = safeParse(ElicitRequestSchema, request);
        if (!validatedRequest.success) {
          const errorMessage2 = validatedRequest.error instanceof Error ? validatedRequest.error.message : String(validatedRequest.error);
          throw new McpError(ErrorCode.InvalidParams, `Invalid elicitation request: ${errorMessage2}`);
        }
        const { params } = validatedRequest.data;
        params.mode = params.mode ?? "form";
        const { supportsFormMode, supportsUrlMode } = getSupportedElicitationModes(this._capabilities.elicitation);
        if (params.mode === "form" && !supportsFormMode) {
          throw new McpError(ErrorCode.InvalidParams, "Client does not support form-mode elicitation requests");
        }
        if (params.mode === "url" && !supportsUrlMode) {
          throw new McpError(ErrorCode.InvalidParams, "Client does not support URL-mode elicitation requests");
        }
        const result = await Promise.resolve(handler(request, extra));
        if (params.task) {
          const taskValidationResult = safeParse(CreateTaskResultSchema, result);
          if (!taskValidationResult.success) {
            const errorMessage2 = taskValidationResult.error instanceof Error ? taskValidationResult.error.message : String(taskValidationResult.error);
            throw new McpError(ErrorCode.InvalidParams, `Invalid task creation result: ${errorMessage2}`);
          }
          return taskValidationResult.data;
        }
        const validationResult = safeParse(ElicitResultSchema, result);
        if (!validationResult.success) {
          const errorMessage2 = validationResult.error instanceof Error ? validationResult.error.message : String(validationResult.error);
          throw new McpError(ErrorCode.InvalidParams, `Invalid elicitation result: ${errorMessage2}`);
        }
        const validatedResult = validationResult.data;
        const requestedSchema = params.mode === "form" ? params.requestedSchema : void 0;
        if (params.mode === "form" && validatedResult.action === "accept" && validatedResult.content && requestedSchema) {
          if (this._capabilities.elicitation?.form?.applyDefaults) {
            try {
              applyElicitationDefaults(requestedSchema, validatedResult.content);
            } catch {
            }
          }
        }
        return validatedResult;
      };
      return super.setRequestHandler(requestSchema, wrappedHandler);
    }
    if (method === "sampling/createMessage") {
      const wrappedHandler = async (request, extra) => {
        const validatedRequest = safeParse(CreateMessageRequestSchema, request);
        if (!validatedRequest.success) {
          const errorMessage2 = validatedRequest.error instanceof Error ? validatedRequest.error.message : String(validatedRequest.error);
          throw new McpError(ErrorCode.InvalidParams, `Invalid sampling request: ${errorMessage2}`);
        }
        const { params } = validatedRequest.data;
        const result = await Promise.resolve(handler(request, extra));
        if (params.task) {
          const taskValidationResult = safeParse(CreateTaskResultSchema, result);
          if (!taskValidationResult.success) {
            const errorMessage2 = taskValidationResult.error instanceof Error ? taskValidationResult.error.message : String(taskValidationResult.error);
            throw new McpError(ErrorCode.InvalidParams, `Invalid task creation result: ${errorMessage2}`);
          }
          return taskValidationResult.data;
        }
        const hasTools = params.tools || params.toolChoice;
        const resultSchema = hasTools ? CreateMessageResultWithToolsSchema : CreateMessageResultSchema;
        const validationResult = safeParse(resultSchema, result);
        if (!validationResult.success) {
          const errorMessage2 = validationResult.error instanceof Error ? validationResult.error.message : String(validationResult.error);
          throw new McpError(ErrorCode.InvalidParams, `Invalid sampling result: ${errorMessage2}`);
        }
        return validationResult.data;
      };
      return super.setRequestHandler(requestSchema, wrappedHandler);
    }
    return super.setRequestHandler(requestSchema, handler);
  }
  assertCapability(capability, method) {
    if (!this._serverCapabilities?.[capability]) {
      throw new Error(`Server does not support ${capability} (required for ${method})`);
    }
  }
  async connect(transport, options) {
    await super.connect(transport);
    if (transport.sessionId !== void 0) {
      return;
    }
    try {
      const result = await this.request({
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: this._capabilities,
          clientInfo: this._clientInfo
        }
      }, InitializeResultSchema, options);
      if (result === void 0) {
        throw new Error(`Server sent invalid initialize result: ${result}`);
      }
      if (!SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)) {
        throw new Error(`Server's protocol version is not supported: ${result.protocolVersion}`);
      }
      this._serverCapabilities = result.capabilities;
      this._serverVersion = result.serverInfo;
      if (transport.setProtocolVersion) {
        transport.setProtocolVersion(result.protocolVersion);
      }
      this._instructions = result.instructions;
      await this.notification({
        method: "notifications/initialized"
      });
      if (this._pendingListChangedConfig) {
        this._setupListChangedHandlers(this._pendingListChangedConfig);
        this._pendingListChangedConfig = void 0;
      }
    } catch (error) {
      void this.close();
      throw error;
    }
  }
  /**
   * After initialization has completed, this will be populated with the server's reported capabilities.
   */
  getServerCapabilities() {
    return this._serverCapabilities;
  }
  /**
   * After initialization has completed, this will be populated with information about the server's name and version.
   */
  getServerVersion() {
    return this._serverVersion;
  }
  /**
   * After initialization has completed, this may be populated with information about the server's instructions.
   */
  getInstructions() {
    return this._instructions;
  }
  assertCapabilityForMethod(method) {
    switch (method) {
      case "logging/setLevel":
        if (!this._serverCapabilities?.logging) {
          throw new Error(`Server does not support logging (required for ${method})`);
        }
        break;
      case "prompts/get":
      case "prompts/list":
        if (!this._serverCapabilities?.prompts) {
          throw new Error(`Server does not support prompts (required for ${method})`);
        }
        break;
      case "resources/list":
      case "resources/templates/list":
      case "resources/read":
      case "resources/subscribe":
      case "resources/unsubscribe":
        if (!this._serverCapabilities?.resources) {
          throw new Error(`Server does not support resources (required for ${method})`);
        }
        if (method === "resources/subscribe" && !this._serverCapabilities.resources.subscribe) {
          throw new Error(`Server does not support resource subscriptions (required for ${method})`);
        }
        break;
      case "tools/call":
      case "tools/list":
        if (!this._serverCapabilities?.tools) {
          throw new Error(`Server does not support tools (required for ${method})`);
        }
        break;
      case "completion/complete":
        if (!this._serverCapabilities?.completions) {
          throw new Error(`Server does not support completions (required for ${method})`);
        }
        break;
      case "initialize":
        break;
      case "ping":
        break;
    }
  }
  assertNotificationCapability(method) {
    switch (method) {
      case "notifications/roots/list_changed":
        if (!this._capabilities.roots?.listChanged) {
          throw new Error(`Client does not support roots list changed notifications (required for ${method})`);
        }
        break;
      case "notifications/initialized":
        break;
      case "notifications/cancelled":
        break;
      case "notifications/progress":
        break;
    }
  }
  assertRequestHandlerCapability(method) {
    if (!this._capabilities) {
      return;
    }
    switch (method) {
      case "sampling/createMessage":
        if (!this._capabilities.sampling) {
          throw new Error(`Client does not support sampling capability (required for ${method})`);
        }
        break;
      case "elicitation/create":
        if (!this._capabilities.elicitation) {
          throw new Error(`Client does not support elicitation capability (required for ${method})`);
        }
        break;
      case "roots/list":
        if (!this._capabilities.roots) {
          throw new Error(`Client does not support roots capability (required for ${method})`);
        }
        break;
      case "tasks/get":
      case "tasks/list":
      case "tasks/result":
      case "tasks/cancel":
        if (!this._capabilities.tasks) {
          throw new Error(`Client does not support tasks capability (required for ${method})`);
        }
        break;
      case "ping":
        break;
    }
  }
  assertTaskCapability(method) {
    assertToolsCallTaskCapability(this._serverCapabilities?.tasks?.requests, method, "Server");
  }
  assertTaskHandlerCapability(method) {
    if (!this._capabilities) {
      return;
    }
    assertClientRequestTaskCapability(this._capabilities.tasks?.requests, method, "Client");
  }
  async ping(options) {
    return this.request({ method: "ping" }, EmptyResultSchema, options);
  }
  async complete(params, options) {
    return this.request({ method: "completion/complete", params }, CompleteResultSchema, options);
  }
  async setLoggingLevel(level, options) {
    return this.request({ method: "logging/setLevel", params: { level } }, EmptyResultSchema, options);
  }
  async getPrompt(params, options) {
    return this.request({ method: "prompts/get", params }, GetPromptResultSchema, options);
  }
  async listPrompts(params, options) {
    return this.request({ method: "prompts/list", params }, ListPromptsResultSchema, options);
  }
  async listResources(params, options) {
    return this.request({ method: "resources/list", params }, ListResourcesResultSchema, options);
  }
  async listResourceTemplates(params, options) {
    return this.request({ method: "resources/templates/list", params }, ListResourceTemplatesResultSchema, options);
  }
  async readResource(params, options) {
    return this.request({ method: "resources/read", params }, ReadResourceResultSchema, options);
  }
  async subscribeResource(params, options) {
    return this.request({ method: "resources/subscribe", params }, EmptyResultSchema, options);
  }
  async unsubscribeResource(params, options) {
    return this.request({ method: "resources/unsubscribe", params }, EmptyResultSchema, options);
  }
  /**
   * Calls a tool and waits for the result. Automatically validates structured output if the tool has an outputSchema.
   *
   * For task-based execution with streaming behavior, use client.experimental.tasks.callToolStream() instead.
   */
  async callTool(params, resultSchema = CallToolResultSchema, options) {
    if (this.isToolTaskRequired(params.name)) {
      throw new McpError(ErrorCode.InvalidRequest, `Tool "${params.name}" requires task-based execution. Use client.experimental.tasks.callToolStream() instead.`);
    }
    const result = await this.request({ method: "tools/call", params }, resultSchema, options);
    const validator = this.getToolOutputValidator(params.name);
    if (validator) {
      if (!result.structuredContent && !result.isError) {
        throw new McpError(ErrorCode.InvalidRequest, `Tool ${params.name} has an output schema but did not return structured content`);
      }
      if (result.structuredContent) {
        try {
          const validationResult = validator(result.structuredContent);
          if (!validationResult.valid) {
            throw new McpError(ErrorCode.InvalidParams, `Structured content does not match the tool's output schema: ${validationResult.errorMessage}`);
          }
        } catch (error) {
          if (error instanceof McpError) {
            throw error;
          }
          throw new McpError(ErrorCode.InvalidParams, `Failed to validate structured content: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return result;
  }
  isToolTask(toolName) {
    if (!this._serverCapabilities?.tasks?.requests?.tools?.call) {
      return false;
    }
    return this._cachedKnownTaskTools.has(toolName);
  }
  /**
   * Check if a tool requires task-based execution.
   * Unlike isToolTask which includes 'optional' tools, this only checks for 'required'.
   */
  isToolTaskRequired(toolName) {
    return this._cachedRequiredTaskTools.has(toolName);
  }
  /**
   * Cache validators for tool output schemas.
   * Called after listTools() to pre-compile validators for better performance.
   */
  cacheToolMetadata(tools) {
    this._cachedToolOutputValidators.clear();
    this._cachedKnownTaskTools.clear();
    this._cachedRequiredTaskTools.clear();
    for (const tool of tools) {
      if (tool.outputSchema) {
        const toolValidator = this._jsonSchemaValidator.getValidator(tool.outputSchema);
        this._cachedToolOutputValidators.set(tool.name, toolValidator);
      }
      const taskSupport = tool.execution?.taskSupport;
      if (taskSupport === "required" || taskSupport === "optional") {
        this._cachedKnownTaskTools.add(tool.name);
      }
      if (taskSupport === "required") {
        this._cachedRequiredTaskTools.add(tool.name);
      }
    }
  }
  /**
   * Get cached validator for a tool
   */
  getToolOutputValidator(toolName) {
    return this._cachedToolOutputValidators.get(toolName);
  }
  async listTools(params, options) {
    const result = await this.request({ method: "tools/list", params }, ListToolsResultSchema, options);
    this.cacheToolMetadata(result.tools);
    return result;
  }
  /**
   * Set up a single list changed handler.
   * @internal
   */
  _setupListChangedHandler(listType, notificationSchema, options, fetcher) {
    const parseResult = ListChangedOptionsBaseSchema.safeParse(options);
    if (!parseResult.success) {
      throw new Error(`Invalid ${listType} listChanged options: ${parseResult.error.message}`);
    }
    if (typeof options.onChanged !== "function") {
      throw new Error(`Invalid ${listType} listChanged options: onChanged must be a function`);
    }
    const { autoRefresh, debounceMs } = parseResult.data;
    const { onChanged } = options;
    const refresh = async () => {
      if (!autoRefresh) {
        onChanged(null, null);
        return;
      }
      try {
        const items = await fetcher();
        onChanged(null, items);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        onChanged(error, null);
      }
    };
    const handler = () => {
      if (debounceMs) {
        const existingTimer = this._listChangedDebounceTimers.get(listType);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        const timer = setTimeout(refresh, debounceMs);
        this._listChangedDebounceTimers.set(listType, timer);
      } else {
        refresh();
      }
    };
    this.setNotificationHandler(notificationSchema, handler);
  }
  async sendRootsListChanged() {
    return this.notification({ method: "notifications/roots/list_changed" });
  }
};

// ../../node_modules/@modelcontextprotocol/sdk/dist/esm/shared/mediaType.js
var import_content_type = __toESM(require_content_type(), 1);
function mediaTypeEssence(header) {
  if (!header) {
    return void 0;
  }
  try {
    return import_content_type.default.parse(header).type;
  } catch {
    const essence = (header.split(";", 1)[0] ?? "").trim().toLowerCase();
    if (essence === "" || header.slice(essence.length).includes(",")) {
      return void 0;
    }
    return essence;
  }
}

// ../../node_modules/@modelcontextprotocol/sdk/dist/esm/shared/transport.js
function normalizeHeaders(headers) {
  if (!headers)
    return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}
function createFetchWithInit(baseFetch = fetch, baseInit) {
  if (!baseInit) {
    return baseFetch;
  }
  return async (url2, init) => {
    const mergedInit = {
      ...baseInit,
      ...init,
      // Headers need special handling - merge instead of replace
      headers: init?.headers ? { ...normalizeHeaders(baseInit.headers), ...normalizeHeaders(init.headers) } : baseInit.headers
    };
    return baseFetch(url2, mergedInit);
  };
}

// ../../node_modules/pkce-challenge/dist/index.node.js
var crypto;
crypto = globalThis.crypto?.webcrypto ?? // Node.js [18-16] REPL
globalThis.crypto ?? // Node.js >18
import("node:crypto").then((m) => m.webcrypto);
async function getRandomValues(size) {
  return (await crypto).getRandomValues(new Uint8Array(size));
}
async function random(size) {
  const mask = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const evenDistCutoff = Math.pow(2, 8) - Math.pow(2, 8) % mask.length;
  let result = "";
  while (result.length < size) {
    const randomBytes2 = await getRandomValues(size - result.length);
    for (const randomByte of randomBytes2) {
      if (randomByte < evenDistCutoff) {
        result += mask[randomByte % mask.length];
      }
    }
  }
  return result;
}
async function generateVerifier(length) {
  return await random(length);
}
async function generateChallenge(code_verifier) {
  const buffer = await (await crypto).subtle.digest("SHA-256", new TextEncoder().encode(code_verifier));
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\//g, "_").replace(/\+/g, "-").replace(/=/g, "");
}
async function pkceChallenge(length) {
  if (!length)
    length = 43;
  if (length < 43 || length > 128) {
    throw `Expected a length between 43 and 128. Received ${length}.`;
  }
  const verifier = await generateVerifier(length);
  const challenge = await generateChallenge(verifier);
  return {
    code_verifier: verifier,
    code_challenge: challenge
  };
}

// ../../node_modules/@modelcontextprotocol/sdk/dist/esm/shared/auth.js
var SafeUrlSchema = url().superRefine((val, ctx) => {
  if (!URL.canParse(val)) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      message: "URL must be parseable",
      fatal: true
    });
    return NEVER;
  }
}).refine((url2) => {
  const u = new URL(url2);
  return u.protocol !== "javascript:" && u.protocol !== "data:" && u.protocol !== "vbscript:";
}, { message: "URL cannot use javascript:, data:, or vbscript: scheme" });
var OAuthProtectedResourceMetadataSchema = looseObject({
  resource: string().url(),
  authorization_servers: array(SafeUrlSchema).optional(),
  jwks_uri: string().url().optional(),
  scopes_supported: array(string()).optional(),
  bearer_methods_supported: array(string()).optional(),
  resource_signing_alg_values_supported: array(string()).optional(),
  resource_name: string().optional(),
  resource_documentation: string().optional(),
  resource_policy_uri: string().url().optional(),
  resource_tos_uri: string().url().optional(),
  tls_client_certificate_bound_access_tokens: boolean().optional(),
  authorization_details_types_supported: array(string()).optional(),
  dpop_signing_alg_values_supported: array(string()).optional(),
  dpop_bound_access_tokens_required: boolean().optional()
});
var OAuthMetadataSchema = looseObject({
  issuer: string(),
  authorization_endpoint: SafeUrlSchema,
  token_endpoint: SafeUrlSchema,
  registration_endpoint: SafeUrlSchema.optional(),
  scopes_supported: array(string()).optional(),
  response_types_supported: array(string()),
  response_modes_supported: array(string()).optional(),
  grant_types_supported: array(string()).optional(),
  token_endpoint_auth_methods_supported: array(string()).optional(),
  token_endpoint_auth_signing_alg_values_supported: array(string()).optional(),
  service_documentation: SafeUrlSchema.optional(),
  revocation_endpoint: SafeUrlSchema.optional(),
  revocation_endpoint_auth_methods_supported: array(string()).optional(),
  revocation_endpoint_auth_signing_alg_values_supported: array(string()).optional(),
  introspection_endpoint: string().optional(),
  introspection_endpoint_auth_methods_supported: array(string()).optional(),
  introspection_endpoint_auth_signing_alg_values_supported: array(string()).optional(),
  code_challenge_methods_supported: array(string()).optional(),
  client_id_metadata_document_supported: boolean().optional()
});
var OpenIdProviderMetadataSchema = looseObject({
  issuer: string(),
  authorization_endpoint: SafeUrlSchema,
  token_endpoint: SafeUrlSchema,
  userinfo_endpoint: SafeUrlSchema.optional(),
  jwks_uri: SafeUrlSchema,
  registration_endpoint: SafeUrlSchema.optional(),
  scopes_supported: array(string()).optional(),
  response_types_supported: array(string()),
  response_modes_supported: array(string()).optional(),
  grant_types_supported: array(string()).optional(),
  acr_values_supported: array(string()).optional(),
  subject_types_supported: array(string()),
  id_token_signing_alg_values_supported: array(string()),
  id_token_encryption_alg_values_supported: array(string()).optional(),
  id_token_encryption_enc_values_supported: array(string()).optional(),
  userinfo_signing_alg_values_supported: array(string()).optional(),
  userinfo_encryption_alg_values_supported: array(string()).optional(),
  userinfo_encryption_enc_values_supported: array(string()).optional(),
  request_object_signing_alg_values_supported: array(string()).optional(),
  request_object_encryption_alg_values_supported: array(string()).optional(),
  request_object_encryption_enc_values_supported: array(string()).optional(),
  token_endpoint_auth_methods_supported: array(string()).optional(),
  token_endpoint_auth_signing_alg_values_supported: array(string()).optional(),
  display_values_supported: array(string()).optional(),
  claim_types_supported: array(string()).optional(),
  claims_supported: array(string()).optional(),
  service_documentation: string().optional(),
  claims_locales_supported: array(string()).optional(),
  ui_locales_supported: array(string()).optional(),
  claims_parameter_supported: boolean().optional(),
  request_parameter_supported: boolean().optional(),
  request_uri_parameter_supported: boolean().optional(),
  require_request_uri_registration: boolean().optional(),
  op_policy_uri: SafeUrlSchema.optional(),
  op_tos_uri: SafeUrlSchema.optional(),
  client_id_metadata_document_supported: boolean().optional()
});
var OpenIdProviderDiscoveryMetadataSchema = object({
  ...OpenIdProviderMetadataSchema.shape,
  ...OAuthMetadataSchema.pick({
    code_challenge_methods_supported: true
  }).shape
});
var OAuthTokensSchema = object({
  access_token: string(),
  id_token: string().optional(),
  // Optional for OAuth 2.1, but necessary in OpenID Connect
  token_type: string(),
  expires_in: coerce_exports.number().optional(),
  scope: string().optional(),
  refresh_token: string().optional()
}).strip();
var OAuthErrorResponseSchema = object({
  error: string(),
  error_description: string().optional(),
  error_uri: string().optional()
});
var OptionalSafeUrlSchema = SafeUrlSchema.optional().or(literal("").transform(() => void 0));
var OAuthClientMetadataSchema = object({
  redirect_uris: array(SafeUrlSchema),
  token_endpoint_auth_method: string().optional(),
  grant_types: array(string()).optional(),
  response_types: array(string()).optional(),
  client_name: string().optional(),
  client_uri: SafeUrlSchema.optional(),
  logo_uri: OptionalSafeUrlSchema,
  scope: string().optional(),
  contacts: array(string()).optional(),
  tos_uri: OptionalSafeUrlSchema,
  policy_uri: string().optional(),
  jwks_uri: SafeUrlSchema.optional(),
  jwks: any().optional(),
  software_id: string().optional(),
  software_version: string().optional(),
  software_statement: string().optional()
}).strip();
var OAuthClientInformationSchema = object({
  client_id: string(),
  client_secret: string().optional(),
  client_id_issued_at: number().optional(),
  client_secret_expires_at: number().optional()
}).strip();
var OAuthClientInformationFullSchema = OAuthClientMetadataSchema.merge(OAuthClientInformationSchema);
var OAuthClientRegistrationErrorSchema = object({
  error: string(),
  error_description: string().optional()
}).strip();
var OAuthTokenRevocationRequestSchema = object({
  token: string(),
  token_type_hint: string().optional()
}).strip();

// ../../node_modules/@modelcontextprotocol/sdk/dist/esm/shared/auth-utils.js
function resourceUrlFromServerUrl(url2) {
  const resourceURL = typeof url2 === "string" ? new URL(url2) : new URL(url2.href);
  resourceURL.hash = "";
  return resourceURL;
}
function checkResourceAllowed({ requestedResource, configuredResource }) {
  const requested = typeof requestedResource === "string" ? new URL(requestedResource) : new URL(requestedResource.href);
  const configured = typeof configuredResource === "string" ? new URL(configuredResource) : new URL(configuredResource.href);
  if (requested.origin !== configured.origin) {
    return false;
  }
  if (requested.pathname.length < configured.pathname.length) {
    return false;
  }
  const requestedPath = requested.pathname.endsWith("/") ? requested.pathname : requested.pathname + "/";
  const configuredPath = configured.pathname.endsWith("/") ? configured.pathname : configured.pathname + "/";
  return requestedPath.startsWith(configuredPath);
}

// ../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/errors.js
var OAuthError = class extends Error {
  constructor(message, errorUri) {
    super(message);
    this.errorUri = errorUri;
    this.name = this.constructor.name;
  }
  /**
   * Converts the error to a standard OAuth error response object
   */
  toResponseObject() {
    const response = {
      error: this.errorCode,
      error_description: this.message
    };
    if (this.errorUri) {
      response.error_uri = this.errorUri;
    }
    return response;
  }
  get errorCode() {
    return this.constructor.errorCode;
  }
};
var InvalidRequestError = class extends OAuthError {
};
InvalidRequestError.errorCode = "invalid_request";
var InvalidClientError = class extends OAuthError {
};
InvalidClientError.errorCode = "invalid_client";
var InvalidGrantError = class extends OAuthError {
};
InvalidGrantError.errorCode = "invalid_grant";
var UnauthorizedClientError = class extends OAuthError {
};
UnauthorizedClientError.errorCode = "unauthorized_client";
var UnsupportedGrantTypeError = class extends OAuthError {
};
UnsupportedGrantTypeError.errorCode = "unsupported_grant_type";
var InvalidScopeError = class extends OAuthError {
};
InvalidScopeError.errorCode = "invalid_scope";
var AccessDeniedError = class extends OAuthError {
};
AccessDeniedError.errorCode = "access_denied";
var ServerError = class extends OAuthError {
};
ServerError.errorCode = "server_error";
var TemporarilyUnavailableError = class extends OAuthError {
};
TemporarilyUnavailableError.errorCode = "temporarily_unavailable";
var UnsupportedResponseTypeError = class extends OAuthError {
};
UnsupportedResponseTypeError.errorCode = "unsupported_response_type";
var UnsupportedTokenTypeError = class extends OAuthError {
};
UnsupportedTokenTypeError.errorCode = "unsupported_token_type";
var InvalidTokenError = class extends OAuthError {
};
InvalidTokenError.errorCode = "invalid_token";
var MethodNotAllowedError = class extends OAuthError {
};
MethodNotAllowedError.errorCode = "method_not_allowed";
var TooManyRequestsError = class extends OAuthError {
};
TooManyRequestsError.errorCode = "too_many_requests";
var InvalidClientMetadataError = class extends OAuthError {
};
InvalidClientMetadataError.errorCode = "invalid_client_metadata";
var InsufficientScopeError = class extends OAuthError {
};
InsufficientScopeError.errorCode = "insufficient_scope";
var InvalidTargetError = class extends OAuthError {
};
InvalidTargetError.errorCode = "invalid_target";
var OAUTH_ERRORS = {
  [InvalidRequestError.errorCode]: InvalidRequestError,
  [InvalidClientError.errorCode]: InvalidClientError,
  [InvalidGrantError.errorCode]: InvalidGrantError,
  [UnauthorizedClientError.errorCode]: UnauthorizedClientError,
  [UnsupportedGrantTypeError.errorCode]: UnsupportedGrantTypeError,
  [InvalidScopeError.errorCode]: InvalidScopeError,
  [AccessDeniedError.errorCode]: AccessDeniedError,
  [ServerError.errorCode]: ServerError,
  [TemporarilyUnavailableError.errorCode]: TemporarilyUnavailableError,
  [UnsupportedResponseTypeError.errorCode]: UnsupportedResponseTypeError,
  [UnsupportedTokenTypeError.errorCode]: UnsupportedTokenTypeError,
  [InvalidTokenError.errorCode]: InvalidTokenError,
  [MethodNotAllowedError.errorCode]: MethodNotAllowedError,
  [TooManyRequestsError.errorCode]: TooManyRequestsError,
  [InvalidClientMetadataError.errorCode]: InvalidClientMetadataError,
  [InsufficientScopeError.errorCode]: InsufficientScopeError,
  [InvalidTargetError.errorCode]: InvalidTargetError
};

// ../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.js
var UnauthorizedError = class extends Error {
  constructor(message) {
    super(message ?? "Unauthorized");
  }
};
function isClientAuthMethod(method) {
  return ["client_secret_basic", "client_secret_post", "none"].includes(method);
}
var AUTHORIZATION_CODE_RESPONSE_TYPE = "code";
var AUTHORIZATION_CODE_CHALLENGE_METHOD = "S256";
function selectClientAuthMethod(clientInformation, supportedMethods) {
  const hasClientSecret = clientInformation.client_secret !== void 0;
  if ("token_endpoint_auth_method" in clientInformation && clientInformation.token_endpoint_auth_method && isClientAuthMethod(clientInformation.token_endpoint_auth_method) && (supportedMethods.length === 0 || supportedMethods.includes(clientInformation.token_endpoint_auth_method))) {
    return clientInformation.token_endpoint_auth_method;
  }
  if (supportedMethods.length === 0) {
    return hasClientSecret ? "client_secret_basic" : "none";
  }
  if (hasClientSecret && supportedMethods.includes("client_secret_basic")) {
    return "client_secret_basic";
  }
  if (hasClientSecret && supportedMethods.includes("client_secret_post")) {
    return "client_secret_post";
  }
  if (supportedMethods.includes("none")) {
    return "none";
  }
  return hasClientSecret ? "client_secret_post" : "none";
}
function applyClientAuthentication(method, clientInformation, headers, params) {
  const { client_id, client_secret } = clientInformation;
  switch (method) {
    case "client_secret_basic":
      applyBasicAuth(client_id, client_secret, headers);
      return;
    case "client_secret_post":
      applyPostAuth(client_id, client_secret, params);
      return;
    case "none":
      applyPublicAuth(client_id, params);
      return;
    default:
      throw new Error(`Unsupported client authentication method: ${method}`);
  }
}
function applyBasicAuth(clientId, clientSecret, headers) {
  if (!clientSecret) {
    throw new Error("client_secret_basic authentication requires a client_secret");
  }
  const credentials = btoa(`${clientId}:${clientSecret}`);
  headers.set("Authorization", `Basic ${credentials}`);
}
function applyPostAuth(clientId, clientSecret, params) {
  params.set("client_id", clientId);
  if (clientSecret) {
    params.set("client_secret", clientSecret);
  }
}
function applyPublicAuth(clientId, params) {
  params.set("client_id", clientId);
}
async function parseErrorResponse(input) {
  const statusCode = input instanceof Response ? input.status : void 0;
  const body = input instanceof Response ? await input.text() : input;
  try {
    const result = OAuthErrorResponseSchema.parse(JSON.parse(body));
    const { error, error_description, error_uri } = result;
    const errorClass = OAUTH_ERRORS[error] || ServerError;
    return new errorClass(error_description || "", error_uri);
  } catch (error) {
    const errorMessage2 = `${statusCode ? `HTTP ${statusCode}: ` : ""}Invalid OAuth error response: ${error}. Raw body: ${body}`;
    return new ServerError(errorMessage2);
  }
}
async function auth(provider, options) {
  try {
    return await authInternal(provider, options);
  } catch (error) {
    if (error instanceof InvalidClientError || error instanceof UnauthorizedClientError) {
      await provider.invalidateCredentials?.("all");
      return await authInternal(provider, options);
    } else if (error instanceof InvalidGrantError) {
      await provider.invalidateCredentials?.("tokens");
      return await authInternal(provider, options);
    }
    throw error;
  }
}
async function authInternal(provider, { serverUrl, authorizationCode, scope, resourceMetadataUrl, fetchFn }) {
  const cachedState = await provider.discoveryState?.();
  let resourceMetadata;
  let authorizationServerUrl;
  let metadata;
  let effectiveResourceMetadataUrl = resourceMetadataUrl;
  if (!effectiveResourceMetadataUrl && cachedState?.resourceMetadataUrl) {
    effectiveResourceMetadataUrl = new URL(cachedState.resourceMetadataUrl);
  }
  if (cachedState?.authorizationServerUrl) {
    authorizationServerUrl = cachedState.authorizationServerUrl;
    resourceMetadata = cachedState.resourceMetadata;
    metadata = cachedState.authorizationServerMetadata ?? await discoverAuthorizationServerMetadata(authorizationServerUrl, { fetchFn });
    if (!resourceMetadata) {
      try {
        resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl, { resourceMetadataUrl: effectiveResourceMetadataUrl }, fetchFn);
      } catch {
      }
    }
    if (metadata !== cachedState.authorizationServerMetadata || resourceMetadata !== cachedState.resourceMetadata) {
      await provider.saveDiscoveryState?.({
        authorizationServerUrl: String(authorizationServerUrl),
        resourceMetadataUrl: effectiveResourceMetadataUrl?.toString(),
        resourceMetadata,
        authorizationServerMetadata: metadata
      });
    }
  } else {
    const serverInfo = await discoverOAuthServerInfo(serverUrl, { resourceMetadataUrl: effectiveResourceMetadataUrl, fetchFn });
    authorizationServerUrl = serverInfo.authorizationServerUrl;
    metadata = serverInfo.authorizationServerMetadata;
    resourceMetadata = serverInfo.resourceMetadata;
    await provider.saveDiscoveryState?.({
      authorizationServerUrl: String(authorizationServerUrl),
      resourceMetadataUrl: effectiveResourceMetadataUrl?.toString(),
      resourceMetadata,
      authorizationServerMetadata: metadata
    });
  }
  const resource = await selectResourceURL(serverUrl, provider, resourceMetadata);
  const resolvedScope = scope || resourceMetadata?.scopes_supported?.join(" ") || provider.clientMetadata.scope;
  let clientInformation = await Promise.resolve(provider.clientInformation());
  if (!clientInformation) {
    if (authorizationCode !== void 0) {
      throw new Error("Existing OAuth client information is required when exchanging an authorization code");
    }
    const supportsUrlBasedClientId = metadata?.client_id_metadata_document_supported === true;
    const clientMetadataUrl = provider.clientMetadataUrl;
    if (clientMetadataUrl && !isHttpsUrl(clientMetadataUrl)) {
      throw new InvalidClientMetadataError(`clientMetadataUrl must be a valid HTTPS URL with a non-root pathname, got: ${clientMetadataUrl}`);
    }
    const shouldUseUrlBasedClientId = supportsUrlBasedClientId && clientMetadataUrl;
    if (shouldUseUrlBasedClientId) {
      clientInformation = {
        client_id: clientMetadataUrl
      };
      await provider.saveClientInformation?.(clientInformation);
    } else {
      if (!provider.saveClientInformation) {
        throw new Error("OAuth client information must be saveable for dynamic registration");
      }
      const fullInformation = await registerClient(authorizationServerUrl, {
        metadata,
        clientMetadata: provider.clientMetadata,
        scope: resolvedScope,
        fetchFn
      });
      await provider.saveClientInformation(fullInformation);
      clientInformation = fullInformation;
    }
  }
  const nonInteractiveFlow = !provider.redirectUrl;
  if (authorizationCode !== void 0 || nonInteractiveFlow) {
    const tokens2 = await fetchToken(provider, authorizationServerUrl, {
      metadata,
      resource,
      authorizationCode,
      fetchFn
    });
    await provider.saveTokens(tokens2);
    return "AUTHORIZED";
  }
  const tokens = await provider.tokens();
  if (tokens?.refresh_token) {
    try {
      const newTokens = await refreshAuthorization(authorizationServerUrl, {
        metadata,
        clientInformation,
        refreshToken: tokens.refresh_token,
        resource,
        addClientAuthentication: provider.addClientAuthentication,
        fetchFn
      });
      await provider.saveTokens(newTokens);
      return "AUTHORIZED";
    } catch (error) {
      if (!(error instanceof OAuthError) || error instanceof ServerError) {
      } else {
        throw error;
      }
    }
  }
  const state = provider.state ? await provider.state() : void 0;
  const { authorizationUrl, codeVerifier } = await startAuthorization(authorizationServerUrl, {
    metadata,
    clientInformation,
    state,
    redirectUrl: provider.redirectUrl,
    scope: resolvedScope,
    resource
  });
  await provider.saveCodeVerifier(codeVerifier);
  await provider.redirectToAuthorization(authorizationUrl);
  return "REDIRECT";
}
function isHttpsUrl(value) {
  if (!value)
    return false;
  try {
    const url2 = new URL(value);
    return url2.protocol === "https:" && url2.pathname !== "/";
  } catch {
    return false;
  }
}
async function selectResourceURL(serverUrl, provider, resourceMetadata) {
  const defaultResource = resourceUrlFromServerUrl(serverUrl);
  if (provider.validateResourceURL) {
    return await provider.validateResourceURL(defaultResource, resourceMetadata?.resource);
  }
  if (!resourceMetadata) {
    return void 0;
  }
  if (!checkResourceAllowed({ requestedResource: defaultResource, configuredResource: resourceMetadata.resource })) {
    throw new Error(`Protected resource ${resourceMetadata.resource} does not match expected ${defaultResource} (or origin)`);
  }
  return new URL(resourceMetadata.resource);
}
function extractWWWAuthenticateParams(res) {
  const authenticateHeader = res.headers.get("WWW-Authenticate");
  if (!authenticateHeader) {
    return {};
  }
  const [type, scheme] = authenticateHeader.split(" ");
  if (type.toLowerCase() !== "bearer" || !scheme) {
    return {};
  }
  const resourceMetadataMatch = extractFieldFromWwwAuth(res, "resource_metadata") || void 0;
  let resourceMetadataUrl;
  if (resourceMetadataMatch) {
    try {
      resourceMetadataUrl = new URL(resourceMetadataMatch);
    } catch {
    }
  }
  const scope = extractFieldFromWwwAuth(res, "scope") || void 0;
  const error = extractFieldFromWwwAuth(res, "error") || void 0;
  return {
    resourceMetadataUrl,
    scope,
    error
  };
}
function extractFieldFromWwwAuth(response, fieldName) {
  const wwwAuthHeader = response.headers.get("WWW-Authenticate");
  if (!wwwAuthHeader) {
    return null;
  }
  const pattern = new RegExp(`${fieldName}=(?:"([^"]+)"|([^\\s,]+))`);
  const match = wwwAuthHeader.match(pattern);
  if (match) {
    return match[1] || match[2];
  }
  return null;
}
async function discoverOAuthProtectedResourceMetadata(serverUrl, opts, fetchFn = fetch) {
  const response = await discoverMetadataWithFallback(serverUrl, "oauth-protected-resource", fetchFn, {
    protocolVersion: opts?.protocolVersion,
    metadataUrl: opts?.resourceMetadataUrl
  });
  if (!response || response.status === 404) {
    await response?.body?.cancel();
    throw new Error(`Resource server does not implement OAuth 2.0 Protected Resource Metadata.`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status} trying to load well-known OAuth protected resource metadata.`);
  }
  return OAuthProtectedResourceMetadataSchema.parse(await response.json());
}
async function fetchWithCorsRetry(url2, headers, fetchFn = fetch) {
  try {
    return await fetchFn(url2, { headers });
  } catch (error) {
    if (error instanceof TypeError) {
      if (headers) {
        return fetchWithCorsRetry(url2, void 0, fetchFn);
      } else {
        return void 0;
      }
    }
    throw error;
  }
}
function buildWellKnownPath(wellKnownPrefix, pathname = "", options = {}) {
  if (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  return options.prependPathname ? `${pathname}/.well-known/${wellKnownPrefix}` : `/.well-known/${wellKnownPrefix}${pathname}`;
}
async function tryMetadataDiscovery(url2, protocolVersion, fetchFn = fetch) {
  const headers = {
    "MCP-Protocol-Version": protocolVersion
  };
  return await fetchWithCorsRetry(url2, headers, fetchFn);
}
function shouldAttemptFallback(response, pathname) {
  return !response || response.status >= 400 && response.status < 500 && pathname !== "/";
}
async function discoverMetadataWithFallback(serverUrl, wellKnownType, fetchFn, opts) {
  const issuer = new URL(serverUrl);
  const protocolVersion = opts?.protocolVersion ?? LATEST_PROTOCOL_VERSION;
  let url2;
  if (opts?.metadataUrl) {
    url2 = new URL(opts.metadataUrl);
  } else {
    const wellKnownPath = buildWellKnownPath(wellKnownType, issuer.pathname);
    url2 = new URL(wellKnownPath, opts?.metadataServerUrl ?? issuer);
    url2.search = issuer.search;
  }
  let response = await tryMetadataDiscovery(url2, protocolVersion, fetchFn);
  if (!opts?.metadataUrl && shouldAttemptFallback(response, issuer.pathname)) {
    const rootUrl = new URL(`/.well-known/${wellKnownType}`, issuer);
    response = await tryMetadataDiscovery(rootUrl, protocolVersion, fetchFn);
  }
  return response;
}
function buildDiscoveryUrls(authorizationServerUrl) {
  const url2 = typeof authorizationServerUrl === "string" ? new URL(authorizationServerUrl) : authorizationServerUrl;
  const hasPath = url2.pathname !== "/";
  const urlsToTry = [];
  if (!hasPath) {
    urlsToTry.push({
      url: new URL("/.well-known/oauth-authorization-server", url2.origin),
      type: "oauth"
    });
    urlsToTry.push({
      url: new URL(`/.well-known/openid-configuration`, url2.origin),
      type: "oidc"
    });
    return urlsToTry;
  }
  let pathname = url2.pathname;
  if (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  urlsToTry.push({
    url: new URL(`/.well-known/oauth-authorization-server${pathname}`, url2.origin),
    type: "oauth"
  });
  urlsToTry.push({
    url: new URL(`/.well-known/openid-configuration${pathname}`, url2.origin),
    type: "oidc"
  });
  urlsToTry.push({
    url: new URL(`${pathname}/.well-known/openid-configuration`, url2.origin),
    type: "oidc"
  });
  return urlsToTry;
}
async function discoverAuthorizationServerMetadata(authorizationServerUrl, { fetchFn = fetch, protocolVersion = LATEST_PROTOCOL_VERSION } = {}) {
  const headers = {
    "MCP-Protocol-Version": protocolVersion,
    Accept: "application/json"
  };
  const urlsToTry = buildDiscoveryUrls(authorizationServerUrl);
  for (const { url: endpointUrl, type } of urlsToTry) {
    const response = await fetchWithCorsRetry(endpointUrl, headers, fetchFn);
    if (!response) {
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 400 && response.status < 500) {
        continue;
      }
      throw new Error(`HTTP ${response.status} trying to load ${type === "oauth" ? "OAuth" : "OpenID provider"} metadata from ${endpointUrl}`);
    }
    if (type === "oauth") {
      return OAuthMetadataSchema.parse(await response.json());
    } else {
      return OpenIdProviderDiscoveryMetadataSchema.parse(await response.json());
    }
  }
  return void 0;
}
async function discoverOAuthServerInfo(serverUrl, opts) {
  let resourceMetadata;
  let authorizationServerUrl;
  try {
    resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl, { resourceMetadataUrl: opts?.resourceMetadataUrl }, opts?.fetchFn);
    if (resourceMetadata.authorization_servers && resourceMetadata.authorization_servers.length > 0) {
      authorizationServerUrl = resourceMetadata.authorization_servers[0];
    }
  } catch {
  }
  if (!authorizationServerUrl) {
    authorizationServerUrl = String(new URL("/", serverUrl));
  }
  const authorizationServerMetadata = await discoverAuthorizationServerMetadata(authorizationServerUrl, { fetchFn: opts?.fetchFn });
  return {
    authorizationServerUrl,
    authorizationServerMetadata,
    resourceMetadata
  };
}
async function startAuthorization(authorizationServerUrl, { metadata, clientInformation, redirectUrl, scope, state, resource }) {
  let authorizationUrl;
  if (metadata) {
    authorizationUrl = new URL(metadata.authorization_endpoint);
    if (!metadata.response_types_supported.includes(AUTHORIZATION_CODE_RESPONSE_TYPE)) {
      throw new Error(`Incompatible auth server: does not support response type ${AUTHORIZATION_CODE_RESPONSE_TYPE}`);
    }
    if (metadata.code_challenge_methods_supported && !metadata.code_challenge_methods_supported.includes(AUTHORIZATION_CODE_CHALLENGE_METHOD)) {
      throw new Error(`Incompatible auth server: does not support code challenge method ${AUTHORIZATION_CODE_CHALLENGE_METHOD}`);
    }
  } else {
    authorizationUrl = new URL("/authorize", authorizationServerUrl);
  }
  const challenge = await pkceChallenge();
  const codeVerifier = challenge.code_verifier;
  const codeChallenge = challenge.code_challenge;
  authorizationUrl.searchParams.set("response_type", AUTHORIZATION_CODE_RESPONSE_TYPE);
  authorizationUrl.searchParams.set("client_id", clientInformation.client_id);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", AUTHORIZATION_CODE_CHALLENGE_METHOD);
  authorizationUrl.searchParams.set("redirect_uri", String(redirectUrl));
  if (state) {
    authorizationUrl.searchParams.set("state", state);
  }
  if (scope) {
    authorizationUrl.searchParams.set("scope", scope);
  }
  if (scope?.includes("offline_access")) {
    authorizationUrl.searchParams.append("prompt", "consent");
  }
  if (resource) {
    authorizationUrl.searchParams.set("resource", resource.href);
  }
  return { authorizationUrl, codeVerifier };
}
function prepareAuthorizationCodeRequest(authorizationCode, codeVerifier, redirectUri) {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code: authorizationCode,
    code_verifier: codeVerifier,
    redirect_uri: String(redirectUri)
  });
}
async function executeTokenRequest(authorizationServerUrl, { metadata, tokenRequestParams, clientInformation, addClientAuthentication, resource, fetchFn }) {
  const tokenUrl = metadata?.token_endpoint ? new URL(metadata.token_endpoint) : new URL("/token", authorizationServerUrl);
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json"
  });
  if (resource) {
    tokenRequestParams.set("resource", resource.href);
  }
  if (addClientAuthentication) {
    await addClientAuthentication(headers, tokenRequestParams, tokenUrl, metadata);
  } else if (clientInformation) {
    const supportedMethods = metadata?.token_endpoint_auth_methods_supported ?? [];
    const authMethod = selectClientAuthMethod(clientInformation, supportedMethods);
    applyClientAuthentication(authMethod, clientInformation, headers, tokenRequestParams);
  }
  const response = await (fetchFn ?? fetch)(tokenUrl, {
    method: "POST",
    headers,
    body: tokenRequestParams
  });
  if (!response.ok) {
    throw await parseErrorResponse(response);
  }
  return OAuthTokensSchema.parse(await response.json());
}
async function refreshAuthorization(authorizationServerUrl, { metadata, clientInformation, refreshToken, resource, addClientAuthentication, fetchFn }) {
  const tokenRequestParams = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  const tokens = await executeTokenRequest(authorizationServerUrl, {
    metadata,
    tokenRequestParams,
    clientInformation,
    addClientAuthentication,
    resource,
    fetchFn
  });
  return { refresh_token: refreshToken, ...tokens };
}
async function fetchToken(provider, authorizationServerUrl, { metadata, resource, authorizationCode, fetchFn } = {}) {
  const scope = provider.clientMetadata.scope;
  let tokenRequestParams;
  if (provider.prepareTokenRequest) {
    tokenRequestParams = await provider.prepareTokenRequest(scope);
  }
  if (!tokenRequestParams) {
    if (!authorizationCode) {
      throw new Error("Either provider.prepareTokenRequest() or authorizationCode is required");
    }
    if (!provider.redirectUrl) {
      throw new Error("redirectUrl is required for authorization_code flow");
    }
    const codeVerifier = await provider.codeVerifier();
    tokenRequestParams = prepareAuthorizationCodeRequest(authorizationCode, codeVerifier, provider.redirectUrl);
  }
  const clientInformation = await provider.clientInformation();
  return executeTokenRequest(authorizationServerUrl, {
    metadata,
    tokenRequestParams,
    clientInformation: clientInformation ?? void 0,
    addClientAuthentication: provider.addClientAuthentication,
    resource,
    fetchFn
  });
}
async function registerClient(authorizationServerUrl, { metadata, clientMetadata, scope, fetchFn }) {
  let registrationUrl;
  if (metadata) {
    if (!metadata.registration_endpoint) {
      throw new Error("Incompatible auth server: does not support dynamic client registration");
    }
    registrationUrl = new URL(metadata.registration_endpoint);
  } else {
    registrationUrl = new URL("/register", authorizationServerUrl);
  }
  const response = await (fetchFn ?? fetch)(registrationUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...clientMetadata,
      ...scope !== void 0 ? { scope } : {}
    })
  });
  if (!response.ok) {
    throw await parseErrorResponse(response);
  }
  return OAuthClientInformationFullSchema.parse(await response.json());
}

// ../../node_modules/eventsource-parser/dist/index.js
var ParseError = class extends Error {
  constructor(message, options) {
    super(message), this.name = "ParseError", this.type = options.type, this.field = options.field, this.value = options.value, this.line = options.line;
  }
};
var LF = 10;
var CR = 13;
var SPACE = 32;
function noop(_arg) {
}
function createParser(config) {
  if (typeof config == "function")
    throw new TypeError(
      "`config` must be an object, got a function instead. Did you mean `createParser({onEvent: fn})`?"
    );
  const { onEvent = noop, onError = noop, onRetry = noop, onComment, maxBufferSize } = config, pendingFragments = [];
  let pendingFragmentsLength = 0, isFirstChunk = true, id, data = "", dataLines = 0, eventType, terminated = false;
  function feed(chunk) {
    if (terminated)
      throw new Error(
        "Cannot feed parser: it was terminated after exceeding the configured max buffer size. Call `reset()` to resume parsing."
      );
    if (isFirstChunk && (isFirstChunk = false, chunk.charCodeAt(0) === 239 && chunk.charCodeAt(1) === 187 && chunk.charCodeAt(2) === 191 && (chunk = chunk.slice(3))), pendingFragments.length === 0) {
      const trailing2 = processLines(chunk);
      trailing2 !== "" && (pendingFragments.push(trailing2), pendingFragmentsLength = trailing2.length), checkBufferSize();
      return;
    }
    if (chunk.indexOf(`
`) === -1 && chunk.indexOf("\r") === -1) {
      pendingFragments.push(chunk), pendingFragmentsLength += chunk.length, checkBufferSize();
      return;
    }
    pendingFragments.push(chunk);
    const input = pendingFragments.join("");
    pendingFragments.length = 0, pendingFragmentsLength = 0;
    const trailing = processLines(input);
    trailing !== "" && (pendingFragments.push(trailing), pendingFragmentsLength = trailing.length), checkBufferSize();
  }
  function checkBufferSize() {
    maxBufferSize !== void 0 && (pendingFragmentsLength + data.length <= maxBufferSize || (terminated = true, pendingFragments.length = 0, pendingFragmentsLength = 0, id = void 0, data = "", dataLines = 0, eventType = void 0, onError(
      new ParseError(`Buffered data exceeded max buffer size of ${maxBufferSize} characters`, {
        type: "max-buffer-size-exceeded"
      })
    )));
  }
  function processLines(chunk) {
    let searchIndex = 0;
    if (chunk.indexOf("\r") === -1) {
      let lfIndex = chunk.indexOf(`
`, searchIndex);
      for (; lfIndex !== -1; ) {
        if (searchIndex === lfIndex) {
          dataLines > 0 && onEvent({ id, event: eventType, data }), id = void 0, data = "", dataLines = 0, eventType = void 0, searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
          continue;
        }
        const firstCharCode = chunk.charCodeAt(searchIndex);
        if (isDataPrefix(chunk, searchIndex, firstCharCode)) {
          const valueStart = chunk.charCodeAt(searchIndex + 5) === SPACE ? searchIndex + 6 : searchIndex + 5, value = chunk.slice(valueStart, lfIndex);
          if (dataLines === 0 && chunk.charCodeAt(lfIndex + 1) === LF) {
            onEvent({ id, event: eventType, data: value }), id = void 0, data = "", eventType = void 0, searchIndex = lfIndex + 2, lfIndex = chunk.indexOf(`
`, searchIndex);
            continue;
          }
          data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
        } else isEventPrefix(chunk, searchIndex, firstCharCode) ? eventType = chunk.slice(
          chunk.charCodeAt(searchIndex + 6) === SPACE ? searchIndex + 7 : searchIndex + 6,
          lfIndex
        ) || void 0 : parseLine(chunk, searchIndex, lfIndex);
        searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
      }
      return chunk.slice(searchIndex);
    }
    for (; searchIndex < chunk.length; ) {
      const crIndex = chunk.indexOf("\r", searchIndex), lfIndex = chunk.indexOf(`
`, searchIndex);
      let lineEnd = -1;
      if (crIndex !== -1 && lfIndex !== -1 ? lineEnd = crIndex < lfIndex ? crIndex : lfIndex : crIndex !== -1 ? crIndex === chunk.length - 1 ? lineEnd = -1 : lineEnd = crIndex : lfIndex !== -1 && (lineEnd = lfIndex), lineEnd === -1)
        break;
      parseLine(chunk, searchIndex, lineEnd), searchIndex = lineEnd + 1, chunk.charCodeAt(searchIndex - 1) === CR && chunk.charCodeAt(searchIndex) === LF && searchIndex++;
    }
    return chunk.slice(searchIndex);
  }
  function parseLine(chunk, start, end) {
    if (start === end) {
      dispatchEvent();
      return;
    }
    const firstCharCode = chunk.charCodeAt(start);
    if (isDataPrefix(chunk, start, firstCharCode)) {
      const valueStart = chunk.charCodeAt(start + 5) === SPACE ? start + 6 : start + 5, value2 = chunk.slice(valueStart, end);
      data = dataLines === 0 ? value2 : `${data}
${value2}`, dataLines++;
      return;
    }
    if (isEventPrefix(chunk, start, firstCharCode)) {
      eventType = chunk.slice(chunk.charCodeAt(start + 6) === SPACE ? start + 7 : start + 6, end) || void 0;
      return;
    }
    if (firstCharCode === 105 && chunk.charCodeAt(start + 1) === 100 && chunk.charCodeAt(start + 2) === 58) {
      const value2 = chunk.slice(chunk.charCodeAt(start + 3) === SPACE ? start + 4 : start + 3, end);
      value2.includes("\0") || (id = value2);
      return;
    }
    if (firstCharCode === 58) {
      if (onComment) {
        const line2 = chunk.slice(start, end);
        onComment(line2.slice(chunk.charCodeAt(start + 1) === SPACE ? 2 : 1));
      }
      return;
    }
    const line = chunk.slice(start, end), fieldSeparatorIndex = line.indexOf(":");
    if (fieldSeparatorIndex === -1) {
      processField(line, "", line);
      return;
    }
    const field = line.slice(0, fieldSeparatorIndex), offset = line.charCodeAt(fieldSeparatorIndex + 1) === SPACE ? 2 : 1, value = line.slice(fieldSeparatorIndex + offset);
    processField(field, value, line);
  }
  function processField(field, value, line) {
    switch (field) {
      case "event":
        eventType = value || void 0;
        break;
      case "data":
        data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
        break;
      case "id":
        value.includes("\0") || (id = value);
        break;
      case "retry":
        /^\d+$/.test(value) ? onRetry(parseInt(value, 10)) : onError(
          new ParseError(`Invalid \`retry\` value: "${value}"`, {
            type: "invalid-retry",
            value,
            line
          })
        );
        break;
      default:
        onError(
          new ParseError(
            `Unknown field "${field.length > 20 ? `${field.slice(0, 20)}\u2026` : field}"`,
            { type: "unknown-field", field, value, line }
          )
        );
        break;
    }
  }
  function dispatchEvent() {
    dataLines > 0 && onEvent({
      id,
      event: eventType,
      data
    }), id = void 0, data = "", dataLines = 0, eventType = void 0;
  }
  function reset(options = {}) {
    if (options.consume && pendingFragments.length > 0) {
      const incompleteLine = pendingFragments.join("");
      parseLine(incompleteLine, 0, incompleteLine.length);
    }
    isFirstChunk = true, id = void 0, data = "", dataLines = 0, eventType = void 0, pendingFragments.length = 0, pendingFragmentsLength = 0, terminated = false;
  }
  return { feed, reset };
}
function isDataPrefix(chunk, i, firstCharCode) {
  return firstCharCode === 100 && chunk.charCodeAt(i + 1) === 97 && chunk.charCodeAt(i + 2) === 116 && chunk.charCodeAt(i + 3) === 97 && chunk.charCodeAt(i + 4) === 58;
}
function isEventPrefix(chunk, i, firstCharCode) {
  return firstCharCode === 101 && chunk.charCodeAt(i + 1) === 118 && chunk.charCodeAt(i + 2) === 101 && chunk.charCodeAt(i + 3) === 110 && chunk.charCodeAt(i + 4) === 116 && chunk.charCodeAt(i + 5) === 58;
}

// ../../node_modules/eventsource-parser/dist/stream.js
var EventSourceParserStream = class extends TransformStream {
  constructor({ onError, onRetry, onComment, maxBufferSize } = {}) {
    let parser;
    super({
      start(controller) {
        parser = createParser({
          onEvent: (event) => {
            controller.enqueue(event);
          },
          onError(error) {
            typeof onError == "function" && onError(error), (onError === "terminate" || error.type === "max-buffer-size-exceeded") && controller.error(error);
          },
          onRetry,
          onComment,
          maxBufferSize
        });
      },
      transform(chunk) {
        parser.feed(chunk);
      }
    });
  }
};

// ../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js
var DEFAULT_STREAMABLE_HTTP_RECONNECTION_OPTIONS = {
  initialReconnectionDelay: 1e3,
  maxReconnectionDelay: 3e4,
  reconnectionDelayGrowFactor: 1.5,
  maxRetries: 2
};
var StreamableHTTPError = class extends Error {
  constructor(code, message) {
    super(`Streamable HTTP error: ${message}`);
    this.code = code;
  }
};
var StreamableHTTPClientTransport = class {
  constructor(url2, opts) {
    this._hasCompletedAuthFlow = false;
    this._url = url2;
    this._resourceMetadataUrl = void 0;
    this._scope = void 0;
    this._requestInit = opts?.requestInit;
    this._authProvider = opts?.authProvider;
    this._fetch = opts?.fetch;
    this._fetchWithInit = createFetchWithInit(opts?.fetch, opts?.requestInit);
    this._sessionId = opts?.sessionId;
    this._reconnectionOptions = opts?.reconnectionOptions ?? DEFAULT_STREAMABLE_HTTP_RECONNECTION_OPTIONS;
  }
  async _authThenStart() {
    if (!this._authProvider) {
      throw new UnauthorizedError("No auth provider");
    }
    let result;
    try {
      result = await auth(this._authProvider, {
        serverUrl: this._url,
        resourceMetadataUrl: this._resourceMetadataUrl,
        scope: this._scope,
        fetchFn: this._fetchWithInit
      });
    } catch (error) {
      this.onerror?.(error);
      throw error;
    }
    if (result !== "AUTHORIZED") {
      throw new UnauthorizedError();
    }
    return await this._startOrAuthSse({ resumptionToken: void 0 });
  }
  async _commonHeaders() {
    const headers = {};
    if (this._authProvider) {
      const tokens = await this._authProvider.tokens();
      if (tokens) {
        headers["Authorization"] = `Bearer ${tokens.access_token}`;
      }
    }
    if (this._sessionId) {
      headers["mcp-session-id"] = this._sessionId;
    }
    if (this._protocolVersion) {
      headers["mcp-protocol-version"] = this._protocolVersion;
    }
    const extraHeaders = normalizeHeaders(this._requestInit?.headers);
    return new Headers({
      ...headers,
      ...extraHeaders
    });
  }
  async _startOrAuthSse(options) {
    const { resumptionToken } = options;
    try {
      const headers = await this._commonHeaders();
      headers.set("Accept", "text/event-stream");
      if (resumptionToken) {
        headers.set("last-event-id", resumptionToken);
      }
      const response = await (this._fetch ?? fetch)(this._url, {
        method: "GET",
        headers,
        signal: this._abortController?.signal
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 && this._authProvider) {
          return await this._authThenStart();
        }
        if (response.status === 405) {
          return;
        }
        throw new StreamableHTTPError(response.status, `Failed to open SSE stream: ${response.statusText}`);
      }
      this._handleSseStream(response.body, options, true);
    } catch (error) {
      this.onerror?.(error);
      throw error;
    }
  }
  /**
   * Calculates the next reconnection delay using  backoff algorithm
   *
   * @param attempt Current reconnection attempt count for the specific stream
   * @returns Time to wait in milliseconds before next reconnection attempt
   */
  _getNextReconnectionDelay(attempt) {
    if (this._serverRetryMs !== void 0) {
      return this._serverRetryMs;
    }
    const initialDelay = this._reconnectionOptions.initialReconnectionDelay;
    const growFactor = this._reconnectionOptions.reconnectionDelayGrowFactor;
    const maxDelay = this._reconnectionOptions.maxReconnectionDelay;
    return Math.min(initialDelay * Math.pow(growFactor, attempt), maxDelay);
  }
  /**
   * Schedule a reconnection attempt using server-provided retry interval or backoff
   *
   * @param lastEventId The ID of the last received event for resumability
   * @param attemptCount Current reconnection attempt count for this specific stream
   */
  _scheduleReconnection(options, attemptCount = 0) {
    const maxRetries = this._reconnectionOptions.maxRetries;
    if (attemptCount >= maxRetries) {
      this.onerror?.(new Error(`Maximum reconnection attempts (${maxRetries}) exceeded.`));
      return;
    }
    const delay = this._getNextReconnectionDelay(attemptCount);
    this._reconnectionTimeout = setTimeout(() => {
      this._startOrAuthSse(options).catch((error) => {
        this.onerror?.(new Error(`Failed to reconnect SSE stream: ${error instanceof Error ? error.message : String(error)}`));
        this._scheduleReconnection(options, attemptCount + 1);
      });
    }, delay);
  }
  _handleSseStream(stream, options, isReconnectable) {
    if (!stream) {
      return;
    }
    const { onresumptiontoken, replayMessageId } = options;
    let lastEventId;
    let hasPrimingEvent = false;
    let receivedResponse = false;
    const processStream = async () => {
      try {
        const reader = stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({
          onRetry: (retryMs) => {
            this._serverRetryMs = retryMs;
          }
        })).getReader();
        while (true) {
          const { value: event, done } = await reader.read();
          if (done) {
            break;
          }
          if (event.id) {
            lastEventId = event.id;
            hasPrimingEvent = true;
            onresumptiontoken?.(event.id);
          }
          if (!event.data) {
            continue;
          }
          if (!event.event || event.event === "message") {
            try {
              const message = JSONRPCMessageSchema.parse(JSON.parse(event.data));
              if (isJSONRPCResultResponse(message)) {
                receivedResponse = true;
                if (replayMessageId !== void 0) {
                  message.id = replayMessageId;
                }
              }
              this.onmessage?.(message);
            } catch (error) {
              this.onerror?.(error);
            }
          }
        }
        const canResume = isReconnectable || hasPrimingEvent;
        const needsReconnect = canResume && !receivedResponse;
        if (needsReconnect && this._abortController && !this._abortController.signal.aborted) {
          this._scheduleReconnection({
            resumptionToken: lastEventId,
            onresumptiontoken,
            replayMessageId
          }, 0);
        }
      } catch (error) {
        this.onerror?.(new Error(`SSE stream disconnected: ${error}`));
        const canResume = isReconnectable || hasPrimingEvent;
        const needsReconnect = canResume && !receivedResponse;
        if (needsReconnect && this._abortController && !this._abortController.signal.aborted) {
          try {
            this._scheduleReconnection({
              resumptionToken: lastEventId,
              onresumptiontoken,
              replayMessageId
            }, 0);
          } catch (error2) {
            this.onerror?.(new Error(`Failed to reconnect: ${error2 instanceof Error ? error2.message : String(error2)}`));
          }
        }
      }
    };
    processStream();
  }
  async start() {
    if (this._abortController) {
      throw new Error("StreamableHTTPClientTransport already started! If using Client class, note that connect() calls start() automatically.");
    }
    this._abortController = new AbortController();
  }
  /**
   * Call this method after the user has finished authorizing via their user agent and is redirected back to the MCP client application. This will exchange the authorization code for an access token, enabling the next connection attempt to successfully auth.
   */
  async finishAuth(authorizationCode) {
    if (!this._authProvider) {
      throw new UnauthorizedError("No auth provider");
    }
    const result = await auth(this._authProvider, {
      serverUrl: this._url,
      authorizationCode,
      resourceMetadataUrl: this._resourceMetadataUrl,
      scope: this._scope,
      fetchFn: this._fetchWithInit
    });
    if (result !== "AUTHORIZED") {
      throw new UnauthorizedError("Failed to authorize");
    }
  }
  async close() {
    if (this._reconnectionTimeout) {
      clearTimeout(this._reconnectionTimeout);
      this._reconnectionTimeout = void 0;
    }
    this._abortController?.abort();
    this.onclose?.();
  }
  async send(message, options) {
    try {
      const { resumptionToken, onresumptiontoken } = options || {};
      if (resumptionToken) {
        this._startOrAuthSse({ resumptionToken, replayMessageId: isJSONRPCRequest(message) ? message.id : void 0 }).catch((err) => this.onerror?.(err));
        return;
      }
      const headers = await this._commonHeaders();
      headers.set("content-type", "application/json");
      headers.set("accept", "application/json, text/event-stream");
      const init = {
        ...this._requestInit,
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal: this._abortController?.signal
      };
      const response = await (this._fetch ?? fetch)(this._url, init);
      const sessionId = response.headers.get("mcp-session-id");
      if (sessionId) {
        this._sessionId = sessionId;
      }
      if (!response.ok) {
        const text = await response.text().catch(() => null);
        if (response.status === 401 && this._authProvider) {
          if (this._hasCompletedAuthFlow) {
            throw new StreamableHTTPError(401, "Server returned 401 after successful authentication");
          }
          const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
          this._resourceMetadataUrl = resourceMetadataUrl;
          this._scope = scope;
          const result = await auth(this._authProvider, {
            serverUrl: this._url,
            resourceMetadataUrl: this._resourceMetadataUrl,
            scope: this._scope,
            fetchFn: this._fetchWithInit
          });
          if (result !== "AUTHORIZED") {
            throw new UnauthorizedError();
          }
          this._hasCompletedAuthFlow = true;
          return this.send(message);
        }
        if (response.status === 403 && this._authProvider) {
          const { resourceMetadataUrl, scope, error } = extractWWWAuthenticateParams(response);
          if (error === "insufficient_scope") {
            const wwwAuthHeader = response.headers.get("WWW-Authenticate");
            if (this._lastUpscopingHeader === wwwAuthHeader) {
              throw new StreamableHTTPError(403, "Server returned 403 after trying upscoping");
            }
            if (scope) {
              this._scope = scope;
            }
            if (resourceMetadataUrl) {
              this._resourceMetadataUrl = resourceMetadataUrl;
            }
            this._lastUpscopingHeader = wwwAuthHeader ?? void 0;
            const result = await auth(this._authProvider, {
              serverUrl: this._url,
              resourceMetadataUrl: this._resourceMetadataUrl,
              scope: this._scope,
              fetchFn: this._fetch
            });
            if (result !== "AUTHORIZED") {
              throw new UnauthorizedError();
            }
            return this.send(message);
          }
        }
        throw new StreamableHTTPError(response.status, `Error POSTing to endpoint: ${text}`);
      }
      this._hasCompletedAuthFlow = false;
      this._lastUpscopingHeader = void 0;
      if (response.status === 202) {
        await response.body?.cancel();
        if (isInitializedNotification(message)) {
          this._startOrAuthSse({ resumptionToken: void 0 }).catch((err) => this.onerror?.(err));
        }
        return;
      }
      const messages = Array.isArray(message) ? message : [message];
      const hasRequests = messages.filter((msg) => "method" in msg && "id" in msg && msg.id !== void 0).length > 0;
      const contentType2 = response.headers.get("content-type");
      const responseMediaType = mediaTypeEssence(contentType2);
      if (hasRequests) {
        if (responseMediaType === "text/event-stream") {
          this._handleSseStream(response.body, { onresumptiontoken }, false);
        } else if (responseMediaType === "application/json") {
          const data = await response.json();
          const responseMessages = Array.isArray(data) ? data.map((msg) => JSONRPCMessageSchema.parse(msg)) : [JSONRPCMessageSchema.parse(data)];
          for (const msg of responseMessages) {
            this.onmessage?.(msg);
          }
        } else {
          await response.body?.cancel();
          throw new StreamableHTTPError(-1, `Unexpected content type: ${contentType2}`);
        }
      } else {
        await response.body?.cancel();
      }
    } catch (error) {
      this.onerror?.(error);
      throw error;
    }
  }
  get sessionId() {
    return this._sessionId;
  }
  /**
   * Terminates the current session by sending a DELETE request to the server.
   *
   * Clients that no longer need a particular session
   * (e.g., because the user is leaving the client application) SHOULD send an
   * HTTP DELETE to the MCP endpoint with the Mcp-Session-Id header to explicitly
   * terminate the session.
   *
   * The server MAY respond with HTTP 405 Method Not Allowed, indicating that
   * the server does not allow clients to terminate sessions.
   */
  async terminateSession() {
    if (!this._sessionId) {
      return;
    }
    try {
      const headers = await this._commonHeaders();
      const init = {
        ...this._requestInit,
        method: "DELETE",
        headers,
        signal: this._abortController?.signal
      };
      const response = await (this._fetch ?? fetch)(this._url, init);
      await response.body?.cancel();
      if (!response.ok && response.status !== 405) {
        throw new StreamableHTTPError(response.status, `Failed to terminate session: ${response.statusText}`);
      }
      this._sessionId = void 0;
    } catch (error) {
      this.onerror?.(error);
      throw error;
    }
  }
  setProtocolVersion(version) {
    this._protocolVersion = version;
  }
  get protocolVersion() {
    return this._protocolVersion;
  }
  /**
   * Resume an SSE stream from a previous event ID.
   * Opens a GET SSE connection with Last-Event-ID header to replay missed events.
   *
   * @param lastEventId The event ID to resume from
   * @param options Optional callback to receive new resumption tokens
   */
  async resumeStream(lastEventId, options) {
    await this._startOrAuthSse({
      resumptionToken: lastEventId,
      onresumptiontoken: options?.onresumptiontoken
    });
  }
};

// src/remote.ts
var listToolsResultSchema = ListToolsResultSchema.extend({
  tools: ToolSchema.extend({
    outputSchema: ToolSchema.shape.outputSchema.unwrap().extend({
      properties: external_exports.record(external_exports.string(), external_exports.union([external_exports.boolean(), external_exports.looseObject({})])).optional()
    }).optional()
  }).array()
});
function requireToolSuccess(name, result) {
  if (result.isError || result.structuredContent?.success === false) {
    throw new Error(`${name} failed: ${JSON.stringify(result)}`);
  }
}
var KichiMcpClient = class {
  constructor(config) {
    this.config = config;
  }
  config;
  jsonSchemaValidator = new AjvJsonSchemaValidator();
  client = new Client({ name: "kichi-codex", version: "0.2.0-beta.8" }, {
    capabilities: {},
    jsonSchemaValidator: this.jsonSchemaValidator
  });
  outputValidators = /* @__PURE__ */ new Map();
  requiredTaskTools = /* @__PURE__ */ new Set();
  avatarId;
  get selectedAvatarId() {
    return this.avatarId;
  }
  async connect() {
    const transport = new StreamableHTTPClientTransport(new URL(this.config.serverUrl), {
      requestInit: { headers: { Authorization: `Bearer ${this.config.token}` }, redirect: "error" }
    });
    await this.client.connect(transport);
  }
  async listTools(params) {
    const result = await this.client.request({ method: "tools/list", params }, listToolsResultSchema);
    this.outputValidators.clear();
    this.requiredTaskTools.clear();
    for (const tool of result.tools) {
      if (tool.outputSchema) {
        this.outputValidators.set(tool.name, this.jsonSchemaValidator.getValidator(tool.outputSchema));
      }
      if (tool.execution?.taskSupport === "required") this.requiredTaskTools.add(tool.name);
    }
    return result;
  }
  async callTool(params, timeout = 6e4) {
    if (this.requiredTaskTools.has(params.name)) {
      throw new McpError(ErrorCode.InvalidRequest, `Tool ${params.name} requires a task-augmented call.`);
    }
    const request = params.arguments?.request;
    const avatarId = typeof request?.avatarId === "string" ? request.avatarId : void 0;
    if ((params.name === "kichi_join" || params.name === "kichi_rejoin") && this.avatarId && avatarId !== this.avatarId) {
      throw new Error("Leave the current avatar before joining another avatar in this profile.");
    }
    const result = await this.client.callTool(params, void 0, { timeout });
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
    if (params.name === "kichi_join" || params.name === "kichi_rejoin") {
      if (!avatarId || result.structuredContent?.success !== true) {
        throw new Error(`${params.name} returned an invalid join result.`);
      }
      this.avatarId = avatarId;
    } else if (params.name === "kichi_leave" && avatarId === this.avatarId) {
      this.avatarId = void 0;
    }
    return result;
  }
  async status() {
    if (!this.avatarId) return { serverUrl: this.config.serverUrl, avatarId: null, connected: false };
    const result = await this.callTool({ name: "kichi_connection_status", arguments: { request: { avatarId: this.avatarId } } });
    requireToolSuccess("kichi_connection_status", result);
    return { serverUrl: this.config.serverUrl, avatarId: this.avatarId, ...result.structuredContent };
  }
  async close() {
    try {
      if (this.avatarId) {
        const result = await this.callTool({ name: "kichi_leave", arguments: { request: { avatarId: this.avatarId } } });
        requireToolSuccess("kichi_leave", result);
      }
    } finally {
      await this.client.close();
    }
  }
};

// src/runtime.ts
async function serve(config) {
  const connection = await readConnectionConfig(config);
  await mkdir(config.runtimeDir, { recursive: true, mode: 448 });
  const remote = new KichiMcpClient(connection);
  const tracker = new HookTracker();
  const logError = (error) => process.stderr.write(`[kichi] ${errorMessage(error)}
`);
  let lastMotion;
  let token;
  let closing = false;
  let pending = Promise.resolve();
  async function serialized(operation) {
    const previous = pending;
    let release;
    pending = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
  const server = createServer(async (req, res) => {
    const respond = (status, value) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (!token || closing) return respond(503, { error: "Kichi bridge is not ready." });
    if (req.headers.authorization !== `Bearer ${token}`) return respond(403, { error: "Unauthorized." });
    if (req.method !== "POST") return respond(405, { error: "Use POST." });
    try {
      let raw = "";
      req.setEncoding("utf8");
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected an object.");
      if (req.url === "/ping") {
        return respond(200, { result: { pid: process.pid, profile: config.profile, transport: "streamable-http", serverUrl: connection.serverUrl } });
      }
      await serialized(async () => {
        if (closing) throw new Error("Kichi bridge is closing.");
        switch (req.url) {
          case "/tools/list":
            return respond(200, { result: await remote.listTools(data) });
          case "/status":
            return respond(200, { result: await remote.status() });
          case "/hook": {
            const event = parseHook({ ...data, hook_event_name: data.event });
            if (!event) return respond(200, { result: null });
            const feedback = tracker.accept(event);
            const avatarId = remote.selectedAvatarId;
            if (!avatarId) {
              lastMotion = void 0;
              return respond(200, { result: null });
            }
            if (feedback) {
              const { notification, ...motion } = feedback;
              if (notification) {
                const name = `kichi_${notification.type}`;
                requireToolSuccess(name, await remote.callTool({ name, arguments: { request: { avatarId, bubble: notification.bubble } } }, 5e3));
              }
              const signature = JSON.stringify(motion);
              if (signature !== lastMotion) {
                requireToolSuccess("kichi_action", await remote.callTool({
                  name: "kichi_action",
                  arguments: { request: { avatarId, ...motion, log: "", verify: false } }
                }, 5e3));
                lastMotion = signature;
              }
            }
            return respond(200, { result: null });
          }
          case "/tool": {
            if (typeof data.name !== "string") throw new Error("Tool name is required.");
            const result = await remote.callTool(data);
            if (!result.isError) {
              if (["kichi_join", "kichi_rejoin", "kichi_leave", "kichi_action", "kichi_idle_plan", "kichi_bot_message"].includes(data.name)) {
                lastMotion = void 0;
              }
              if (data.name === "kichi_leave" && !remote.selectedAvatarId) tracker.reset();
            }
            return respond(200, { result });
          }
          case "/stop":
            closing = true;
            try {
              await remote.close();
              respond(200, { result: { stopped: true } });
            } finally {
              server.close((error) => {
                if (error) logError(error);
              });
              await unlink(config.tokenPath);
            }
            return;
          default:
            return respond(404, { error: "Unknown bridge endpoint." });
        }
      });
    } catch (error) {
      logError(error);
      if (!res.headersSent) respond(500, { error: errorMessage(error) });
    }
  });
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(config.socketPath, () => {
      server.removeListener("error", reject);
      resolveReady();
    });
  });
  try {
    const newToken = randomBytes(32).toString("hex");
    await writeFile(config.tokenPath, newToken, { mode: 384 });
    await remote.connect();
    token = newToken;
  } catch (error) {
    await remote.close();
    server.close();
    await unlink(config.tokenPath);
    throw error;
  }
  return {
    async close() {
      if (closing) return;
      closing = true;
      try {
        await serialized(() => remote.close());
      } finally {
        await new Promise((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
        await unlink(config.tokenPath);
      }
    }
  };
}
export {
  serve
};
/*! Bundled license information:

content-type/index.js:
  (*!
   * content-type
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)
*/
