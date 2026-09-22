import fs from "node:fs";
import path from "node:path";
import { normalizeKichiHost, getMusicTitleExamples, loadStaticConfig, VALID_ENVIRONMENTS, isKichiEnvironment, resolveJoinEnvironmentHost, normalizeMusicTitles, getActionDefinition, getActionPlayback, IDLE_PLAN_POMODORO_PHASES, AVATAR_STATUSES, normalizeJoinTags, isClockAction, normalizeAvatarStatus, normalizeIdlePlan, normalizeClockConfig, PRESENCE_SCOPES, parseMateDailySchedule, isPresenceScope, resolveMateDailySchedule, ENVIRONMENT_WEATHERS, ENVIRONMENT_TIMES, KICHI_EMOJI_NAMES, MUSIC_ACTIONS, MUSIC_PLAY_TYPES, } from "@yahaha-studio/kichi-core";
import { KICHI_WORLD_ROOT_DIR, resolveToolLocator, trimOptionalString } from "./runtime-manager.js";
import { isOfficialOpenClawSource, readConfiguredJoinSource } from "./source.js";
const MATE_DAILY_SCHEDULE_PATH = path.join(KICHI_WORLD_ROOT_DIR, "agents", "main", "daily-schedule.json");
function jsonResult(payload) {
    return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
}
const MAX_NOTEBOARD_TEXT_LENGTH = 200;
const DEFAULT_GLANCE_DURATION_SECONDS = 1.8;
const DEFAULT_BOT_MESSAGE_HISTORY_LIMIT = 10;
const MAX_BOT_MESSAGE_HISTORY_LIMIT = 30;
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
function buildKichiQueryStatusDescription(includeDailySchedule) {
    const base = "Query Kichi room and avatar status — includes room personnel, notes, currentUserActivity, idlePlan, weather/time, timer snapshot, daily note quota (`canCreateNoteboardNote`, `remaining`, `dailyLimit`), `isAvatarInScene`, `hasCreatedMusicAlbumToday`, and RoomContext.PoseableProps (poseable props with PropId, DisplayName, Description, SupportedPoseTypes, OccupancyState). The PoseableProps list is cached internally so that kichi_action can reference a propId during regular work sync without re-querying. Use this when the user asks to check kichi status, room status, or who is in the room. Also use this before creating a new note or daily recommended music album. For heartbeat planning, use the returned idlePlan as reference when shaping the next idle plan.";
    if (!includeDailySchedule) {
        return base;
    }
    return [
        "Set presenceScope to \"current\" when the user asks where you are or what you are doing.",
        "Set presenceScope to \"today\" when the user asks about today's plans.",
        "Omit presenceScope for every other status query.",
        "For current presence, live Kichi room state is authoritative when isAvatarInScene is true; when it is false, the tool resolves the current local daily-schedule slot.",
        "For today's plans, the tool returns the current source plus the valid current and upcoming daily-schedule slots.",
        base,
    ].join(" ");
}
function createKichiQueryStatusTool(service, includeDailySchedule) {
    return {
        name: "kichi_query_status",
        label: "kichi_query_status",
        description: buildKichiQueryStatusDescription(includeDailySchedule),
        parameters: {
            type: "object",
            properties: {
                requestId: {
                    type: "string",
                    description: "Optional request ID for tracing or deduplication.",
                },
                ...(includeDailySchedule
                    ? {
                        presenceScope: {
                            type: "string",
                            enum: [...PRESENCE_SCOPES],
                            description: "Use \"current\" for questions about your current location or activity. Use \"today\" for questions about today's plans. Otherwise omit this field.",
                        },
                    }
                    : {}),
            },
        },
        execute: async (_toolCallId, params) => {
            const { requestId, presenceScope: rawPresenceScope } = (params || {});
            if (requestId !== undefined && typeof requestId !== "string") {
                return jsonResult({ success: false, error: "requestId must be a string when provided" });
            }
            let presenceScope;
            if (rawPresenceScope !== undefined) {
                if (!includeDailySchedule) {
                    return jsonResult({
                        success: false,
                        error: "presenceScope is only available when the join source is kichiclaw",
                    });
                }
                if (!isPresenceScope(rawPresenceScope)) {
                    return jsonResult({
                        success: false,
                        error: `presenceScope must be one of: ${PRESENCE_SCOPES.join(", ")}`,
                    });
                }
                presenceScope = rawPresenceScope;
            }
            if (!service.hasValidIdentity() || !service.isConnected()) {
                return jsonResult({ success: false, error: "Not connected to Kichi world" });
            }
            let result;
            try {
                result = await service.queryStatus(typeof requestId === "string" ? requestId : undefined);
            }
            catch (error) {
                return jsonResult({
                    success: false,
                    error: `Failed to query status: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
            if (presenceScope === undefined) {
                return jsonResult(result);
            }
            if (typeof result.isAvatarInScene !== "boolean") {
                return jsonResult({
                    success: false,
                    error: "Kichi status response is missing boolean isAvatarInScene",
                    queryStatus: result,
                });
            }
            const shouldReadDailySchedule = presenceScope === "today" || !result.isAvatarInScene;
            if (!shouldReadDailySchedule) {
                return jsonResult({
                    ...result,
                    resolvedPresence: {
                        scope: presenceScope,
                        currentSource: "kichi_room",
                    },
                });
            }
            try {
                const dailySchedule = resolveMateDailySchedule(readMateDailySchedule(), presenceScope);
                return jsonResult({
                    ...result,
                    resolvedPresence: {
                        scope: presenceScope,
                        currentSource: result.isAvatarInScene ? "kichi_room" : "daily_schedule",
                        dailySchedule,
                    },
                });
            }
            catch (error) {
                return jsonResult({
                    success: false,
                    error: `Failed to resolve daily schedule: ${error instanceof Error ? error.message : String(error)}`,
                    queryStatus: result,
                });
            }
        },
    };
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
export function registerPluginTools(api, runtimeManager, musicTitleEnum) {
    api.registerTool((ctx) => {
        const locator = resolveToolLocator(ctx);
        const agentId = runtimeManager.resolveRuntimeAgentId(locator);
        if (!agentId) {
            return null;
        }
        const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
        if (!isOfficialOpenClawSource(KICHI_WORLD_ROOT_DIR)) {
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
                    ? readConfiguredJoinSource(KICHI_WORLD_ROOT_DIR) ?? "openclaw"
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
                    service.sendAction({
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
        name: "kichi_emoji",
        label: "kichi_emoji",
        description: "Show one supported emoji above the Kichi avatar's head. Use for direct player requests or a clearly requested expressive reaction; do not use during routine heartbeat/status synchronization.",
        parameters: {
            type: "object",
            properties: {
                emojiName: {
                    type: "string",
                    enum: [...KICHI_EMOJI_NAMES],
                    description: "Emoji name. Use one of the exact supported names.",
                },
                requestId: {
                    type: "string",
                    description: "Optional client request ID for tracing. The websocket ack returns this ID.",
                },
            },
            required: ["emojiName"],
        },
        execute: async (_toolCallId, params) => {
            const locator = resolveToolLocator(ctx);
            const agentId = runtimeManager.resolveRuntimeAgentId(locator);
            if (!agentId) {
                return jsonResult({ success: false, error: "Failed to resolve agent-scoped Kichi runtime" });
            }
            const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
            const { emojiName, requestId } = (params || {});
            if (typeof emojiName !== "string" || !KICHI_EMOJI_NAMES.includes(emojiName)) {
                return jsonResult({
                    success: false,
                    error: `emojiName must be one of: ${KICHI_EMOJI_NAMES.join(", ")}`,
                });
            }
            if (requestId !== undefined && typeof requestId !== "string") {
                return jsonResult({ success: false, error: "requestId must be a string when provided" });
            }
            if (!service.hasValidIdentity() || !service.isConnected()) {
                return jsonResult({ success: false, error: "Not connected to Kichi world" });
            }
            try {
                const ack = await service.sendEmoji(emojiName, typeof requestId === "string" ? requestId : undefined);
                return jsonResult({
                    success: true,
                    sent: true,
                    confirmed: false,
                    requestId: ack.requestId,
                    emojiName: ack.emojiName,
                    message: "Server accepted and broadcast the emoji; client rendering is not confirmed.",
                });
            }
            catch (error) {
                return jsonResult({ success: false, error: `Failed to send emoji: ${error}` });
            }
        },
    }), { name: "kichi_emoji" });
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
        name: "kichi_environment",
        label: "kichi_environment",
        description: "Change the Kichi scene's weather, time, House lighting, or current music playback. Provide at least one setting. musicAction selects the next or previous track; musicPlayType selects sequential or random playback. The server checks room permissions. Success means the server forwarded the change; the client has not confirmed applying it.",
        parameters: {
            type: "object",
            properties: {
                weather: {
                    type: "string",
                    enum: [...ENVIRONMENT_WEATHERS],
                    description: "Weather to apply in the Kichi scene.",
                },
                time: {
                    type: "string",
                    enum: [...ENVIRONMENT_TIMES],
                    description: "Scene time to apply. Auto restores automatic time.",
                },
                lightingValue: {
                    type: "number",
                    minimum: 0.1,
                    maximum: 2,
                    description: "House lighting intensity from 0.1 to 2. To turn lights off, use lightingEnabled=false.",
                },
                lightingEnabled: {
                    type: "boolean",
                    description: "Enable or disable all House lights.",
                },
                musicPaused: {
                    type: "boolean",
                    description: "Pause the current music when true, or resume it when false.",
                },
                musicAction: {
                    type: "string",
                    enum: [...MUSIC_ACTIONS],
                    description: "Select the next or previous track in the current music album.",
                },
                musicPlayType: {
                    type: "string",
                    enum: [...MUSIC_PLAY_TYPES],
                    description: "Select sequential (Loop) or random (Random) playback.",
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
            if (!service.hasValidIdentity() || !service.isConnected()) {
                return jsonResult({ success: false, error: "Not connected to Kichi world" });
            }
            try {
                const result = await service.sendEnvironmentControl(params);
                return jsonResult({
                    success: true,
                    sent: true,
                    confirmed: false,
                    requestId: result.requestId,
                    environment: result.environment,
                    message: "Kichi server forwarded the environment change. The client has not confirmed applying it.",
                });
            }
            catch (error) {
                return jsonResult({
                    success: false,
                    error: `Failed to change Kichi environment: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        },
    }), { name: "kichi_environment" });
    api.registerTool((ctx) => {
        const locator = resolveToolLocator(ctx);
        const agentId = runtimeManager.resolveRuntimeAgentId(locator);
        if (!agentId) {
            return null;
        }
        const service = runtimeManager.getRuntime(locator) ?? runtimeManager.createRuntimeForAgent(agentId);
        return createKichiQueryStatusTool(service, isOfficialOpenClawSource(KICHI_WORLD_ROOT_DIR));
    }, { name: "kichi_query_status" });
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
}
