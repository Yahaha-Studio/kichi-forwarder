import {
  AVATAR_STATUSES,
  IDLE_PLAN_POMODORO_PHASES,
  VALID_ENVIRONMENTS,
  getActionDefinition,
  getActionPlayback,
  getMusicTitleEnum,
  loadStaticConfig,
  normalizeClockConfig,
  normalizeIdlePlan,
  normalizeJoinTags,
  normalizeKichiHost,
  normalizeMusicTitles,
  resolveJoinEnvironmentHost,
} from "@yahaha-studio/kichi-core";
import type {
  AvatarStatus,
  KichiForwarderService,
  PoseType,
} from "@yahaha-studio/kichi-core";

const OPERATIONS = [
  "switch_host", "rejoin", "leave", "connection_status", "action", "glance",
  "idle_plan", "clock", "query_status", "music_album_create", "noteboard_create",
  "bot_message_history", "bot_message",
] as const;

export type KichiOperation = typeof OPERATIONS[number];
type ExecutableOperation = "join" | KichiOperation;

type ObjectSchema = {
  type: "object";
  properties: Record<string, Schema>;
  required: readonly string[];
  additionalProperties: false;
};
type Schema = ObjectSchema
  | { type: "string"; enum?: readonly string[]; minLength?: number; maxLength?: number }
  | { type: "integer" | "number"; minimum?: number; maximum?: number; exclusiveMinimum?: number }
  | { type: "boolean" }
  | { type: "array"; items: Schema; minItems?: number };

const text: Schema = { type: "string", minLength: 1 };
const positiveInteger: Schema = { type: "integer", minimum: 1 };
const nonNegativeInteger: Schema = { type: "integer", minimum: 0 };
const flag: Schema = { type: "boolean" };
const poses = ["stand", "sit", "lay", "floor"] as const;
const choice = (values: readonly string[]): Schema => ({ type: "string", enum: values });
const object = (properties: Record<string, Schema>, required: readonly string[] = []): ObjectSchema =>
  ({ type: "object", properties, required, additionalProperties: false });

const clockSchema = object({
  mode: choice(["pomodoro", "countDown", "countUp"]), running: flag,
  kichiSeconds: positiveInteger, shortBreakSeconds: positiveInteger, longBreakSeconds: positiveInteger,
  sessionCount: positiveInteger, currentSession: positiveInteger,
  phase: choice(["focus", "shortBreak", "longBreak"]), durationSeconds: positiveInteger,
  remainingSeconds: nonNegativeInteger, elapsedSeconds: nonNegativeInteger,
}, ["mode"]);

export const KICHI_JOIN_PARAMETERS = object({
  environment: choice(VALID_ENVIRONMENTS), host: text, avatarId: text, botName: text, bio: text,
  tags: { type: "array", items: text },
}, ["environment", "avatarId"]);

const schemas: Record<ExecutableOperation, ObjectSchema> = {
  join: KICHI_JOIN_PARAMETERS,
  switch_host: object({ environment: choice(VALID_ENVIRONMENTS), host: text }, ["environment"]),
  rejoin: object({}),
  leave: object({}),
  connection_status: object({}),
  action: object({
    poseType: choice(poses), action: text, avatarStatus: choice(AVATAR_STATUSES),
    bubble: text, log: text, propId: text, verify: flag,
  }, ["poseType", "action", "avatarStatus"]),
  glance: object({ target: choice(["camera"]), duration: { type: "number", exclusiveMinimum: 0 }, requestId: text }),
  idle_plan: object({
    requestId: text, heartbeatIntervalSeconds: positiveInteger, goal: text,
    stages: {
      type: "array", minItems: 1,
      items: object({
        name: text, purpose: text, pomodoroPhase: choice(IDLE_PLAN_POMODORO_PHASES),
        avatarStatus: choice(AVATAR_STATUSES), durationSeconds: positiveInteger,
        actions: {
          type: "array", minItems: 1,
          items: object({
            poseType: choice(poses), action: text, durationSeconds: positiveInteger,
            bubble: text, log: text, propId: text,
          }, ["poseType", "action", "durationSeconds", "bubble", "log"]),
        },
      }, ["name", "purpose", "pomodoroPhase", "avatarStatus", "durationSeconds", "actions"]),
    },
  }, ["heartbeatIntervalSeconds", "goal", "stages"]),
  clock: object({ action: choice(["set", "stop"]), clock: clockSchema, requestId: text }, ["action"]),
  query_status: object({ requestId: text }),
  music_album_create: object({
    albumTitle: text, musicTitles: { type: "array", items: text, minItems: 1 }, requestId: text,
  }, ["albumTitle", "musicTitles"]),
  noteboard_create: object({ propId: text, data: { type: "string", minLength: 1, maxLength: 200 } }, ["propId", "data"]),
  bot_message_history: object({ avatarId: text, limit: { type: "integer", minimum: 1, maximum: 30 } }),
  bot_message: object({
    toAvatarId: text, depth: nonNegativeInteger, bubble: text, poseType: choice(poses), action: text, log: text,
  }, ["toAvatarId", "depth", "bubble"]),
};

