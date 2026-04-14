import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { parse } from "./src/config.js";
import { KichiForwarderService } from "./src/service.js";
import type {
  ActionDefinition,
  ActionPlayback,
  ActionResult,
  Album,
  ClockAction,
  ClockConfig,
  KichiState,
  KichiStaticConfig,
  PomodoroPhase,
  PoseType,
} from "./src/types.js";
const BUNDLED_STATIC_CONFIG_PATH = new URL("./config/kichi-config.json", import.meta.url);
const DEFAULT_LLM_RUNTIME_ENABLED = true;
const FIXED_HOOK_STATUSES: Record<string, ActionResult> = {
  beforePromptBuild: {
    poseType: "sit",
    action: "Thinking",
    bubble: "Planning task",
    log: "I'm reading the request and getting started.",
  },
  beforeToolCall: {
    poseType: "sit",
    action: "Typing with Keyboard",
    bubble: "Working step",
    log: "I'm at the keyboard and working through this step.",
  },
  agentEndSuccess: {
    poseType: "stand",
    action: "Yay",
    bubble: "Task complete",
    log: "I wrapped it up and everything landed cleanly.",
  },
  agentEndFailure: {
    poseType: "stand",
    action: "Tired",
    bubble: "Task failed",
    log: "I hit a problem here and need another pass.",
  },
};

const KICHI_WORLD_DIR = path.join(os.homedir(), ".openclaw", "kichi-world");
const STATE_PATH = path.join(KICHI_WORLD_DIR, "state.json");
const MAX_NOTEBOARD_TEXT_LENGTH = 200;
const MAX_MESSAGE_RECEIVED_PREVIEW_WIDTH = 20;
const MAX_AGENT_END_PREVIEW_WIDTH = 10;
const MESSAGE_RECEIVED_ELLIPSIS = "...";
let cachedStaticConfig: KichiStaticConfig | null = null;
let cachedStaticConfigMtime = 0;
let service: KichiForwarderService | null = null;
let pluginApi: OpenClawPluginApi | null = null;

function isAlbumConfig(value: unknown): value is Album {
  if (!value || typeof value !== "object") {
    return false;
  }

  const config = value as Partial<Album>;
  return typeof config.albumCount === "number"
    && typeof config.trackCount === "number"
    && Array.isArray(config.track)
    && config.track.every((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const track = item as Record<string, unknown>;
      return typeof track.album === "string"
        && typeof track.name === "string"
        && Array.isArray(track.tags)
        && track.tags.every((tag) => typeof tag === "string");
    });
}

function loadRuntimeAlbumConfig(): Album {
  return loadStaticConfig().album;
}

function getMusicTitleLookup(): Map<string, string> {
  return new Map(
    loadRuntimeAlbumConfig().track.map((item) => [item.name.toLowerCase(), item.name] as const),
  );
}

function getMusicTitleEnum(): string[] {
  return loadRuntimeAlbumConfig().track.map((item) => item.name);
}

function getMusicTitleExamples(): string[] {
  return loadRuntimeAlbumConfig().track.slice(0, 10).map((item) => item.name);
}

function isActionDefinition(value: unknown): value is ActionDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }
  const action = value as Partial<ActionDefinition>;
  return typeof action.name === "string"
    && action.name.trim().length > 0
    && (action.playback === "loop" || action.playback === "once")
    && (action.resumeAction === undefined || (typeof action.resumeAction === "string" && action.resumeAction.trim().length > 0));
}

function isPoseActions(value: unknown): value is Record<PoseType, ActionDefinition[]> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const actions = value as Partial<Record<PoseType, unknown>>;
  return ["stand", "sit", "lay", "floor"].every((pose) =>
    Array.isArray(actions[pose as PoseType])
    && (actions[pose as PoseType] as unknown[]).every((item) => isActionDefinition(item)));
}

