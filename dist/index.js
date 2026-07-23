import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentCommandFromIngress } from "openclaw/plugin-sdk/agent-runtime";
import { parse } from "./src/config.js";
import { normalizeKichiHost } from "./src/host.js";
import { KichiRuntimeManager } from "./src/runtime-manager.js";
const BUNDLED_STATIC_CONFIG_PATH = new URL("./config/kichi-config.json", import.meta.url);
const MATE_DAILY_SCHEDULE_PATH = path.join(os.homedir(), ".openclaw", "kichi-world", "agents", "main", "daily-schedule.json");
function jsonResult(payload) {
    return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
}
const BUNDLED_ENVIRONMENTS_CONFIG_PATH = new URL("./config/environments.json", import.meta.url);
const FIXED_HOOK_STATUSES = {
    beforePromptBuild: {
        poseType: "sit",
        action: "Thinking",
        bubble: "Planning task",
        avatarStatus: "Busy",
        log: "I'm reading the request and getting started.",
    },
    beforeToolCall: {
        poseType: "sit",
        action: "Typing with Keyboard",
        bubble: "Working step",
        avatarStatus: "Busy",
        log: "I'm at the keyboard and working through this step.",
    },
    agentEndSuccess: {
        poseType: "stand",
        action: "Yay",
        bubble: "Task complete",
        avatarStatus: "Idle",
        log: "I wrapped it up and everything landed cleanly.",
    },
    agentEndFailure: {
        poseType: "stand",
        action: "Tired",
        bubble: "Task failed",
        avatarStatus: "Idle",
        log: "I hit a problem here and need another pass.",
    },
};
const MAX_NOTEBOARD_TEXT_LENGTH = 200;
const MAX_MESSAGE_RECEIVED_PREVIEW_WIDTH = 20;
const MAX_AGENT_END_PREVIEW_WIDTH = 10;
const MESSAGE_RECEIVED_ELLIPSIS = "...";
const DEFAULT_GLANCE_DURATION_SECONDS = 1.8;
const IDLE_PLAN_POMODORO_PHASES = ["focus", "shortBreak", "longBreak", "none"];
const AVATAR_STATUSES = ["Idle", "Busy", "Activities", "Break"];
const KICHI_RESIDENCY_RULES = [
    "- Your Kichi avatar is your resident body in Kichi World. Speak about Kichi in first person, as someone who lives there.",
    "- Keep tool names, websocket and status-sync mechanics, and other implementation details out of visible replies.",
    "- Do not invent room details missing from the current Kichi context; say they are unavailable.",
];
let cachedStaticConfig = null;
let cachedStaticConfigMtime = 0;
function isAlbumConfig(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const config = value;
    return typeof config.albumCount === "number"
        && typeof config.trackCount === "number"
        && Array.isArray(config.track)
        && config.track.every((item) => {
            if (!item || typeof item !== "object") {
                return false;
            }
            const track = item;
            return typeof track.album === "string"
                && typeof track.name === "string"
                && Array.isArray(track.tags)
                && track.tags.every((tag) => typeof tag === "string");
        });
}
function loadRuntimeAlbumConfig() {
    return loadStaticConfig().album;
}
function getMusicTitleLookup() {
    return new Map(loadRuntimeAlbumConfig().track.map((item) => [item.name.toLowerCase(), item.name]));
}
function getMusicTitleEnum() {
    return loadRuntimeAlbumConfig().track.map((item) => item.name);
}
function getMusicTitleExamples() {
    return loadRuntimeAlbumConfig().track.slice(0, 10).map((item) => item.name);
}
function isActionDefinition(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const action = value;
    return typeof action.name === "string"
        && action.name.trim().length > 0
        && (action.playback === "loop" || action.playback === "once")
        && (action.resumeAction === undefined || (typeof action.resumeAction === "string" && action.resumeAction.trim().length > 0));
}
function isPoseActions(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const actions = value;
    return ["stand", "sit", "lay", "floor"].every((pose) => Array.isArray(actions[pose])
        && actions[pose].every((item) => isActionDefinition(item)));
}
function normalizeActionDefinitions(actions) {
    const normalized = {};
    for (const pose of ["stand", "sit", "lay", "floor"]) {
        const entries = actions[pose];
        const seen = new Set();
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
function normalizeStaticConfig(value) {
    const raw = value && typeof value === "object" ? value : {};
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
function loadStaticConfig() {
    const configPath = fileURLToPath(BUNDLED_STATIC_CONFIG_PATH);
    const stat = fs.statSync(configPath);
    if (!cachedStaticConfig || stat.mtimeMs !== cachedStaticConfigMtime) {
        const raw = fs.readFileSync(configPath, "utf-8");
        cachedStaticConfig = normalizeStaticConfig(JSON.parse(raw));
        cachedStaticConfigMtime = stat.mtimeMs;
    }
    return cachedStaticConfig;
}
const VALID_ENVIRONMENTS = ["steam", "steam-playtest", "test"];
let cachedEnvironmentsConfig = null;
let cachedEnvironmentsConfigMtime = 0;
function getEnvironmentsConfigPath() {
    return fileURLToPath(BUNDLED_ENVIRONMENTS_CONFIG_PATH);
}
function loadEnvironmentsConfig() {
    const configPath = getEnvironmentsConfigPath();
    const stat = fs.statSync(configPath);
    if (cachedEnvironmentsConfig && stat.mtimeMs === cachedEnvironmentsConfigMtime) {
        return cachedEnvironmentsConfig;
    }
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!raw || typeof raw !== "object") {
        throw new Error("config/environments.json must be a valid object");
    }
    const config = raw;
    for (const env of VALID_ENVIRONMENTS) {
        if (!(env in config)) {
            throw new Error(`config/environments.json missing environment "${env}"`);
        }
        const value = config[env];
        if (value !== null && typeof value !== "string") {
            throw new Error(`config/environments.json environment "${env}" must be a string or null`);
        }
    }
    cachedEnvironmentsConfig = config;
    cachedEnvironmentsConfigMtime = stat.mtimeMs;
    return cachedEnvironmentsConfig;
}
function isKichiEnvironment(value) {
    return typeof value === "string" && VALID_ENVIRONMENTS.includes(value);
}
function resolveEnvironmentHost(environment) {
    const config = loadEnvironmentsConfig();
    const configuredHost = config[environment];
    if (typeof configuredHost === "string" && configuredHost.trim()) {
        const host = configuredHost.trim();
        try {
            normalizeKichiHost(host);
            return { host };
        }
        catch (error) {
            return { error: `environment "${environment}" has an invalid host: ${error instanceof Error ? error.message : String(error)}` };
        }
    }
    return { error: `environment "${environment}" has no configured host — update config/environments.json first` };
}
function resolveJoinEnvironmentHost(params) {
    if (!isKichiEnvironment(params.environment)) {
        return { error: `environment must be one of: ${VALID_ENVIRONMENTS.join(", ")}` };
    }
    if (params.environment === "test") {
        const testHost = typeof params.host === "string" ? params.host.trim() : "";
        if (!testHost) {
            return { error: "host is required for the test environment" };
        }
        try {
            normalizeKichiHost(testHost);
            return { environment: params.environment, host: testHost };
        }
        catch (error) {
            return { environment: params.environment, error: error instanceof Error ? error.message : String(error) };
        }
    }
    const resolved = resolveEnvironmentHost(params.environment);
    if (resolved.error) {
        return { environment: params.environment, error: resolved.error };
    }
    return { environment: params.environment, host: resolved.host };
}
function sendStatusUpdate(service, status) {
    const actionDefinition = getActionDefinition(status.poseType, status.action);
    service.sendStatus(status.poseType, actionDefinition.name, status.bubble || status.action, typeof status.log === "string" ? status.log.trim() : "", getActionPlayback(actionDefinition), status.avatarStatus, status.propId);
}
function syncFixedStatus(service, status) {
    if (!service.hasValidIdentity() || !service.isConnected()) {
        return;
    }
    const bubbleText = status.bubble.trim() || status.action;
    const logText = typeof status.log === "string" && status.log.trim()
        ? status.log.trim()
        : bubbleText;
    sendStatusUpdate(service, {
        ...status,
        bubble: bubbleText,
        log: logText,
    });
}
function splitGraphemes(text) {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
        const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
        return Array.from(segmenter.segment(text), (item) => item.segment);
    }
    return Array.from(text);
}
function getDisplayWidth(segment) {
    if (/[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6]/u.test(segment)) {
        return 2;
    }
    if (/\p{Extended_Pictographic}/u.test(segment)) {
        return 2;
    }
    return 1;
}
function getTextDisplayWidth(text) {
    return splitGraphemes(text).reduce((total, segment) => total + getDisplayWidth(segment), 0);
}
function truncateByDisplayWidth(text, maxWidth) {
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
function stripReplyTag(text) {
    return text.replace(/^\[\[\s*reply_to(?::[^\]]+|_current)?\s*\]\]\s*/i, "").trim();
}
function stripKnownLeadingIdentifiers(text, candidates) {
    let normalized = text.trim();
    if (!normalized) {
        return "";
    }
    const separatorsPattern = String.raw `(?:[\s,:;，：；]|$)+`;
    let changed = true;
    while (changed && normalized) {
        changed = false;
        for (const candidate of candidates) {
            const trimmed = candidate.trim();
            if (!trimmed) {
                continue;
            }
            const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const patterns = [
                new RegExp(`^${escaped}${separatorsPattern}`, "i"),
                new RegExp(`^@${escaped}${separatorsPattern}`, "i"),
                new RegExp(`^<@${escaped}>${separatorsPattern}`, "i"),
            ];
            for (const pattern of patterns) {
                if (!pattern.test(normalized)) {
                    continue;
                }
                normalized = normalized.replace(pattern, "").trimStart();
                changed = true;
            }
        }
    }
    return normalized.trim();
}
function stripDispatchMetadata(text, context) {
    let normalized = stripReplyTag(text);
    normalized = normalized.replace(/^(?:\[[a-z_]+:\s*[^\]]+\]\s*)+/i, "").trim();
    normalized = stripKnownLeadingIdentifiers(normalized, [
        typeof context?.senderId === "string" ? context.senderId : "",
        typeof context?.accountId === "string" ? context.accountId : "",
    ]);
    return normalized;
}
function extractTextFromContent(content) {
    if (typeof content === "string") {
        return stripReplyTag(content);
    }
    if (!Array.isArray(content)) {
        return "";
    }
    const parts = [];
    for (const item of content) {
        if (!item || typeof item !== "object") {
            continue;
        }
        const part = item;
        if (typeof part.text === "string") {
            parts.push(part.text);
            continue;
        }
        const nested = part.text;
        if (nested && typeof nested === "object" && typeof nested.value === "string") {
            parts.push(nested.value);
        }
    }
    return stripReplyTag(parts.join("\n").trim());
}
function getLastAssistantPreview(messages, maxWidth) {
    if (!Array.isArray(messages)) {
        return "";
    }
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (!message || typeof message !== "object") {
            continue;
        }
        const record = message;
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
function resolveDispatchMessageText(event, context) {
    if (typeof event.content === "string" && event.content.trim()) {
        return stripDispatchMetadata(event.content, context);
    }
    if (typeof event.body === "string" && event.body.trim()) {
        return stripDispatchMetadata(event.body, context);
    }
    return "";
}
function notifyMessageReceived(api, service, content) {
    service.recordSmsLastMessageReceivedAt();
    const connected = service.isConnected();
    const hasIdentity = service.hasValidIdentity();
    api.logger.debug(`[kichi:${service.getAgentId()}] inbound sync fired (connected=${connected}, hasIdentity=${hasIdentity})`);
    if (!hasIdentity || !connected) {
        api.logger.debug(`[kichi:${service.getAgentId()}] skipped inbound sync because runtime is not ready`);
        return;
    }
    const trimmed = truncateByDisplayWidth(content, MAX_MESSAGE_RECEIVED_PREVIEW_WIDTH);
    api.logger.debug(`[kichi:${service.getAgentId()}] sending message_received notify (chars=${trimmed.length})`);
    service.sendHookNotify("message_received", `"${trimmed}"`);
}
function trimOptionalString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function readExtraStringField(source, key) {
    if (!isPlainObject(source)) {
        return undefined;
    }
    return trimOptionalString(source[key]);
}
function resolveBeforeDispatchLocator(event, ctx) {
    const ctxAgentId = readExtraStringField(ctx, "ctxAgentId");
    const sessionKey = trimOptionalString(ctx.sessionKey) ?? trimOptionalString(event.sessionKey);
    return {
        ...(ctxAgentId ? { ctxAgentId } : {}),
        ...(sessionKey ? { sessionKey } : {}),
    };
}
function resolveAgentHookLocator(ctx) {
    const agentId = trimOptionalString(ctx.agentId);
    const ctxAgentId = readExtraStringField(ctx, "ctxAgentId");
    const sessionKey = trimOptionalString(ctx.sessionKey);
    return {
        ...(agentId ? { agentId } : {}),
        ...(ctxAgentId ? { ctxAgentId } : {}),
        ...(sessionKey ? { sessionKey } : {}),
    };
}
function resolveToolLocator(ctx) {
    const agentId = trimOptionalString(ctx.agentId);
    const sessionKey = trimOptionalString(ctx.sessionKey);
    return {
        ...(agentId ? { agentId } : {}),
        ...(sessionKey ? { sessionKey } : {}),
    };
}
function registerPluginHooks(api, runtimeManager) {
    api.on("before_dispatch", (event, ctx) => {
        const locator = resolveBeforeDispatchLocator(event, ctx);
        const service = runtimeManager.getRuntime(locator);
        if (!service) {
            return;
        }
        const content = resolveDispatchMessageText(event, {
            senderId: ctx.senderId,
            accountId: ctx.accountId,
        });
        if (!content) {
            return;
        }
        notifyMessageReceived(api, service, content);
    });
    api.on("before_prompt_build", (_event, ctx) => {
        const locator = resolveAgentHookLocator(ctx);
        const service = runtimeManager.getRuntime(locator);
        if (!service?.hasValidIdentity() || !service.isConnected()) {
            return;
        }
        if (!service.isLlmRuntimeEnabled()) {
            syncFixedStatus(service, FIXED_HOOK_STATUSES.beforePromptBuild);
            return;
        }
        if (ctx.trigger === "heartbeat") {
            return;
        }
        return {
            prependContext: buildKichiPrompt(service.isOfficialOpenClawSource()),
        };
    });
    api.on("before_tool_call", (_event, ctx) => {
        const locator = resolveAgentHookLocator(ctx);
        const service = runtimeManager.getRuntime(locator);
        if (!service) {
            return;
        }
        if (!service.isLlmRuntimeEnabled()) {
            syncFixedStatus(service, FIXED_HOOK_STATUSES.beforeToolCall);
        }
    });
    api.on("agent_end", (event, ctx) => {
        const locator = resolveAgentHookLocator(ctx);
        const service = runtimeManager.getRuntime(locator);
        const preview = getLastAssistantPreview(event.messages, MAX_AGENT_END_PREVIEW_WIDTH);
        api.logger.debug(`[kichi:${service?.getAgentId() ?? "unknown"}] agent_end fired (trigger=${ctx.trigger ?? "unknown"}, success=${event.success}, durationMs=${event.durationMs ?? 0})`);
        if (ctx.trigger === "heartbeat") {
            return;
        }
        if (service && event.success && preview) {
            api.logger.debug(`[kichi:${service.getAgentId()}] sending before_send_message notify (chars=${preview.length})`);
            service.sendHookNotify("before_send_message", preview);
        }
        if (!service || service.isLlmRuntimeEnabled()) {
            return;
        }
        syncFixedStatus(service, event.success ? FIXED_HOOK_STATUSES.agentEndSuccess : FIXED_HOOK_STATUSES.agentEndFailure);
    });
}
function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function parseMateDailySchedulePlace(value, slotIndex) {
    if (!isPlainObject(value)) {
        throw new Error(`slots[${slotIndex}].place must be an object`);
    }
    const type = value.type;
    if (type === "home" || type === "kichi_room") {
        return { type };
    }
    if (type === "real_world") {
        if (typeof value.name !== "string" || !value.name.trim()) {
            throw new Error(`slots[${slotIndex}].place.name must be a non-empty string for real_world`);
        }
        return { type, name: value.name };
    }
    throw new Error(`slots[${slotIndex}].place.type must be one of: home, kichi_room, real_world`);
}
function parseMateDailyScheduleSlot(value, index) {
    if (!isPlainObject(value)) {
        throw new Error(`slots[${index}] must be an object`);
    }
    const hour = value.h;
    if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new Error(`slots[${index}].h must be an integer between 0 and 23`);
    }
    if (typeof value.act !== "string") {
        throw new Error(`slots[${index}].act must be a string`);
    }
    if (typeof value.mood !== "string") {
        throw new Error(`slots[${index}].mood must be a string`);
    }
    if (typeof value.sleep !== "boolean") {
        throw new Error(`slots[${index}].sleep must be a boolean`);
    }
    return {
        h: hour,
        place: parseMateDailySchedulePlace(value.place, index),
        act: value.act,
        mood: value.mood,
        sleep: value.sleep,
    };
}
function parseMateDailySchedule(value) {
    if (!isPlainObject(value)) {
        throw new Error("daily-schedule.json must contain a JSON object");
    }
    if (typeof value.date !== "string" || !value.date.trim()) {
        throw new Error("date must be a non-empty string");
    }
    if (typeof value.timezone !== "string" || !value.timezone.trim()) {
        throw new Error("timezone must be a non-empty string");
    }
    if (!Array.isArray(value.activeArcs) || !value.activeArcs.every((item) => typeof item === "string")) {
        throw new Error("activeArcs must be an array of strings");
    }
    if (!Array.isArray(value.slots)) {
        throw new Error("slots must be an array");
    }
    return {
        date: value.date,
        timezone: value.timezone,
        activeArcs: value.activeArcs,
        slots: value.slots.map(parseMateDailyScheduleSlot),
    };
}
function readMateDailySchedule() {
    const raw = fs.readFileSync(MATE_DAILY_SCHEDULE_PATH, "utf8");
    return parseMateDailySchedule(JSON.parse(raw));
}
function createMateDailyScheduleSyncTool(service) {
    return {
        name: "kichi_sync_mate_daily_schedule",
        label: "kichi_sync_mate_daily_schedule",
        description: "Read today's mate daily schedule from the canonical Kichi World file and sync it to Kichi server.",
        parameters: { type: "object", properties: {} },
        execute: async (_toolCallId, _params) => {
            try {
                const schedule = readMateDailySchedule();
                service.syncMateDailySchedule(schedule);
                return jsonResult({
                    success: true,
                    date: schedule.date,
                    slotCount: schedule.slots.length,
                });
            }
            catch (error) {
                return jsonResult({
                    success: false,
                    error: `Failed to sync mate daily schedule from ${MATE_DAILY_SCHEDULE_PATH}: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        },
    };
}
function isNonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function isPositiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function normalizeJoinTags(value) {
    if (value === undefined) {
        return { tags: [] };
    }
    if (!Array.isArray(value)) {
        return { error: "tags must be an array of strings" };
    }
    const tags = [];
    const seen = new Set();
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
function isClockAction(value) {
    return ["set", "stop"].includes(String(value));
}
function isIdlePlanPomodoroPhase(value) {
    return IDLE_PLAN_POMODORO_PHASES.includes(String(value));
}
function normalizeAvatarStatus(value, fieldPath) {
    if (typeof value !== "string" || !AVATAR_STATUSES.includes(value)) {
        return { error: `${fieldPath} must be one of: ${AVATAR_STATUSES.join(", ")}` };
    }
    return { avatarStatus: value };
}
function normalizeIdlePlan(value) {
    if (!isPlainObject(value)) {
        return { error: "idle plan payload must be an object" };
    }
    const requestId = value.requestId;
    const heartbeatIntervalSeconds = value.heartbeatIntervalSeconds;
    const goal = value.goal;
    const stages = value.stages;
    if (requestId !== undefined && typeof requestId !== "string") {
        return { error: "requestId must be a string when provided" };
    }
    if (!isPositiveInteger(heartbeatIntervalSeconds)) {
        return { error: "heartbeatIntervalSeconds must be a positive integer" };
    }
    if (typeof goal !== "string" || !goal.trim()) {
        return { error: "goal is required" };
    }
    if (!Array.isArray(stages) || stages.length === 0) {
        return { error: "stages must contain at least one stage" };
    }
    const normalizedStages = [];
    let totalDurationSeconds = 0;
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
        const rawStage = stages[stageIndex];
        if (!isPlainObject(rawStage)) {
            return { error: `stages[${stageIndex}] must be an object` };
        }
        const name = rawStage.name;
        const purpose = rawStage.purpose;
        const pomodoroPhase = rawStage.pomodoroPhase;
        const avatarStatus = rawStage.avatarStatus;
        const durationSeconds = rawStage.durationSeconds;
        const actions = rawStage.actions;
        if (typeof name !== "string" || !name.trim()) {
            return { error: `stages[${stageIndex}].name is required` };
        }
        if (typeof purpose !== "string" || !purpose.trim()) {
            return { error: `stages[${stageIndex}].purpose is required` };
        }
        if (!isIdlePlanPomodoroPhase(pomodoroPhase)) {
            return {
                error: `stages[${stageIndex}].pomodoroPhase must be one of: ${IDLE_PLAN_POMODORO_PHASES.join(", ")}`,
            };
        }
        const normalizedAvatarStatus = normalizeAvatarStatus(avatarStatus, `stages[${stageIndex}].avatarStatus`);
        if (normalizedAvatarStatus.error || normalizedAvatarStatus.avatarStatus === undefined) {
            return { error: normalizedAvatarStatus.error ?? `stages[${stageIndex}].avatarStatus is invalid` };
        }
        if (!isPositiveInteger(durationSeconds)) {
            return { error: `stages[${stageIndex}].durationSeconds must be a positive integer` };
        }
        if (!Array.isArray(actions) || actions.length === 0) {
            return { error: `stages[${stageIndex}].actions must contain at least one action` };
        }
        const normalizedActions = [];
        let stageActionDurationSeconds = 0;
        for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
            const rawAction = actions[actionIndex];
            if (!isPlainObject(rawAction)) {
                return { error: `stages[${stageIndex}].actions[${actionIndex}] must be an object` };
            }
            const poseType = rawAction.poseType;
            const action = rawAction.action;
            const actionDurationSeconds = rawAction.durationSeconds;
            const bubble = rawAction.bubble;
            const log = rawAction.log;
            const propId = rawAction.propId;
            if (!["stand", "sit", "lay", "floor"].includes(String(poseType))) {
                return {
                    error: `stages[${stageIndex}].actions[${actionIndex}].poseType must be stand, sit, lay, or floor`,
                };
            }
            if (typeof action !== "string" || !action.trim()) {
                return { error: `stages[${stageIndex}].actions[${actionIndex}].action is required` };
            }
            if (!isPositiveInteger(actionDurationSeconds)) {
                return {
                    error: `stages[${stageIndex}].actions[${actionIndex}].durationSeconds must be a positive integer`,
                };
            }
            if (typeof bubble !== "string" || !bubble.trim()) {
                return { error: `stages[${stageIndex}].actions[${actionIndex}].bubble is required` };
            }
            if (typeof log !== "string" || !log.trim()) {
                return { error: `stages[${stageIndex}].actions[${actionIndex}].log is required` };
            }
            const normalizedPoseType = poseType;
            let actionDefinition;
            try {
                actionDefinition = getActionDefinition(normalizedPoseType, action.trim());
            }
            catch (error) {
                return {
                    error: error instanceof Error
                        ? error.message
                        : `Invalid action in stages[${stageIndex}].actions[${actionIndex}]`,
                };
            }
            const playback = getActionPlayback(actionDefinition);
            if (playback.mode === "once" && actionDurationSeconds > 30) {
                return {
                    error: `stages[${stageIndex}].actions[${actionIndex}] uses once action "${actionDefinition.name}" for ${actionDurationSeconds} seconds; once actions must stay at 30 seconds or less`,
                };
            }
            stageActionDurationSeconds += actionDurationSeconds;
            normalizedActions.push({
                poseType: normalizedPoseType,
                action: actionDefinition.name,
                durationSeconds: actionDurationSeconds,
                bubble: bubble.trim(),
                log: log.trim(),
                ...(typeof propId === "string" && propId.trim() ? { propId: propId.trim() } : {}),
            });
        }
        if (stageActionDurationSeconds !== durationSeconds) {
            return {
                error: `stages[${stageIndex}] action durations must equal stage duration exactly (${stageActionDurationSeconds} !== ${durationSeconds})`,
            };
        }
        totalDurationSeconds += durationSeconds;
        normalizedStages.push({
            name: name.trim(),
            purpose: purpose.trim(),
            pomodoroPhase,
            avatarStatus: normalizedAvatarStatus.avatarStatus,
            durationSeconds,
            actions: normalizedActions,
        });
    }
    if (totalDurationSeconds !== heartbeatIntervalSeconds) {
        return {
            error: `idle plan total duration must equal heartbeatIntervalSeconds exactly (${totalDurationSeconds} !== ${heartbeatIntervalSeconds})`,
        };
    }
    return {
        idlePlan: {
            ...(typeof requestId === "string" && requestId.trim() ? { requestId: requestId.trim() } : {}),
            heartbeatIntervalSeconds,
            goal: goal.trim(),
            totalDurationSeconds,
            stages: normalizedStages,
        },
    };
}
function isPomodoroPhase(value) {
    return ["focus", "shortBreak", "longBreak"].includes(String(value));
}
function getPomodoroPhaseDuration(phase, kichiSeconds, shortBreakSeconds, longBreakSeconds) {
    if (phase === "shortBreak") {
        return shortBreakSeconds;
    }
    if (phase === "longBreak") {
        return longBreakSeconds;
    }
    return kichiSeconds;
}
function normalizeClockConfig(value) {
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
        const phase = value.phase ?? "focus";
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
            return { error: "clock.phase must be focus, shortBreak, or longBreak" };
        }
        const defaultRemainingSeconds = getPomodoroPhaseDuration(phase, kichiSeconds, shortBreakSeconds, longBreakSeconds);
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
function normalizeMusicTitles(value) {
    if (!Array.isArray(value)) {
        return { titles: [], invalidTitles: [] };
    }
    const musicTitleLookup = getMusicTitleLookup();
    const titles = [];
    const invalidTitles = [];
    const seen = new Set();
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
function buildMusicAlbumToolDescription() {
    return [
        "Create a custom Kichi music album.",
        "Query status first, then choose track names from the values injected into this tool schema from the static config bundled with the plugin package.",
    ].join("\n");
}
function buildMusicTitlesDescription() {
    return [
        "Track names are injected into this tool schema from the static config bundled with the plugin package.",
        "Use exact names only; the available titles are injected into this tool schema.",
    ].join(" ");
}
function getActionDefinition(poseType, action) {
    const poseActions = loadStaticConfig().actions[poseType];
    const matched = poseActions.find((entry) => entry.name.toLowerCase() === action.toLowerCase());
    if (!matched) {
        throw new Error(`Unknown action "${action}" for poseType "${poseType}"`);
    }
    return matched;
}
function getActionPlayback(action) {
    return action.playback === "once"
        ? {
            mode: "once",
            resumeAction: action.resumeAction,
        }
        : {
            mode: "loop",
        };
}
function formatActionList(actions, playback) {
    return actions
        .filter((entry) => entry.playback === playback)
        .map((entry) => entry.name)
        .join(", ");
}
function buildKichiActionDescription(service) {
    const actions = loadStaticConfig().actions;
    const lines = [
        "Directly control the avatar inside Kichi World.",
        "Use this whenever the user explicitly asks you to make the Kichi avatar sit down, stand up, lie down, floor-sit, type, read, meditate, celebrate, or perform another listed animation.",
        "For most work, prefer a sit pose and switch actions as the task moves between stages.",
        "Set avatarStatus to the current avatar status: Idle, Busy, Activities, or Break.",
        "Set verify to true ONLY when the user explicitly requests a pose or action change. The server will confirm whether the avatar actually applied the requested pose. If it could not (e.g. no available seats), the result will contain the actual fallback pose so you can inform the user accurately. During routine sync steps, omit verify.",
        `stand actions: ${actions.stand.map((entry) => entry.name).join(", ")}`,
        `sit actions: ${actions.sit.map((entry) => entry.name).join(", ")}`,
        `lay actions: ${actions.lay.map((entry) => entry.name).join(", ")}`,
        `floor actions: ${actions.floor.map((entry) => entry.name).join(", ")}`,
    ];
    const roomContext = service?.getCachedRoomContext();
    const poseableProps = roomContext?.PoseableProps;
    if (Array.isArray(poseableProps) && poseableProps.length > 0) {
        lines.push("", "Cached RoomContext.PoseableProps (from last kichi_query_status):", JSON.stringify(poseableProps), "When using a sit or lay pose, pick the propId whose PoseableProps information best matches the current task context and whose OccupancyState is not fully_occupied. If no prop fits, omit propId.");
    }
    return lines.join("\n");
}
function buildKichiIdlePlanDescription() {
    return [
        "Send a complete heartbeat idle plan for the avatar.",
        "The payload must include the overall goal, heartbeat interval, stage breakdown, each stage's purpose, each stage's pomodoroPhase, action list, and each action's bubble and log content.",
        "Build the plan in this order.",
        "1. Pick one concrete, time-bounded fun personal project you would genuinely choose to do on your own when nobody needs you. It must fit your personality, tastes, and established character, stay rooted in your personal interests or hobbies, and be something the available Kichi actions can express clearly.",
        "2. Set the overall goal to that project. Do not use a vague atmosphere, a generic productivity task, or a catch-all routine summary as the goal.",
        "3. Break the full heartbeat interval into ordered stages. Each stage purpose must explain what you are actually doing in that stage as part of the same project, not just how you want to feel. Do not switch to unrelated tasks just to use more actions.",
        "4. Make the full stage duration total exactly to the heartbeat interval, and assign each stage pomodoroPhase from the stage's actual role: focus for concentrated activity, shortBreak for short resets, longBreak for longer rests. Do not default the whole idle plan to none. Use none only for a stage that truly has no pomodoro role.",
        "5. Set each stage avatarStatus to the avatar status for that stage: Idle, Busy, Activities, or Break.",
        "6. Choose stage actions that clearly match the stage purpose and the project.",
        "7. Write each action bubble as the current presented state, not a next step, plan, or instruction.",
        "8. If an idle plan is currently being carried out and the user asks about something from it, answer from inside that ongoing activity with an immersive in-universe depiction or draft.",
        "Treat the avatar's idle plan as what your resident body is doing in Kichi World.",
        "Use your memory to recall what you did in past heartbeats and to stay consistent with your established personality and interests.",
        "Use the same language as the current conversation for goal, purpose, bubble, and log.",
        "Choose action names from the per-pose action lists in the kichi_action tool description (stand/sit/lay/floor).",
    ].join("\n");
}
function buildKichiResidencyContext(includeDailySchedule) {
    return [
        "KICHI WORLD PRESENCE:",
        ...KICHI_RESIDENCY_RULES,
        ...(includeDailySchedule ? [
            "- When asked about your current location, what you're doing, today's plans, or activities, check Kichi room status first. If isAvatarInScene is true, answer from it in character.",
            `- If Kichi room status is unavailable or isAvatarInScene is false, read ${MATE_DAILY_SCHEDULE_PATH}, use it as your own status, and answer in character.`,
            `- If ${MATE_DAILY_SCHEDULE_PATH} is missing or unreadable, improvise an in-character answer.`,
        ] : []),
    ].join("\n");
}
function buildKichiPrompt(includeDailySchedule) {
    return [
        "Kichi avatar control and status sync are available via `kichi_action` and `kichi_clock`.",
        "",
        buildKichiResidencyContext(includeDailySchedule),
        "",
        "If the user gives a direct Kichi pose or action request, fulfill it with `kichi_action` and set `verify: true` so you can confirm the avatar actually applied the pose. If the result contains a warning about a fallback, tell the user what actually happened instead of assuming success.",
        "Write the visible reply as a natural user-facing response. Keep `kichi_action`, `kichi_clock`, and sync steps internal and absent from the visible reply.",
        "",
        "kichi_action timing (all required when sync is active):",
        "1. Task start: call BEFORE your first tool call OR before composing a multi-paragraph reply. For most work, start from a sit pose unless the user asked for a different pose or the task clearly fits another pose better.",
        "2. Step switch: call when the task moves into a different stage. Keep the pose aligned with the work, usually staying seated while switching actions within the task as needed.",
        "3. Task end: call BEFORE final reply. Use the order `kichi_action` -> reply.",
        "bubble: 2-5 word companion speech. log: one short natural first-person sentence under 15 words. Match the language of the bubble and mention the current action and immediate focus like a real companion.",
        "avatarStatus: set the current avatar status as Idle, Busy, Activities, or Break.",
        "",
        "kichi_clock: set countDown for tasks with 2+ steps or >10s work, sized to your estimated duration so the player sees how long you'll be busy. Skip for quick one-shots.",
        "kichi_clock only shows a clock; it never fires a reminder or notification. When the user asks to be reminded or alerted at a future time (e.g. \"remind me in 2 minutes\"), schedule a cron job to actually notify them, and also set a kichi_clock countDown to show the wait. Do both.",
        "",
        "When sending a bot message, do NOT call kichi_action separately.",
        "",
        "User opt-out, Kichi config/test work, and explicit pose requests take priority over sync.",
    ].join("\n");
}
const GLOBAL_RUNTIME_MANAGER_KEY = "__kichi_forwarder_runtime_manager__";
function getRuntimeManager(logger) {
    const globalState = globalThis;
    const existing = globalState[GLOBAL_RUNTIME_MANAGER_KEY];
    if (existing) {
        return existing;
    }
    const runtimeManager = new KichiRuntimeManager(logger);
    globalState[GLOBAL_RUNTIME_MANAGER_KEY] = runtimeManager;
    return runtimeManager;
}
const BOT_MESSAGE_MAX_DEPTH = 5;
const BOT_MESSAGE_COOLDOWN_MS = 5_000;
const DEFAULT_BOT_MESSAGE_HISTORY_LIMIT = 10;
const MAX_BOT_MESSAGE_HISTORY_LIMIT = 30;
const botMessageCooldowns = new Map();
const plugin = {
    id: "kichi-forwarder",
    name: "Kichi Forwarder",
    configSchema: { parse },
    register(api) {
        const runtimeManager = getRuntimeManager(api.logger);
        runtimeManager.setEnvironmentHostResolver((environment) => {
            const config = loadEnvironmentsConfig();
            const host = config[environment];
            return typeof host === "string" && host.trim() ? host : null;
        });
        registerPluginHooks(api, runtimeManager);
        const musicTitleEnum = getMusicTitleEnum();
        runtimeManager.setBotMessageHandler((service, msg) => {
            if (msg.depth >= BOT_MESSAGE_MAX_DEPTH) {
                api.logger.info(`[kichi:${service.getAgentId()}] bot_message depth=${msg.depth} >= max=${BOT_MESSAGE_MAX_DEPTH}, ignoring`);
                return;
            }
            const now = Date.now();
            for (const [key, at] of botMessageCooldowns) {
                if (now - at >= BOT_MESSAGE_COOLDOWN_MS) {
                    botMessageCooldowns.delete(key);
                }
            }
            const cooldownKey = `${service.getAgentId()}:${msg.from}`;
            const lastReply = botMessageCooldowns.get(cooldownKey) ?? 0;
            if (now - lastReply < BOT_MESSAGE_COOLDOWN_MS)
                return;
            botMessageCooldowns.set(cooldownKey, now);
            const releaseCooldown = () => {
                if (botMessageCooldowns.get(cooldownKey) === now) {
                    botMessageCooldowns.delete(cooldownKey);
                }
            };
            const sessionKey = `agent:${service.getAgentId()}:bot_message`;
            const history = [
                ...(msg.history ?? []),
                { from: msg.from, fromName: msg.fromName, bubble: msg.bubble },
            ];
            const historyLines = history.map((h) => `${h.fromName}: "${h.bubble}"`);
            const message = `[Bot conversation]\n${historyLines.join("\n")}\n\nReply with a short bubble (2-5 words). Do not repeat what has already been said. Just output the bubble text, nothing else.`;
            agentCommandFromIngress({
                message,
                sessionKey,
                agentId: service.getAgentId(),
                senderIsOwner: false,
                allowModelOverride: false,
                deliver: false,
            }).then((result) => {
                const replyText = (result.payloads ?? [])
                    .map((p) => p.text)
                    .filter((t) => typeof t === "string" && t.trim().length > 0)
                    .join(" ")
                    .trim();
                if (!replyText) {
                    return;
                }
                service.sendBotMessage(msg.from, msg.depth + 1, replyText, { history }).catch((sendErr) => {
                    api.logger.warn(`[kichi:${service.getAgentId()}] bot_message send or history record failed: ${sendErr}`);
                });
            }).catch((err) => {
                releaseCooldown();
                api.logger.warn(`[kichi:${service.getAgentId()}] bot_message agent run failed: ${err}`);
            });
        });
        api.registerService({
            id: "kichi-forwarder",
            start: (ctx) => {
                parse(ctx.config.plugins?.entries?.["kichi-forwarder"]?.config);
                runtimeManager.initializeStartupRuntimes();
            },
            stop: () => {
                runtimeManager.stopAll();
                const globalState = globalThis;
                if (globalState[GLOBAL_RUNTIME_MANAGER_KEY] === runtimeManager) {
                    delete globalState[GLOBAL_RUNTIME_MANAGER_KEY];
                }
            },
        });
        api.registerTool((ctx) => {
            const locator = resolveToolLocator(ctx);
            const agentId = runtimeManager.resolveRuntimeAgentId(locator);
            if (!agentId) {
                return null;
            }
            const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
            if (!service.isOfficialOpenClawSource()) {
                return null;
            }
            return createMateDailyScheduleSyncTool(service);
        }, { name: "kichi_sync_mate_daily_schedule" });
        api.registerTool((ctx) => ({
            name: "kichi_join",
            label: "kichi_join",
            description: "Join Kichi world in the target environment with avatarId, the current bot name, a short bio, and personality tags. For test, pass host.",
            parameters: {
                type: "object",
                properties: {
                    avatarId: { type: "string", description: "Avatar ID to join Kichi world" },
                    environment: {
                        type: "string",
                        enum: VALID_ENVIRONMENTS,
                        description: "Target environment. kichi_join switches to this environment before joining.",
                    },
                    host: {
                        type: "string",
                        description: "Test host, required when environment is test and ignored otherwise",
                    },
                    botName: {
                        type: "string",
                        description: "Current bot name to include in the join message",
                    },
                    bio: {
                        type: "string",
                        description: "Short bio extracted from SOUL.md, covering persona and idle plan goals if present",
                    },
                    tags: {
                        type: "array",
                        description: "Optional list of OpenClaw self-perceived personality tags",
                        items: { type: "string" },
                    },
                    source: {
                        type: "string",
                        description: "Optional join source identifier. Defaults to Kichi World join-source.json, then openclaw.",
                    },
                },
                required: ["environment", "avatarId", "botName", "bio"],
            },
            execute: async (_toolCallId, params) => {
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const p = params;
                const target = resolveJoinEnvironmentHost({
                    environment: p?.environment,
                    host: p?.host,
                });
                if (target.error || !target.host) {
                    return jsonResult({ success: false, error: target.error ?? "Failed to resolve target host" });
                }
                const currentStatus = service.getConnectionStatus();
                const currentHost = currentStatus.host ? normalizeKichiHost(currentStatus.host) : undefined;
                const targetHost = normalizeKichiHost(target.host);
                let avatarId = p?.avatarId;
                if (!avatarId && currentHost === targetHost) {
                    avatarId = service.readSavedAvatarId() ?? undefined;
                }
                const botName = p?.botName?.trim();
                const bio = p?.bio?.trim();
                const rawSource = p?.source;
                const { tags, error: tagsError } = normalizeJoinTags(p?.tags);
                if (!botName) {
                    return jsonResult({ success: false, error: "No botName" });
                }
                if (!bio) {
                    return jsonResult({ success: false, error: "No bio" });
                }
                let source;
                try {
                    source = rawSource === undefined
                        ? service.readConfiguredJoinSource() ?? "openclaw"
                        : trimOptionalString(rawSource);
                }
                catch (err) {
                    return jsonResult({ success: false, error: err instanceof Error ? err.message : String(err) });
                }
                if (!source) {
                    return jsonResult({ success: false, error: "source must be a non-empty string" });
                }
                if (tagsError) {
                    return jsonResult({ success: false, error: tagsError });
                }
                let leaveStatus;
                const shouldLeaveCurrentConnection = currentStatus.connected && currentStatus.hasAuthKey && ((!!currentHost && currentHost !== targetHost) ||
                    (currentHost === targetHost && !!currentStatus.avatarId && !!avatarId && currentStatus.avatarId !== avatarId));
                if (shouldLeaveCurrentConnection) {
                    try {
                        leaveStatus = await service.leave();
                    }
                    catch (err) {
                        leaveStatus = {
                            success: false,
                            error: err instanceof Error ? err.message : String(err),
                        };
                    }
                }
                let switchStatus;
                if (target.environment && target.host && currentHost !== targetHost) {
                    switchStatus = await service.switchHost(target.host, target.environment);
                }
                if (!avatarId) {
                    avatarId = service.readSavedAvatarId() ?? undefined;
                }
                if (!avatarId) {
                    return jsonResult({ success: false, error: "No avatarId" });
                }
                const result = await service.join(avatarId, botName, bio, tags ?? [], source);
                if (result.success) {
                    return jsonResult({
                        success: true,
                        ...(target.environment ? { environment: target.environment } : {}),
                        ...(target.host ? { host: target.host } : {}),
                        ...(switchStatus ? { switchStatus } : {}),
                        ...(leaveStatus ? { leaveStatus } : {}),
                    });
                }
                const failure = result;
                return jsonResult({
                    success: false,
                    error: failure.error,
                    ...(target.environment ? { environment: target.environment } : {}),
                    ...(target.host ? { host: target.host } : {}),
                    ...(switchStatus ? { switchStatus } : {}),
                    ...(leaveStatus ? { leaveStatus } : {}),
                    ...(failure.errorCode ? { errorCode: failure.errorCode } : {}),
                    ...(failure.errorMessage ? { errorMessage: failure.errorMessage } : {}),
                });
            },
        }), { name: "kichi_join" });
        api.registerTool((ctx) => ({
            name: "kichi_switch_host",
            label: "kichi_switch_host",
            description: "Switch Kichi runtime environment and reconnect immediately without restarting the gateway. For steam/steam-playtest the host is resolved automatically. For test, pass the host explicitly.",
            parameters: {
                type: "object",
                properties: {
                    environment: {
                        type: "string",
                        enum: VALID_ENVIRONMENTS,
                        description: "Target environment: steam, steam-playtest, or test",
                    },
                    host: {
                        type: "string",
                        description: "Test host (required for test environment, ignored otherwise)",
                    },
                },
                required: ["environment"],
            },
            execute: async (_toolCallId, params) => {
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const p = params;
                const environment = p?.environment;
                if (!isKichiEnvironment(environment)) {
                    return jsonResult({ success: false, error: `environment must be one of: ${VALID_ENVIRONMENTS.join(", ")}` });
                }
                const target = resolveJoinEnvironmentHost({ environment, host: p?.host });
                if (target.error || !target.host) {
                    return jsonResult({ success: false, error: target.error ?? "Failed to resolve target host" });
                }
                const targetHost = target.host;
                const status = await service.switchHost(targetHost, environment);
                return jsonResult({
                    success: true,
                    environment,
                    host: targetHost,
                    status,
                });
            },
        }), { name: "kichi_switch_host" });
        api.registerTool((ctx) => ({
            name: "kichi_rejoin",
            label: "kichi_rejoin",
            description: "Request an immediate rejoin attempt with saved avatarId/authKey. Rejoin is also sent automatically after reconnect.",
            parameters: { type: "object", properties: {} },
            execute: async (_toolCallId, _params) => {
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const result = service.requestRejoin();
                return jsonResult({
                    success: result.accepted,
                    ...result,
                    status: service.getConnectionStatus(),
                });
            },
        }), { name: "kichi_rejoin" });
        api.registerTool((ctx) => ({
            name: "kichi_leave",
            label: "kichi_leave",
            description: "Leave Kichi world",
            parameters: { type: "object", properties: {} },
            execute: async (_toolCallId, _params) => {
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const result = await service.leave();
                if (result.success) {
                    return jsonResult({ success: true });
                }
                const failure = result;
                return jsonResult({
                    success: false,
                    error: failure.error,
                    ...(failure.errorCode ? { errorCode: failure.errorCode } : {}),
                    ...(failure.errorMessage ? { errorMessage: failure.errorMessage } : {}),
                });
            },
        }), { name: "kichi_leave" });
        api.registerTool((ctx) => ({
            name: "kichi_connection_status",
            label: "kichi_connection_status",
            description: "Check WebSocket connection status and identity readiness only. Does NOT return room info, avatar state, or personnel — use kichi_query_status for that.",
            parameters: { type: "object", properties: {} },
            execute: async (_toolCallId, _params) => {
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                return jsonResult({
                    success: true,
                    status: service.getConnectionStatus(),
                });
            },
        }), { name: "kichi_connection_status" });
        api.registerTool((ctx) => {
            const locator = resolveToolLocator(ctx);
            const existingService = runtimeManager.getRuntime(locator);
            return ({
                name: "kichi_action",
                label: "kichi_action",
                description: buildKichiActionDescription(existingService ?? undefined),
                parameters: {
                    type: "object",
                    properties: {
                        poseType: { type: "string", description: "Pose type: stand, sit, lay, or floor" },
                        action: {
                            type: "string",
                            description: "Action name for the selected pose (for example Sit Nicely, Typing with Keyboard, Reading, High Five, or Meditate)",
                        },
                        bubble: { type: "string", description: "Optional bubble text to display (max 5 words)" },
                        avatarStatus: {
                            type: "string",
                            description: "Current avatar status: Idle, Busy, Activities, or Break.",
                            enum: [...AVATAR_STATUSES],
                        },
                        log: {
                            type: "string",
                            description: "Short natural first-person sentence under 15 words. Match the language of the bubble and mention the current action and immediate focus.",
                        },
                        verify: {
                            type: "boolean",
                            description: "Set true ONLY when the user explicitly requests a pose or action. Omit during routine sync steps.",
                        },
                        propId: {
                            type: "string",
                            description: "Optional poseable prop ID from RoomContext.PoseableProps (obtained via kichi_query_status or cached). When specified, the avatar is seated at this prop; when omitted, the server picks the nearest available prop.",
                        },
                    },
                    required: ["poseType", "action", "avatarStatus"],
                },
                execute: async (_toolCallId, params) => {
                    const locator = resolveToolLocator(ctx);
                    const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                    if (!agentId) {
                        return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                    }
                    const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                    const { poseType, action, bubble, avatarStatus, log, verify, propId } = (params || {});
                    if (!poseType || !action) {
                        return jsonResult({ success: false, error: "poseType and action parameters are required" });
                    }
                    if (!["stand", "sit", "lay", "floor"].includes(poseType)) {
                        return jsonResult({
                            success: false,
                            error: `Invalid poseType: ${poseType}. Must be stand, sit, lay, or floor`,
                        });
                    }
                    const normalizedAvatarStatus = normalizeAvatarStatus(avatarStatus, "avatarStatus");
                    if (normalizedAvatarStatus.error || normalizedAvatarStatus.avatarStatus === undefined) {
                        return jsonResult({ success: false, error: normalizedAvatarStatus.error ?? "avatarStatus is invalid" });
                    }
                    if (!service.hasValidIdentity() || !service.isConnected()) {
                        return jsonResult({ success: false, error: "Not connected to Kichi world" });
                    }
                    const normalizedPoseType = poseType;
                    const poseActions = loadStaticConfig().actions[normalizedPoseType];
                    const matched = poseActions.find((entry) => entry.name.toLowerCase() === action.toLowerCase());
                    if (!matched) {
                        return jsonResult({
                            success: false,
                            error: `Unknown action "${action}" for poseType "${poseType}"`,
                            available: poseActions.map((entry) => entry.name),
                        });
                    }
                    const bubbleText = typeof bubble === "string" && bubble.trim() ? bubble.trim() : matched.name;
                    const logText = typeof log === "string" ? log.trim() : "";
                    const playback = getActionPlayback(matched);
                    if (verify) {
                        try {
                            const ack = await service.sendStatusVerified(normalizedPoseType, matched.name, bubbleText, logText, playback, normalizedAvatarStatus.avatarStatus, propId);
                            if (ack.warning) {
                                return jsonResult({
                                    success: true,
                                    requested: { poseType: normalizedPoseType, action: matched.name },
                                    actual: { poseType: ack.poseType, action: ack.action },
                                    warning: ack.warning,
                                });
                            }
                        }
                        catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            api.logger.debug(`[kichi:${service.getAgentId()}] verified status ack unavailable: ${message}`);
                            return jsonResult({
                                success: false,
                                verified: false,
                                error: `Kichi action could not be verified: ${message}`,
                            });
                        }
                    }
                    else {
                        sendStatusUpdate(service, {
                            poseType: normalizedPoseType,
                            action: matched.name,
                            bubble: bubbleText,
                            log: logText,
                            avatarStatus: normalizedAvatarStatus.avatarStatus,
                            propId,
                        });
                    }
                    return jsonResult({
                        success: true,
                        poseType: normalizedPoseType,
                        action: matched.name,
                        bubble: bubbleText,
                        log: logText,
                        avatarStatus: normalizedAvatarStatus.avatarStatus,
                        playback,
                    });
                },
            });
        }, { name: "kichi_action" });
        api.registerTool((ctx) => ({
            name: "kichi_glance",
            label: "kichi_glance",
            description: "Ask the Kichi avatar to briefly look at the camera. Use only for direct player chat requests such as \"look at me\" or \"look at the camera\". Do not use for heartbeat, idle planning, bot-to-bot messages, lifecycle hooks, or routine work/status sync.",
            parameters: {
                type: "object",
                properties: {
                    requestId: {
                        type: "string",
                        description: "Optional client request ID for tracing. The websocket ack returns this ID.",
                    },
                    target: {
                        type: "string",
                        enum: ["camera"],
                        description: "Glance target. The only supported target is camera.",
                    },
                    duration: {
                        type: "number",
                        description: "Optional glance duration in seconds. Defaults to 1.8.",
                    },
                },
            },
            execute: async (_toolCallId, params) => {
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const { requestId, target, duration } = (params || {});
                if (requestId !== undefined && typeof requestId !== "string") {
                    return jsonResult({ success: false, error: "requestId must be a string when provided" });
                }
                const normalizedTarget = target === undefined ? "camera" : target;
                if (normalizedTarget !== "camera") {
                    return jsonResult({ success: false, error: "target must be camera" });
                }
                const normalizedDuration = duration === undefined ? DEFAULT_GLANCE_DURATION_SECONDS : duration;
                if (typeof normalizedDuration !== "number" || !Number.isFinite(normalizedDuration) || normalizedDuration <= 0) {
                    return jsonResult({ success: false, error: "duration must be a positive finite number" });
                }
                if (!service.hasValidIdentity() || !service.isConnected()) {
                    return jsonResult({ success: false, error: "Not connected to Kichi world" });
                }
                try {
                    const ack = await service.sendGlance("camera", normalizedDuration, typeof requestId === "string" ? requestId : undefined);
                    return jsonResult({ success: true, ...ack });
                }
                catch (error) {
                    return jsonResult({ success: false, error: `Failed to send glance: ${error}` });
                }
            },
        }), { name: "kichi_glance" });
        api.registerTool((ctx) => ({
            name: "kichi_idle_plan",
            label: "kichi_idle_plan",
            description: buildKichiIdlePlanDescription(),
            parameters: {
                type: "object",
                properties: {
                    requestId: {
                        type: "string",
                        description: "Optional request ID for tracing or deduplication.",
                    },
                    heartbeatIntervalSeconds: {
                        type: "number",
                        description: "Required heartbeat interval in seconds. The plan must total exactly to this value.",
                    },
                    goal: {
                        type: "string",
                        description: "Overall goal for the full interval. Set it as one concrete, time-bounded fun personal project you would genuinely choose to do on your own, rooted in your personal interests or hobbies and clearly expressible with the available Kichi actions. Do not use a vague atmosphere, a generic productivity task, or a catch-all routine summary. Use the same language as the current conversation.",
                    },
                    stages: {
                        type: "array",
                        description: "Ordered plan stages covering the full heartbeat interval.",
                        items: {
                            type: "object",
                            properties: {
                                name: {
                                    type: "string",
                                    description: "Stage name.",
                                },
                                purpose: {
                                    type: "string",
                                    description: "Explain what part of the same project you are actually doing in this stage. Keep it supporting the same project instead of switching to unrelated tasks. Do not use pure mood-regulation or atmosphere text. Use the same language as the current conversation.",
                                },
                                pomodoroPhase: {
                                    type: "string",
                                    description: "Pomodoro phase for this stage: focus, shortBreak, longBreak, or none. Set it from the stage's actual role. Treat none as exceptional, not the default for the whole plan.",
                                    enum: [...IDLE_PLAN_POMODORO_PHASES],
                                },
                                avatarStatus: {
                                    type: "string",
                                    description: "Avatar status for this stage: Idle, Busy, Activities, or Break.",
                                    enum: [...AVATAR_STATUSES],
                                },
                                durationSeconds: {
                                    type: "number",
                                    description: "Required duration in seconds for this stage.",
                                },
                                actions: {
                                    type: "array",
                                    description: "Action list for this stage.",
                                    items: {
                                        type: "object",
                                        properties: {
                                            poseType: {
                                                type: "string",
                                                description: "Pose type for this action: stand, sit, lay, or floor.",
                                            },
                                            action: {
                                                type: "string",
                                                description: "Action name for the selected pose. Must match the bundled Kichi action list.",
                                            },
                                            durationSeconds: {
                                                type: "number",
                                                description: "Required duration in seconds for this action.",
                                            },
                                            bubble: {
                                                type: "string",
                                                description: "State-style bubble content for this action. Describe the current presented state you are in, not a next step, plan, or instruction. Use the same language as the current conversation.",
                                            },
                                            log: {
                                                type: "string",
                                                description: "Required log content for this action. Use the same language as the current conversation.",
                                            },
                                            propId: {
                                                type: "string",
                                                description: "Optional poseable prop ID from RoomContext.PoseableProps. When specified, the avatar is seated at this prop.",
                                            },
                                        },
                                        required: ["poseType", "action", "durationSeconds", "bubble", "log"],
                                    },
                                },
                            },
                            required: ["name", "purpose", "pomodoroPhase", "avatarStatus", "durationSeconds", "actions"],
                        },
                    },
                },
                required: ["heartbeatIntervalSeconds", "goal", "stages"],
            },
            execute: async (_toolCallId, params) => {
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const { idlePlan, error } = normalizeIdlePlan(params);
                if (!idlePlan) {
                    return jsonResult({ success: false, error: error ?? "Invalid idle plan payload" });
                }
                if (!service.hasValidIdentity() || !service.isConnected()) {
                    return jsonResult({ success: false, error: "Not connected to Kichi world" });
                }
                const sent = service.sendIdlePlan({
                    ...(idlePlan.requestId ? { requestId: idlePlan.requestId } : {}),
                    heartbeatIntervalSeconds: idlePlan.heartbeatIntervalSeconds,
                    goal: idlePlan.goal,
                    stages: idlePlan.stages,
                });
                if (!sent) {
                    return jsonResult({ success: false, error: "Failed to send idle plan payload" });
                }
                return jsonResult({
                    success: true,
                    ...(idlePlan.requestId ? { requestId: idlePlan.requestId } : {}),
                    heartbeatIntervalSeconds: idlePlan.heartbeatIntervalSeconds,
                    totalDurationSeconds: idlePlan.totalDurationSeconds,
                    goal: idlePlan.goal,
                    stages: idlePlan.stages,
                });
            },
        }), { name: "kichi_idle_plan" });
        api.registerTool((ctx) => ({
            name: "kichi_clock",
            label: "kichi_clock",
            description: "Send clock commands to Kichi world. Supported actions are set and stop. It only draws the visual clock and does NOT fire any reminder or notification. To actually alert the user at a future time, schedule a cron job separately.",
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
                                description: "Pomodoro focus-phase duration in seconds (the concentrated work session, named kichi in this product)",
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
                                description: "Pomodoro phase: focus, shortBreak, or longBreak",
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
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const { action, requestId, clock } = (params || {});
                if (!isClockAction(action)) {
                    return jsonResult({
                        success: false,
                        error: "action must be one of: set, stop",
                    });
                }
                if (requestId !== undefined && typeof requestId !== "string") {
                    return jsonResult({ success: false, error: "requestId must be a string when provided" });
                }
                const normalizedRequestId = typeof requestId === "string" ? requestId : undefined;
                if (!service.hasValidIdentity() || !service.isConnected()) {
                    return jsonResult({ success: false, error: "Not connected to Kichi world" });
                }
                let normalizedClock;
                if (action === "set") {
                    const { clock: nextClock, error } = normalizeClockConfig(clock);
                    if (!nextClock) {
                        return jsonResult({ success: false, error: error ?? "Invalid clock payload" });
                    }
                    normalizedClock = nextClock;
                }
                const sent = service.sendClock(action, normalizedClock, normalizedRequestId);
                if (!sent) {
                    return jsonResult({ success: false, error: "Failed to send clock payload" });
                }
                return jsonResult({
                    success: true,
                    action,
                    requestId: normalizedRequestId,
                    ...(normalizedClock ? { clock: normalizedClock } : {}),
                });
            },
        }), { name: "kichi_clock" });
        api.registerTool((ctx) => ({
            name: "kichi_query_status",
            label: "kichi_query_status",
            description: "Query Kichi room and avatar status — includes room personnel, notes, ownerState, idlePlan, weather/time, timer snapshot, daily note quota (`canCreateNoteboardNote`, `remaining`, `dailyLimit`), `isAvatarInScene`, `hasCreatedMusicAlbumToday`, and RoomContext.PoseableProps (poseable props with PropId, DisplayName, Description, SupportedPoseTypes, OccupancyState). The PoseableProps list is cached internally so that kichi_action can reference a propId during regular work sync without re-querying. Use this when the user asks to check kichi status, room status, or who is in the room. Also use this before creating a new note or daily recommended music album. For heartbeat planning, use the returned idlePlan as reference when shaping the next idle plan.",
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
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const requestId = params?.requestId;
                if (requestId !== undefined && typeof requestId !== "string") {
                    return jsonResult({ success: false, error: "requestId must be a string when provided" });
                }
                if (!service.hasValidIdentity() || !service.isConnected()) {
                    return jsonResult({ success: false, error: "Not connected to Kichi world" });
                }
                try {
                    const result = await service.queryStatus(typeof requestId === "string" ? requestId : undefined);
                    return jsonResult(result);
                }
                catch (error) {
                    return jsonResult({
                        success: false,
                        error: `Failed to query status: ${error}`,
                    });
                }
            },
        }), { name: "kichi_query_status" });
        api.registerTool((ctx) => ({
            name: "kichi_music_album_create",
            label: "kichi_music_album_create",
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
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const { requestId, albumTitle, musicTitles, } = (params || {});
                if (requestId !== undefined && typeof requestId !== "string") {
                    return jsonResult({ success: false, error: "requestId must be a string when provided" });
                }
                if (typeof albumTitle !== "string" || !albumTitle.trim()) {
                    return jsonResult({ success: false, error: "albumTitle is required" });
                }
                if (!Array.isArray(musicTitles)) {
                    return jsonResult({ success: false, error: "musicTitles must be an array of track names" });
                }
                const { titles: normalizedTitles, invalidTitles } = normalizeMusicTitles(musicTitles);
                if (normalizedTitles.length === 0) {
                    return jsonResult({
                        success: false,
                        error: "musicTitles must contain at least one valid track name from the static config bundled with the plugin package",
                        examples: getMusicTitleExamples(),
                    });
                }
                if (invalidTitles.length > 0) {
                    return jsonResult({
                        success: false,
                        error: `Unknown musicTitles: ${invalidTitles.join(", ")}`,
                        hint: "Use exact track names from the static config bundled with the plugin package",
                        examples: getMusicTitleExamples(),
                    });
                }
                if (!service.hasValidIdentity() || !service.isConnected()) {
                    return jsonResult({ success: false, error: "Not connected to Kichi world" });
                }
                try {
                    const normalizedRequestId = service.createMusicAlbum(albumTitle.trim(), normalizedTitles, typeof requestId === "string" ? requestId : undefined);
                    return jsonResult({
                        success: true,
                        requestId: normalizedRequestId,
                        albumTitle: albumTitle.trim(),
                        musicTitles: normalizedTitles,
                        trackCount: normalizedTitles.length,
                    });
                }
                catch (error) {
                    return jsonResult({
                        success: false,
                        error: `Failed to create music album: ${error}`,
                    });
                }
            },
        }), { name: "kichi_music_album_create" });
        api.registerTool((ctx) => ({
            name: "kichi_noteboard_create",
            label: "kichi_noteboard_create",
            description: "Create a new note on a specific Kichi note board. Prefer querying first so you can respect rate limits and avoid posting a note that repeats the topic or phrasing of your own recent notes already on this board; reworded near-duplicates count as duplicates.",
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
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const { propId, data } = (params || {});
                if (typeof propId !== "string" || !propId.trim()) {
                    return jsonResult({ success: false, error: "propId is required" });
                }
                if (typeof data !== "string" || !data.trim()) {
                    return jsonResult({ success: false, error: "data is required" });
                }
                if (data.trim().length > MAX_NOTEBOARD_TEXT_LENGTH) {
                    return jsonResult({
                        success: false,
                        error: `data must be ${MAX_NOTEBOARD_TEXT_LENGTH} characters or fewer`,
                    });
                }
                if (!service.hasValidIdentity() || !service.isConnected()) {
                    return jsonResult({ success: false, error: "Not connected to Kichi world" });
                }
                try {
                    service.createNotesBoardNote(propId.trim(), data.trim());
                    return jsonResult({ success: true });
                }
                catch (error) {
                    return jsonResult({
                        success: false,
                        error: `Failed to create note: ${error}`,
                    });
                }
            },
        }), { name: "kichi_noteboard_create" });
        api.registerTool((ctx) => ({
            name: "kichi_bot_message_history",
            label: "kichi_bot_message_history",
            description: "Read up to the 30 most recent Kichi bot-to-bot messages for this agent. This history contains only conversations with other bots inside Kichi and never includes player chats. Use when the user asks what you discussed with another Kichi bot, what another bot replied, or what bot messages were recently sent or received.",
            parameters: {
                type: "object",
                properties: {
                    avatarId: {
                        type: "string",
                        description: "Optional avatarId filter. Matches messages where this avatarId is either sender or recipient.",
                    },
                    limit: {
                        type: "number",
                        description: `Optional number of entries to return. Defaults to ${DEFAULT_BOT_MESSAGE_HISTORY_LIMIT}, max ${MAX_BOT_MESSAGE_HISTORY_LIMIT}.`,
                    },
                },
            },
            execute: async (_toolCallId, params) => {
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const { avatarId, limit } = (params || {});
                if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > MAX_BOT_MESSAGE_HISTORY_LIMIT)) {
                    return jsonResult({
                        success: false,
                        error: `limit must be an integer between 1 and ${MAX_BOT_MESSAGE_HISTORY_LIMIT}`,
                    });
                }
                try {
                    const entries = service.readRecentBotMessageTranscript(limit ?? DEFAULT_BOT_MESSAGE_HISTORY_LIMIT, avatarId);
                    return jsonResult({
                        success: true,
                        entries,
                    });
                }
                catch (error) {
                    return jsonResult({ success: false, error: `Failed to read bot message history: ${error}` });
                }
            },
        }), { name: "kichi_bot_message_history" });
        api.registerTool((ctx) => ({
            name: "kichi_bot_message",
            label: "kichi_bot_message",
            description: "Send a message to another bot in the same Kichi world. The bubble is the visible message content. Do not repeat what has already been said in the conversation history. When targeting a specific bot by name, call kichi_query_status first to resolve their avatarId. Only use \"*\" when broadcasting to all bots without a specific target.",
            parameters: {
                type: "object",
                properties: {
                    toAvatarId: {
                        type: "string",
                        description: "Target bot's avatarId (resolve via kichi_query_status if unknown). Use \"*\" only for broadcasting to all bots.",
                    },
                    depth: {
                        type: "number",
                        description: "Conversation depth counter. Increment from the received message's depth.",
                    },
                    bubble: {
                        type: "string",
                        description: "The message to send (2-5 words, visible to everyone). Must not repeat previous messages.",
                    },
                    poseType: {
                        type: "string",
                        enum: ["stand", "sit", "lay", "floor"],
                        description: "Optional pose change when sending.",
                    },
                    action: {
                        type: "string",
                        description: "Optional action to perform when sending.",
                    },
                    log: {
                        type: "string",
                        description: "Optional activity log entry.",
                    },
                },
                required: ["toAvatarId", "depth", "bubble"],
            },
            execute: async (_toolCallId, params) => {
                const locator = resolveToolLocator(ctx);
                const agentId = runtimeManager.resolveRuntimeAgentId(locator);
                if (!agentId) {
                    return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
                }
                // Auto bot-reply runs already send the reply from the agent's plain text
                // output (see the bot_message handler), with a deterministic depth. Refuse
                // the tool in that session so the same bubble is not sent/recorded twice.
                if (locator.sessionKey === `agent:${agentId}:bot_message`) {
                    return jsonResult({
                        success: false,
                        error: "Do not call kichi_bot_message here. Reply by outputting the bubble text directly; it is sent automatically.",
                    });
                }
                const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
                const { toAvatarId, depth, bubble, poseType, action, log } = (params || {});
                if (typeof toAvatarId !== "string" || !toAvatarId.trim()) {
                    return jsonResult({ success: false, error: "toAvatarId is required" });
                }
                if (typeof depth !== "number" || depth < 0) {
                    return jsonResult({ success: false, error: "depth must be a non-negative number" });
                }
                if (typeof bubble !== "string" || !bubble.trim()) {
                    return jsonResult({ success: false, error: "bubble is required" });
                }
                if (!service.hasValidIdentity() || !service.isConnected()) {
                    return jsonResult({ success: false, error: "Not connected to Kichi world" });
                }
                try {
                    let playback;
                    if (poseType && action) {
                        const actionDef = getActionDefinition(poseType, action);
                        playback = getActionPlayback(actionDef);
                    }
                    const ack = await service.sendBotMessage(toAvatarId.trim(), depth, bubble.trim(), {
                        poseType,
                        action: action?.trim(),
                        log: log?.trim(),
                        playback,
                    });
                    return jsonResult({ success: true, ...ack });
                }
                catch (error) {
                    return jsonResult({ success: false, error: `Failed to send or record bot message: ${error}` });
                }
            },
        }), { name: "kichi_bot_message" });
    },
};
export default plugin;