const usage: Record<KichiOperation, string> = {
  switch_host: "Change environment and reconnect; host is required only for test.",
  rejoin: "Request rejoin with the saved identity; acceptance is not a server acknowledgement.",
  leave: "Leave and wait for acknowledgement.",
  connection_status: "Local connection and identity readiness. Use query_status for room state.",
  action: "Use actions[poseType]. verify defaults true; bubble/log should be short. Room props come from query_status.",
  glance: "Brief camera glance. Defaults: target=camera, duration=1.8 seconds.",
  idle_plan: "Action durations must total each stage; stages must total heartbeatIntervalSeconds. Once actions: at most 30 seconds each.",
  clock: "Visual timer only. set requires clock; stop forbids it. Pomodoro requires kichiSeconds,shortBreakSeconds,longBreakSeconds,sessionCount; countDown requires durationSeconds. running=true,currentSession=1,phase=focus,elapsedSeconds=0 by default; remainingSeconds defaults to the phase duration.",
  query_status: "Room, avatars, props, notes, timer and quotas. Query before notes or music.",
  music_album_create: "Use exact track titles from this schema. Query status for today's availability first.",
  noteboard_create: "Query status for board propId and quota first. Do not repeat recent notes.",
  bot_message_history: "Recent bot conversations only; limit defaults to 10, maximum 30.",
  bot_message: "Resolve the recipient with kichi_query_status; * broadcasts. Increment received depth. Optional poseType/action must be supplied together; use kichi_get_config for names.",
};

function operationName(name: string): KichiOperation {
  if (!(OPERATIONS as readonly string[]).includes(name)) {
    throw new Error(`Unknown Kichi operation: ${name}`);
  }
  return name as KichiOperation;
}

export function describeKichiOperation(name: string) {
  const operation = operationName(name);
  let parameters = schemas[operation];
  if (operation === "music_album_create") {
    parameters = { ...parameters, properties: {
      ...parameters.properties,
      musicTitles: { type: "array", items: choice(getMusicTitleEnum()), minItems: 1 },
    } };
  }
  const result: { parameters: ObjectSchema; usage: string; actions?: unknown } = { parameters, usage: usage[operation] };
  if (operation === "action") {
    const actions = loadStaticConfig().actions;
    result.actions = Object.fromEntries(poses.map((pose) => [pose, actions[pose].map((entry) => entry.name)]));
  } else if (operation === "idle_plan") {
    result.actions = loadStaticConfig().actions;
  }
  return result;
}