function normalizeActionDefinitions(actions: Record<PoseType, ActionDefinition[]>): Record<PoseType, ActionDefinition[]> {
  const normalized = {} as Record<PoseType, ActionDefinition[]>;
  for (const pose of ["stand", "sit", "lay", "floor"] as PoseType[]) {
    const entries = actions[pose];
    const seen = new Set<string>();
    normalized[pose] = entries.map((entry) => {
      const name = entry.name.trim();
      const key = name.toLowerCase();
      if (seen.has(key)) {
        throw new Error(`config/kichi-config.json contains duplicate action "${name}" for pose "${pose}"`);
      }
      seen.add(key);
      const playback = entry.playback;
      const resumeAction = typeof entry.resumeAction === "string" ? entry.resumeAction.trim() : undefined;
      if (playback === "loop" && resumeAction) {
        throw new Error(`config/kichi-config.json action "${name}" for pose "${pose}" cannot set resumeAction when playback is loop`);
      }
      return {
        name,
        playback,
        ...(resumeAction ? { resumeAction } : {}),
      };
    });
    const available = new Set(normalized[pose].map((entry) => entry.name.toLowerCase()));
    for (const entry of normalized[pose]) {
      if (entry.playback === "once" && !entry.resumeAction) {
        throw new Error(`config/kichi-config.json action "${entry.name}" for pose "${pose}" must set resumeAction when playback is once`);
      }
      if (entry.resumeAction && !available.has(entry.resumeAction.toLowerCase())) {
        throw new Error(`config/kichi-config.json action "${entry.name}" for pose "${pose}" references unknown resumeAction "${entry.resumeAction}"`);
      }
    }
  }
  return normalized;
}

function normalizeStaticConfig(value: unknown): KichiStaticConfig {
  const raw = value && typeof value === "object" ? (value as Partial<KichiStaticConfig>) : {};
  const actions = raw.actions;
  const album = raw.album;
  if (!isPoseActions(actions)) {
    throw new Error("config/kichi-config.json must include valid actions");
  }
  if (!isAlbumConfig(album)) {
    throw new Error("config/kichi-config.json must include a valid album object");
  }
  return {
    album,
    actions: normalizeActionDefinitions(actions),
  };
}

function readState(): KichiState {
  if (!fs.existsSync(STATE_PATH)) {
    return {
      llmRuntimeEnabled: DEFAULT_LLM_RUNTIME_ENABLED,
    };
  }
  const data = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as Partial<KichiState>;
  if (data.currentHost !== undefined && (typeof data.currentHost !== "string" || !data.currentHost.trim())) {
    throw new Error(`Invalid currentHost in ${STATE_PATH}`);
  }
  if (typeof data.llmRuntimeEnabled !== "boolean") {
    throw new Error(`Invalid llmRuntimeEnabled in ${STATE_PATH}`);
  }
  return {
    ...(typeof data.currentHost === "string" ? { currentHost: data.currentHost } : {}),
    llmRuntimeEnabled: data.llmRuntimeEnabled,
  };
}

function loadStaticConfig(): KichiStaticConfig {
  const configPath = fileURLToPath(BUNDLED_STATIC_CONFIG_PATH);
  const stat = fs.statSync(configPath);
  if (!cachedStaticConfig || stat.mtimeMs !== cachedStaticConfigMtime) {
    const raw = fs.readFileSync(configPath, "utf-8");
    cachedStaticConfig = normalizeStaticConfig(JSON.parse(raw));
    cachedStaticConfigMtime = stat.mtimeMs;
  }
  return cachedStaticConfig;
}

function sendStatusUpdate(status: ActionResult): void {
  const actionDefinition = getActionDefinition(status.poseType, status.action);
  service?.sendStatus(
    status.poseType,
    actionDefinition.name,
    status.bubble || status.action,
    typeof status.log === "string" ? status.log.trim() : "",
    getActionPlayback(actionDefinition),
  );
}

function isLlmRuntimeEnabled(): boolean {
  return readState().llmRuntimeEnabled;
}

function syncFixedStatus(status: ActionResult): void {
  if (!service?.hasValidIdentity() || !service?.isConnected()) {
    return;
  }
  const bubbleText = status.bubble.trim() || status.action;
  const logText = typeof status.log === "string" && status.log.trim()
    ? status.log.trim()
    : bubbleText;
  sendStatusUpdate({
    ...status,
    bubble: bubbleText,
    log: logText,
  });
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (item) => item.segment);
  }
  return Array.from(text);
}

function getDisplayWidth(segment: string): number {
  if (/[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6]/u.test(segment)) {
    return 2;
  }
  if (/\p{Extended_Pictographic}/u.test(segment)) {
    return 2;
  }
  return 1;
}

function getTextDisplayWidth(text: string): number {
  return splitGraphemes(text).reduce((total, segment) => total + getDisplayWidth(segment), 0);
}

