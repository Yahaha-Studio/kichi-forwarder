import { getActionDefinition, getActionPlayback } from "./catalog.js";
export const IDLE_PLAN_POMODORO_PHASES = ["focus", "shortBreak", "longBreak", "none"];
export const AVATAR_STATUSES = ["Idle", "Busy", "Activities", "Break"];
export function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function isNonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function isPositiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}
export function normalizeJoinTags(value) {
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
export function isClockAction(value) {
    return ["set", "stop"].includes(String(value));
}
function isIdlePlanPomodoroPhase(value) {
    return IDLE_PLAN_POMODORO_PHASES.includes(String(value));
}
export function normalizeAvatarStatus(value, fieldPath) {
    if (typeof value !== "string" || !AVATAR_STATUSES.includes(value)) {
        return { error: `${fieldPath} must be one of: ${AVATAR_STATUSES.join(", ")}` };
    }
    return { avatarStatus: value };
}
export function normalizeIdlePlan(value) {
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
export function normalizeClockConfig(value) {
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