// Validate only the JSON-schema subset used above; Core validates the Kichi domain rules.
function validate(schema: Schema, value: unknown, field: string): void {
  switch (schema.type) {
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(schema.properties, key)) throw new Error(`Unknown parameter: ${field}.${key}`);
        validate(schema.properties[key], record[key], `${field}.${key}`);
      }
      for (const key of schema.required) {
        if (!Object.hasOwn(record, key)) throw new Error(`${field}.${key} is required`);
      }
      return;
    }
    case "array":
      if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
      if (schema.minItems !== undefined && value.length < schema.minItems) throw new Error(`${field} requires at least ${schema.minItems} item(s)`);
      value.forEach((item, index) => validate(schema.items, item, `${field}[${index}]`));
      return;
    case "string":
      if (typeof value !== "string") throw new Error(`${field} must be a string`);
      if (schema.minLength !== undefined && value.trim().length < schema.minLength) throw new Error(`${field} must not be blank`);
      if (schema.maxLength !== undefined && value.trim().length > schema.maxLength) throw new Error(`${field} must be at most ${schema.maxLength} characters`);
      if (schema.enum && !schema.enum.includes(value)) throw new Error(`${field} must be one of: ${schema.enum.join(", ")}`);
      return;
    case "boolean":
      if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
      return;
    case "integer":
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) throw new Error(`${field} must be a finite ${schema.type}`);
      if (schema.minimum !== undefined && value < schema.minimum) throw new Error(`${field} must be >= ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) throw new Error(`${field} must be <= ${schema.maximum}`);
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) throw new Error(`${field} must be > ${schema.exclusiveMinimum}`);
  }
}

function requireSuccess(operation: string, result: { success?: unknown; error?: unknown; errorCode?: unknown; errorMessage?: unknown; message?: unknown }): void {
  if (result.success !== false && !result.errorCode) return;
  const detail = [result.errorCode, result.errorMessage, result.error, result.message]
    .filter((value): value is string => typeof value === "string" && value.length > 0).join(": ");
  throw new Error(`Kichi ${operation} failed${detail ? `: ${detail}` : ""}`);
}

export function connectionStatus(service: KichiForwarderService) {
  const status = service.getConnectionStatus();
  return {
    connected: status.connected, environment: status.environment, host: status.host,
    avatarId: status.avatarId, websocketState: status.websocketState,
    hasIdentity: status.hasIdentity, hasAuthKey: status.hasAuthKey,
    pendingRequestCount: status.pendingRequestCount, reconnectScheduled: status.reconnectScheduled,
  };
}

function targetEnvironment(parameters: Record<string, unknown>) {
  if (parameters.environment !== "test" && parameters.host !== undefined) throw new Error("host is only accepted for the test environment");
  const target = resolveJoinEnvironmentHost(parameters);
  if (target.error) throw new Error(target.error);
  if (!target.host || !target.environment) throw new Error("Kichi environment did not resolve to a host");
  return { host: target.host, environment: target.environment };
}

export async function executeKichiOperation(service: KichiForwarderService, name: string, args: unknown): Promise<unknown> {
  const operation: ExecutableOperation = name === "join" ? "join" : operationName(name);
  validate(schemas[operation], args, "parameters");
  const p = args as Record<string, unknown>;
  const string = (key: string): string => (p[key] as string).trim();
  const optionalString = (key: string): string | undefined => p[key] === undefined ? undefined : string(key);

  switch (operation) {
    case "join": {
      const target = targetEnvironment(p);
      const avatarId = string("avatarId");
      const tags = normalizeJoinTags(p.tags);
      if (tags.error) throw new Error(tags.error);
      const current = service.getConnectionStatus();
      const sameHost = current.host !== undefined && normalizeKichiHost(current.host) === normalizeKichiHost(target.host);
      if (current.connected && (!sameHost || current.avatarId !== avatarId)) {
        requireSuccess("leave before join", await service.leave());
      }
      if (!sameHost || current.environment !== target.environment) await service.switchHost(target.host, target.environment);
      const joined = await service.join(avatarId, optionalString("botName") ?? "Hermes", optionalString("bio") ?? "A Kichi companion.", tags.tags!, "hermes");
      requireSuccess(operation, joined);
      return { confirmed: true, avatarId, environment: target.environment };
    }
    case "switch_host": {
      const target = targetEnvironment(p);
      await service.switchHost(target.host, target.environment);
      return connectionStatus(service);
    }
    case "rejoin": {
      const result = service.requestRejoin();
      if (!result.accepted) throw new Error(result.message);
      return { accepted: true, confirmed: false, mode: result.mode };
    }
    case "leave":
      requireSuccess(operation, await service.leave());
      return { confirmed: true };
    case "connection_status":
      return connectionStatus(service);
    case "bot_message_history":
      return { entries: service.readRecentBotMessageTranscript(p.limit === undefined ? 10 : p.limit as number, optionalString("avatarId")) };
  }

  if (!service.isConnected() || !service.hasValidIdentity()) throw new Error("Not connected to Kichi; join first");
  switch (operation) {
    case "action": {
      const poseType = p.poseType as PoseType;
      const action = getActionDefinition(poseType, string("action"));
      const bubble = optionalString("bubble") ?? action.name;
      const log = optionalString("log") ?? "";
      const avatarStatus = p.avatarStatus as AvatarStatus;
      const propId = optionalString("propId");
      if (p.verify !== false) {
        const ack = await service.sendStatusVerified(poseType, action.name, bubble, log, getActionPlayback(action), avatarStatus, propId);
        return { confirmed: true, poseType: ack.poseType, action: ack.action, ...(ack.warning ? { warning: ack.warning } : {}) };
      }
      service.sendAction({ poseType, action: action.name, bubble, log, avatarStatus, ...(propId ? { propId } : {}) });
      return { sent: true, confirmed: false };
    }
    case "glance": {
      const ack = await service.sendGlance("camera", p.duration === undefined ? 1.8 : p.duration as number, optionalString("requestId"));
      return { confirmed: true, target: ack.target };
    }
    case "idle_plan": {
      const result = normalizeIdlePlan(p);
      if (!result.idlePlan) throw new Error(result.error);
      const { totalDurationSeconds: _total, ...plan } = result.idlePlan;
      if (!service.sendIdlePlan(plan)) throw new Error("Kichi idle plan was not sent");
      return { sent: true, confirmed: false };
    }
    case "clock": {
      if (p.action === "stop") {
        if (p.clock !== undefined) throw new Error("clock is only accepted when action is set");
        if (!service.sendClock("stop", undefined, optionalString("requestId"))) throw new Error("Kichi clock command was not sent");
      } else {
        if (p.clock === undefined) throw new Error("clock is required when action is set");
        const clock = p.clock as Record<string, unknown>;
        const fields: Record<string, readonly string[]> = {
          pomodoro: ["mode", "running", "kichiSeconds", "shortBreakSeconds", "longBreakSeconds", "sessionCount", "currentSession", "phase", "remainingSeconds"],
          countDown: ["mode", "running", "durationSeconds", "remainingSeconds"],
          countUp: ["mode", "running", "elapsedSeconds"],
        };
        for (const key of Object.keys(clock)) {
          if (!fields[clock.mode as string].includes(key)) throw new Error(`clock.${key} is not valid for ${clock.mode}`);
        }
        const result = normalizeClockConfig(clock);
        if (!result.clock) throw new Error(result.error);
        if (!service.sendClock("set", result.clock, optionalString("requestId"))) throw new Error("Kichi clock command was not sent");
      }
      return { sent: true, confirmed: false };
    }
    case "query_status": {
      const result = await service.queryStatus(optionalString("requestId"));
      requireSuccess(operation, result);
      return result;
    }
    case "music_album_create": {
      const titles = normalizeMusicTitles(p.musicTitles);
      if (titles.invalidTitles.length > 0) throw new Error(`Unknown music titles: ${titles.invalidTitles.join(", ")}`);
      if (titles.titles.length === 0) throw new Error("musicTitles must contain at least one known track");
      const requestId = service.createMusicAlbum(string("albumTitle"), titles.titles, optionalString("requestId"));
      return { sent: true, confirmed: false, requestId };
    }
    case "noteboard_create":
      service.createNotesBoardNote(string("propId"), string("data"));
      return { sent: true, confirmed: false };
    case "bot_message": {
      if ((p.poseType === undefined) !== (p.action === undefined)) throw new Error("poseType and action must be supplied together");
      const poseType = p.poseType as PoseType | undefined;
      const action = poseType ? getActionDefinition(poseType, string("action")) : undefined;
      const result = await service.sendBotMessage(string("toAvatarId"), p.depth as number, string("bubble"), {
        ...(poseType && action ? { poseType, action: action.name, playback: getActionPlayback(action) } : {}),
        ...(p.log === undefined ? {} : { log: string("log") }),
      });
      requireSuccess(operation, result);
      return result;
    }
  }
}

export interface KichiToolDefinition {
  name: string;
  description: string;
  parameters: ObjectSchema;
}

export function listKichiTools(): KichiToolDefinition[] {
  return [
    {
      name: "kichi_get_config",
      description: "Read the bundled Kichi actions and music catalog.",
      parameters: object({}),
    },
    {
      name: "kichi_join",
      description: "Join Kichi in the selected environment. Test requires host. botName and bio default to Hermes and A Kichi companion. source is hermes.",
      parameters: KICHI_JOIN_PARAMETERS,
    },
    ...OPERATIONS.map((operation) => {
      const definition = describeKichiOperation(operation);
      const actions = definition.actions === undefined ? "" : ` Available actions: ${JSON.stringify(definition.actions)}`;
      return { name: `kichi_${operation}`, description: definition.usage + actions, parameters: definition.parameters };
    }),
  ];
}

export async function executeKichiTool(service: KichiForwarderService, name: string, args: unknown): Promise<unknown> {
  if (name === "kichi_get_config") {
    validate(object({}), args, "parameters");
    return loadStaticConfig();
  }
  const operation = name.startsWith("kichi_") ? name.slice("kichi_".length) : "";
  if (operation !== "join" && !(OPERATIONS as readonly string[]).includes(operation)) {
    throw new Error(`Unknown Kichi tool: ${name}`);
  }
  return executeKichiOperation(service, operation, args);
}