function truncateByDisplayWidth(text: string, maxWidth: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  const segments = splitGraphemes(trimmed);
  const ellipsisWidth = getTextDisplayWidth(MESSAGE_RECEIVED_ELLIPSIS);
  let currentWidth = 0;
  let result = "";

  for (const segment of segments) {
    const nextWidth = getDisplayWidth(segment);
    if (currentWidth + nextWidth > maxWidth) {
      return result.trimEnd() + MESSAGE_RECEIVED_ELLIPSIS;
    }
    if (currentWidth + nextWidth + ellipsisWidth > maxWidth && result) {
      return result.trimEnd() + MESSAGE_RECEIVED_ELLIPSIS;
    }
    result += segment;
    currentWidth += nextWidth;
  }

  return result;
}

function stripReplyTag(text: string): string {
  return text.replace(/^\[\[\s*reply_to(?::[^\]]+|_current)?\s*\]\]\s*/i, "").trim();
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return stripReplyTag(content);
  }
  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const part = item as Record<string, unknown>;
    if (typeof part.text === "string") {
      parts.push(part.text);
      continue;
    }
    const nested = part.text;
    if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>).value === "string") {
      parts.push((nested as Record<string, unknown>).value as string);
    }
  }
  return stripReplyTag(parts.join("\n").trim());
}

function getLastAssistantPreview(messages: unknown, maxWidth: number): string {
  if (!Array.isArray(messages)) {
    return "";
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || typeof message !== "object") {
      continue;
    }
    const record = message as Record<string, unknown>;
    if (record.role !== "assistant") {
      continue;
    }
    const text = extractTextFromContent(record.content);
    if (!text) {
      continue;
    }
    return truncateByDisplayWidth(text, maxWidth);
  }

  return "";
}

async function handleMessageReceivedHook(content: string): Promise<void> {
  const connected = service?.isConnected() ?? false;
  const hasIdentity = service?.hasValidIdentity() ?? false;
  pluginApi?.logger.info(`[kichi] message_received hook fired (connected=${connected}, hasIdentity=${hasIdentity})`);
  if (!hasIdentity || !connected) {
    pluginApi?.logger.warn("[kichi] skipped message_received notify because service is not ready");
    return;
  }
  const trimmed = truncateByDisplayWidth(content, MAX_MESSAGE_RECEIVED_PREVIEW_WIDTH);
  pluginApi?.logger.info(`[kichi] sending message_received notify with preview: ${trimmed || "(empty)"}`);
  service.sendHookNotify("message_received", `"${trimmed}"`);
}

function registerPluginHooks(api: OpenClawPluginApi): void {
  api.on("before_prompt_build", () => {
    if (!service?.hasValidIdentity() || !service?.isConnected()) {
      return;
    }
    if (!isLlmRuntimeEnabled()) {
      syncFixedStatus(FIXED_HOOK_STATUSES.beforePromptBuild);
      return;
    }
    return {
      prependContext: buildKichiPrompt(),
    };
  });

  api.on("before_tool_call", (_event, _ctx) => {
    if (!isLlmRuntimeEnabled()) {
      syncFixedStatus(FIXED_HOOK_STATUSES.beforeToolCall);
    }
  });

  api.on("message_received", async (event) => {
    await handleMessageReceivedHook(event.content);
  });

  api.on("agent_end", (event, ctx) => {
    const preview = getLastAssistantPreview(event.messages, MAX_AGENT_END_PREVIEW_WIDTH);
    pluginApi?.logger.info(
      `[kichi] agent_end hook fired (trigger=${ctx.trigger ?? "unknown"}, success=${event.success}, durationMs=${event.durationMs ?? 0}, error=${event.error ?? ""}, preview=${preview || "(empty)"})`,
    );
    if (ctx.trigger === "heartbeat") {
      return;
    }
    if (event.success && preview) {
      pluginApi?.logger.info(`[kichi] sending before_send_message notify from agent_end with bubble: ${preview}`);
      service?.sendHookNotify("before_send_message", preview);
    }
    if (isLlmRuntimeEnabled()) {
      return;
    }
    syncFixedStatus(event.success ? FIXED_HOOK_STATUSES.agentEndSuccess : FIXED_HOOK_STATUSES.agentEndFailure);
  });
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeJoinTags(value: unknown): { tags?: string[]; error?: string } {
  if (value === undefined) {
    return { tags: [] };
  }
  if (!Array.isArray(value)) {
    return { error: "tags must be an array of strings" };
  }

  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      return { error: "tags must be an array of strings" };
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(trimmed);
  }

  return { tags };
}

function isClockAction(value: unknown): value is ClockAction {
  return ["set", "stop"].includes(String(value));
}


function isPomodoroPhase(value: unknown): value is PomodoroPhase {
  return ["kichiing", "shortBreak", "longBreak"].includes(String(value));
}

function getPomodoroPhaseDuration(
  phase: PomodoroPhase,
  kichiSeconds: number,
  shortBreakSeconds: number,
  longBreakSeconds: number,
): number {
  if (phase === "shortBreak") {
    return shortBreakSeconds;
  }
  if (phase === "longBreak") {
    return longBreakSeconds;
  }
  return kichiSeconds;
}

function normalizeClockConfig(value: unknown): { clock?: ClockConfig; error?: string } {
  if (!isPlainObject(value)) {
    return { error: "clock must be an object" };
  }

  const mode = value.mode;
  if (!["pomodoro", "countDown", "countUp"].includes(String(mode))) {
    return { error: "clock.mode must be pomodoro, countDown, or countUp" };
  }

  const running = typeof value.running === "boolean" ? value.running : true;

  if (mode === "pomodoro") {
    const kichiSeconds = value.kichiSeconds;
    const shortBreakSeconds = value.shortBreakSeconds;
    const longBreakSeconds = value.longBreakSeconds;
    const sessionCount = value.sessionCount;
    const currentSession = value.currentSession ?? 1;
    const phase = value.phase ?? "kichiing";

    if (!isPositiveInteger(kichiSeconds)) {
      return { error: "clock.kichiSeconds must be a positive integer" };
    }
    if (!isPositiveInteger(shortBreakSeconds)) {
      return { error: "clock.shortBreakSeconds must be a positive integer" };
    }
    if (!isPositiveInteger(longBreakSeconds)) {
      return { error: "clock.longBreakSeconds must be a positive integer" };
    }
    if (!isPositiveInteger(sessionCount)) {
      return { error: "clock.sessionCount must be a positive integer" };
    }
    if (!isPositiveInteger(currentSession)) {
      return { error: "clock.currentSession must be a positive integer" };
    }
    if (currentSession > sessionCount) {
      return { error: "clock.currentSession cannot be greater than clock.sessionCount" };
    }
    if (!isPomodoroPhase(phase)) {
      return { error: "clock.phase must be kichiing, shortBreak, or longBreak" };
    }

    const defaultRemainingSeconds = getPomodoroPhaseDuration(
      phase,
      kichiSeconds,
      shortBreakSeconds,
      longBreakSeconds,
    );
    const remainingSeconds = value.remainingSeconds ?? defaultRemainingSeconds;
    if (!isNonNegativeInteger(remainingSeconds)) {
      return { error: "clock.remainingSeconds must be a non-negative integer" };
    }

    return {
      clock: {
        mode: "pomodoro",
        running,
        kichiSeconds,
        shortBreakSeconds,
        longBreakSeconds,
        sessionCount,
        currentSession,
        phase,
        remainingSeconds,
      },
    };
  }

  if (mode === "countDown") {
    const durationSeconds = value.durationSeconds;
    if (!isPositiveInteger(durationSeconds)) {
      return { error: "clock.durationSeconds must be a positive integer" };
    }
    const remainingSeconds = value.remainingSeconds ?? durationSeconds;
    if (!isNonNegativeInteger(remainingSeconds)) {
      return { error: "clock.remainingSeconds must be a non-negative integer" };
    }
    return {
      clock: {
        mode: "countDown",
        running,
        durationSeconds,
        remainingSeconds,
      },
    };
  }

  const elapsedSeconds = value.elapsedSeconds ?? 0;
  if (!isNonNegativeInteger(elapsedSeconds)) {
    return { error: "clock.elapsedSeconds must be a non-negative integer" };
  }
  return {
    clock: {
      mode: "countUp",
      running,
      elapsedSeconds,
    },
  };
}

function normalizeMusicTitles(value: unknown): { titles: string[]; invalidTitles: string[] } {
  if (!Array.isArray(value)) {
    return { titles: [], invalidTitles: [] };
  }

  const musicTitleLookup = getMusicTitleLookup();
  const titles: string[] = [];
  const invalidTitles: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      invalidTitles.push(String(item));
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    const canonicalTitle = musicTitleLookup.get(key);
    if (!canonicalTitle) {
      invalidTitles.push(trimmed);
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    titles.push(canonicalTitle);
  }

  return { titles, invalidTitles };
}

function buildMusicAlbumToolDescription(): string {
  return [
    "Create a custom Kichi music album.",
    "Query status first, then choose track names from the values injected into this tool schema from the static config bundled with the plugin package.",
  ].join("\n");
}

function isKichiHost(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0
    && !trimmed.includes("://")
    && !trimmed.includes("/")
    && !trimmed.includes("?")
    && !trimmed.includes("#");
}

function buildMusicTitlesDescription(): string {
  return [
    "Track names are injected into this tool schema from the static config bundled with the plugin package.",
    "Use exact names only; the available titles are injected into this tool schema.",
  ].join(" ");
}

function getActionDefinition(poseType: PoseType, action: string): ActionDefinition {
  const poseActions = loadStaticConfig().actions[poseType];
  const matched = poseActions.find((entry) => entry.name.toLowerCase() === action.toLowerCase());
  if (!matched) {
    throw new Error(`Unknown action "${action}" for poseType "${poseType}"`);
  }
  return matched;
}

function getActionPlayback(action: ActionDefinition): ActionPlayback {
  return action.playback === "once"
    ? {
        mode: "once",
        resumeAction: action.resumeAction,
      }
    : {
        mode: "loop",
      };
}

function formatActionList(actions: ActionDefinition[], playback: ActionPlayback["mode"]): string {
  return actions
    .filter((entry) => entry.playback === playback)
    .map((entry) => entry.name)
    .join(", ");
}

function buildKichiActionDescription(): string {
  const actions = loadStaticConfig().actions;
  return [
    "Directly control the avatar inside Kichi World.",
    "Use this whenever the user explicitly asks you to make the Kichi avatar sit down, stand up, lie down, floor-sit, type, read, meditate, celebrate, or perform another listed animation.",
    "For most work, prefer a sit pose and switch actions as the task moves between stages.",
    `stand actions: ${actions.stand.map((entry) => entry.name).join(", ")}`,
    `sit actions: ${actions.sit.map((entry) => entry.name).join(", ")}`,
    `lay actions: ${actions.lay.map((entry) => entry.name).join(", ")}`,
    `floor actions: ${actions.floor.map((entry) => entry.name).join(", ")}`,
  ].join("\n");
}

function buildKichiPrompt(): string {
  return [
    "Kichi avatar control and status sync are available via `kichi_action` and `kichi_clock`.",
    "If the user gives a direct Kichi pose or action request, fulfill it with `kichi_action`.",
    "Write the visible reply as a natural user-facing response. Keep `kichi_action`, `kichi_clock`, and sync steps internal and absent from the visible reply.",
    "",
    "kichi_action timing (all required when sync is active):",
    "1. Task start: call BEFORE your first tool call OR before composing a multi-paragraph reply. For most work, start from a sit pose unless the user asked for a different pose or the task clearly fits another pose better.",
    "2. Step switch: call when the task moves into a different stage. Keep the pose aligned with the work, usually staying seated while switching actions within the task as needed.",
    "3. Task end: call BEFORE final reply. Use the order `kichi_action` -> reply.",
    "bubble: 2-5 word companion speech. log: one short natural first-person sentence under 15 words. Match the language of the bubble and mention the current action and immediate focus like a real companion.",
    "",
    "kichi_clock: set countDown for tasks with 2+ steps or >10s work. Skip for quick one-shots.",
    "",
    "User opt-out, Kichi config/test work, and explicit pose requests take priority over sync.",
  ].join("\n");
}

const plugin = {
  id: "kichi-forwarder",
  name: "Kichi Forwarder",
  configSchema: { parse },

  register(api: OpenClawPluginApi) {
    pluginApi = api;
    registerPluginHooks(api);
    const musicTitleEnum = getMusicTitleEnum();

    api.registerService({
      id: "kichi-forwarder",
      start: (ctx) => {
        parse(ctx.config.plugins?.entries?.["kichi-forwarder"]?.config);
        service = new KichiForwarderService(api.logger);
        return service.start();
      },
      stop: () => service?.stop(),
    });

    api.registerTool({
      name: "kichi_join",
      description: "Join Kichi world with avatarId, the current bot name, a short bio, and personality tags",
      parameters: {
        type: "object",
        properties: {
          avatarId: { type: "string", description: "Avatar ID to join Kichi world" },
          botName: {
            type: "string",
            description: "Current bot name to include in the join message",
          },
          bio: {
            type: "string",
            description: "Short bio covering OpenClaw personality and role",
          },
          tags: {
            type: "array",
            description: "Optional list of OpenClaw self-perceived personality tags",
            items: { type: "string" },
          },
        },
        required: ["botName", "bio"],
      },
      execute: async (_toolCallId, params) => {
        let avatarId = (params as { avatarId?: string } | null)?.avatarId;
        const botName = (params as { botName?: string } | null)?.botName?.trim();
        const bio = (params as { bio?: string } | null)?.bio?.trim();
        const { tags, error: tagsError } = normalizeJoinTags(
          (params as { tags?: unknown } | null)?.tags,
        );
        if (!avatarId) {
          avatarId = service?.readSavedAvatarId() ?? undefined;
        }
        if (!avatarId) {
          return { success: false, error: "No avatarId" };
        }
        if (!botName) {
          return { success: false, error: "No botName" };
        }
        if (!bio) {
          return { success: false, error: "No bio" };
        }
        if (tagsError) {
          return { success: false, error: tagsError };
        }
        const result = await service?.join(avatarId, botName, bio, tags ?? []);
        if (!result) {
          return { success: false, error: "Kichi service is not initialized" };
        }
        if (result.success) {
          return { success: true, authKey: result.authKey };
        }
        return {
          success: false,
          error: result.error,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
        };
      },
    });

    api.registerTool({
      name: "kichi_switch_host",
      description:
        "Switch Kichi runtime host and reconnect immediately without restarting the gateway.",
      parameters: {
        type: "object",
        properties: {
          host: {
            type: "string",
            description: "Target Kichi host, for example your.kichi.host or 127.0.0.1",
          },
        },
        required: ["host"],
      },
      execute: async (_toolCallId, params) => {
        if (!service) {
          return { success: false, error: "Kichi service is not initialized" };
        }
        const host = (params as { host?: unknown } | null)?.host;
        if (!isKichiHost(host)) {
          return { success: false, error: "host must be a non-empty hostname without protocol or path" };
        }

        const status = await service.switchHost(host.trim());
        return {
          success: true,
          host: host.trim(),
          status,
        };
      },
    });

    api.registerTool({
      name: "kichi_rejoin",
      description:
        "Request an immediate rejoin attempt with saved avatarId/authKey. Rejoin is also sent automatically after reconnect.",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        if (!service) {
          return { success: false, error: "Kichi service is not initialized" };
        }

        const result = service.requestRejoin();
        return {
          success: result.accepted,
          ...result,
          status: service.getConnectionStatus(),
        };
      },
    });

    api.registerTool({
      name: "kichi_leave",
      description: "Leave Kichi world",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        const result = await service?.leave();
        if (!result) {
          return { success: false, error: "Kichi service is not initialized" };
        }
        if (result.success) {
          return { success: true };
        }
        return {
          success: false,
          error: result.error,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
        };
      },
    });

    api.registerTool({
      name: "kichi_status",
      description: "Read current Kichi connection status and identity readiness",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        if (!service) {
          return { success: false, error: "Kichi service is not initialized" };
        }
        return {
          success: true,
          status: service.getConnectionStatus(),
        };
      },
    });

    api.registerTool({
      name: "kichi_action",
      description: buildKichiActionDescription(),
      parameters: {
        type: "object",
        properties: {
          poseType: { type: "string", description: "Pose type: stand, sit, lay, or floor" },
          action: {
            type: "string",
            description: "Action name for the selected pose (for example Sit Nicely, Typing with Keyboard, Reading, High Five, or Meditate)",
          },
          bubble: { type: "string", description: "Optional bubble text to display (max 5 words)" },
          log: {
            type: "string",
            description:
              "Short natural first-person sentence under 15 words. Match the language of the bubble and mention the current action and immediate focus.",
          },
        },
        required: ["poseType", "action"],
      },
      execute: async (_toolCallId, params) => {
        const { poseType, action, bubble, log } = (params || {}) as {
          poseType?: string;
          action?: string;
          bubble?: string;
          log?: string;
        };
        if (!poseType || !action) {
          return { success: false, error: "poseType and action parameters are required" };
        }
        if (!["stand", "sit", "lay", "floor"].includes(poseType)) {
          return {
            success: false,
            error: `Invalid poseType: ${poseType}. Must be stand, sit, lay, or floor`,
          };
        }
        if (!service?.hasValidIdentity() || !service?.isConnected()) {
          return { success: false, error: "Not connected to Kichi world" };
        }

        const normalizedPoseType = poseType as PoseType;
        const poseActions = loadStaticConfig().actions[normalizedPoseType];
        const matched = poseActions.find((entry) => entry.name.toLowerCase() === action.toLowerCase());
        if (!matched) {
          return {
            success: false,
            error: `Unknown action "${action}" for poseType "${poseType}"`,
            available: poseActions.map((entry) => entry.name),
          };
        }

        const bubbleText = typeof bubble === "string" && bubble.trim() ? bubble.trim() : matched.name;
        const logText = typeof log === "string" ? log.trim() : "";
        sendStatusUpdate(
          {
            poseType: normalizedPoseType,
            action: matched.name,
            bubble: bubbleText,
            log: logText,
          },
        );
        return {
          success: true,
          poseType: normalizedPoseType,
          action: matched.name,
          bubble: bubbleText,
          log: logText,
          playback: getActionPlayback(matched),
        };
      },
    });
    api.registerTool({
      name: "kichi_clock",
      description:
        "Send clock commands to Kichi world. Supported actions are set and stop.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Clock action: set or stop",
          },
          requestId: {
            type: "string",
            description: "Optional request ID for server-side tracing or deduplication",
          },
          clock: {
            type: "object",
            description: "Required when action=set. Defines the pomodoro, countDown, or countUp clock payload.",
            properties: {
              mode: {
                type: "string",
                description: "Clock mode: pomodoro, countDown, or countUp",
              },
              running: {
                type: "boolean",
                description: "Optional running state. Defaults to true.",
              },
              kichiSeconds: {
                type: "number",
                description: "Pomodoro kichi duration in seconds",
              },
              shortBreakSeconds: {
                type: "number",
                description: "Pomodoro short break duration in seconds",
              },
              longBreakSeconds: {
                type: "number",
                description: "Pomodoro long break duration in seconds",
              },
              sessionCount: {
                type: "number",
                description: "Pomodoro total kichi sessions before long break",
              },
              currentSession: {
                type: "number",
                description: "Pomodoro current session number. Defaults to 1.",
              },
              phase: {
                type: "string",
                description: "Pomodoro phase: kichiing, shortBreak, or longBreak",
              },
              durationSeconds: {
                type: "number",
                description: "Countdown duration in seconds",
              },
              remainingSeconds: {
                type: "number",
                description: "Optional remaining seconds for pomodoro/countDown",
              },
              elapsedSeconds: {
                type: "number",
                description: "Optional elapsed seconds for countUp. Defaults to 0.",
              },
            },
          },
        },
        required: ["action"],
      },
      execute: async (_toolCallId, params) => {
        const { action, requestId, clock } = (params || {}) as {
          action?: unknown;
          requestId?: unknown;
          clock?: unknown;
        };

        if (!isClockAction(action)) {
          return {
            success: false,
            error: "action must be one of: set, stop",
          };
        }
        if (requestId !== undefined && typeof requestId !== "string") {
          return { success: false, error: "requestId must be a string when provided" };
        }
        const normalizedRequestId = typeof requestId === "string" ? requestId : undefined;
        if (!service?.hasValidIdentity() || !service?.isConnected()) {
          return { success: false, error: "Not connected to Kichi world" };
        }

        let normalizedClock: ClockConfig | undefined;
        if (action === "set") {
          const { clock: nextClock, error } = normalizeClockConfig(clock);
          if (!nextClock) {
            return { success: false, error: error ?? "Invalid clock payload" };
          }
          normalizedClock = nextClock;
        }

        const sent = service.sendClock(action, normalizedClock, normalizedRequestId);
        if (!sent) {
          return { success: false, error: "Failed to send clock payload" };
        }

        return {
          success: true,
          action,
          requestId: normalizedRequestId,
          ...(normalizedClock ? { clock: normalizedClock } : {}),
        };
      },
    });

    api.registerTool({
      name: "kichi_query_status",
      description:
        "Query Kichi avatar status (notes, ownerState, idleState, weather/time, timer snapshot, daily note quota, and `hasCreatedMusicAlbumToday`). Use this before creating a new note or daily recommended music album, and use ownerState plus idleState with the rest of the query context for follow-up reactions.",
      parameters: {
        type: "object",
        properties: {
          requestId: {
            type: "string",
            description: "Optional request ID for tracing or deduplication.",
          },
        },
      },
      execute: async (_toolCallId, params) => {
        const requestId = (params as { requestId?: unknown } | null)?.requestId;
        if (requestId !== undefined && typeof requestId !== "string") {
          return { success: false, error: "requestId must be a string when provided" };
        }
        if (!service?.hasValidIdentity() || !service?.isConnected()) {
          return { success: false, error: "Not connected to Kichi world" };
        }

        try {
          const result = await service.queryStatus(
            typeof requestId === "string" ? requestId : undefined,
          );
          return result;
        } catch (error) {
          return {
            success: false,
            error: `Failed to query status: ${error}`,
          };
        }
      },
    });

    api.registerTool({
      name: "kichi_music_album_create",
      description: buildMusicAlbumToolDescription(),
      parameters: {
        type: "object",
        properties: {
          requestId: {
            type: "string",
            description: "Optional request ID for tracing or deduplication.",
          },
          albumTitle: {
            type: "string",
            description: "Custom album title.",
          },
          musicTitles: {
            type: "array",
            description: buildMusicTitlesDescription(),
            items: {
              type: "string",
              enum: musicTitleEnum,
            },
          },
        },
        required: ["albumTitle", "musicTitles"],
      },
      execute: async (_toolCallId, params) => {
        const {
          requestId,
          albumTitle,
          musicTitles,
        } = (params || {}) as {
          requestId?: unknown;
          albumTitle?: unknown;
          musicTitles?: unknown;
        };

        if (requestId !== undefined && typeof requestId !== "string") {
          return { success: false, error: "requestId must be a string when provided" };
        }
        if (typeof albumTitle !== "string" || !albumTitle.trim()) {
          return { success: false, error: "albumTitle is required" };
        }
        if (!Array.isArray(musicTitles)) {
          return { success: false, error: "musicTitles must be an array of track names" };
        }

        const { titles: normalizedTitles, invalidTitles } = normalizeMusicTitles(musicTitles);
        if (normalizedTitles.length === 0) {
          return {
            success: false,
            error: "musicTitles must contain at least one valid track name from the static config bundled with the plugin package",
            examples: getMusicTitleExamples(),
          };
        }
        if (invalidTitles.length > 0) {
          return {
            success: false,
            error: `Unknown musicTitles: ${invalidTitles.join(", ")}`,
            hint: "Use exact track names from the static config bundled with the plugin package",
            examples: getMusicTitleExamples(),
          };
        }
        if (!service?.hasValidIdentity() || !service?.isConnected()) {
          return { success: false, error: "Not connected to Kichi world" };
        }

        try {
          const normalizedRequestId = service.createMusicAlbum(
            albumTitle.trim(),
            normalizedTitles,
            typeof requestId === "string" ? requestId : undefined,
          );
          return {
            success: true,
            requestId: normalizedRequestId,
            albumTitle: albumTitle.trim(),
            musicTitles: normalizedTitles,
            trackCount: normalizedTitles.length,
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to create music album: ${error}`,
          };
        }
      },
    });

    api.registerTool({
      name: "kichi_noteboard_create",
      description:
        "Create a new note on a specific Kichi note board. Prefer querying first so you can avoid duplicate posts and respect rate limits.",
      parameters: {
        type: "object",
        properties: {
          propId: {
            type: "string",
            description: "Board property ID to post to.",
          },
          data: {
            type: "string",
            description: "Note content to create. Maximum 200 characters.",
          },
        },
        required: ["propId", "data"],
      },
      execute: async (_toolCallId, params) => {
        const { propId, data } = (params || {}) as {
          propId?: unknown;
          data?: unknown;
        };
        if (typeof propId !== "string" || !propId.trim()) {
          return { success: false, error: "propId is required" };
        }
        if (typeof data !== "string" || !data.trim()) {
          return { success: false, error: "data is required" };
        }
        if (data.trim().length > MAX_NOTEBOARD_TEXT_LENGTH) {
          return {
            success: false,
            error: `data must be ${MAX_NOTEBOARD_TEXT_LENGTH} characters or fewer`,
          };
        }
        if (!service?.hasValidIdentity() || !service?.isConnected()) {
          return { success: false, error: "Not connected to Kichi world" };
        }

        try {
          service.createNotesBoardNote(propId.trim(), data.trim());
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: `Failed to create note: ${error}`,
          };
        }
      },
    });

  },
};

export default plugin;

