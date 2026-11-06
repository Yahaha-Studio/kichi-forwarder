import { getActionDefinition, getActionPlayback } from "./catalog.js";
import {
  AMBIENT_SOUND_ACTIONS,
  AMBIENT_SOUND_TITLES,
  DIARY_MOODS,
  ENVIRONMENT_TIMES,
  ENVIRONMENT_WEATHERS,
  KICHI_EMOJI_NAMES,
  MUSIC_ACTIONS,
  MUSIC_PLAY_TYPES,
} from "./types.js";
import type {
  ActionDefinition,
  AmbientSoundOperation,
  AvatarStatus,
  ClockAction,
  ClockConfig,
  DiaryCreateInput,
  DiaryGetInput,
  DiaryListInput,
  DiaryUpdateInput,
  EnvironmentControl,
  EnvironmentTime,
  EnvironmentWeather,
  KichiEmojiName,
  MusicAction,
  MusicPlayType,
  PomodoroPhase,
  PoseType,
} from "./types.js";

export const IDLE_PLAN_POMODORO_PHASES = ["focus", "shortBreak", "longBreak", "none"] as const;
export const AVATAR_STATUSES = ["Idle", "Busy", "Activities", "Break"] as const;

export function normalizeEmojiName(value: unknown): KichiEmojiName {
  if (typeof value !== "string") {
    throw new Error("emojiName must be a string");
  }
  const emojiName = value.trim();
  if (!KICHI_EMOJI_NAMES.includes(emojiName as KichiEmojiName)) {
    throw new Error(`emojiName must be one of: ${KICHI_EMOJI_NAMES.join(", ")}`);
  }
  return emojiName as KichiEmojiName;
}

type AvatarStatusName = typeof AVATAR_STATUSES[number];
type IdlePlanPomodoroPhase = typeof IDLE_PLAN_POMODORO_PHASES[number];
type IdlePlanAction = {
  poseType: PoseType;
  action: string;
  durationSeconds: number;
  bubble: string;
  log: string;
};
export type IdlePlan = {
  requestId?: string;
  heartbeatIntervalSeconds: number;
  goal: string;
  totalDurationSeconds: number;
  stages: Array<{
    name: string;
    purpose: string;
    pomodoroPhase: IdlePlanPomodoroPhase;
    avatarStatus: AvatarStatus;
    durationSeconds: number;
    actions: IdlePlanAction[];
  }>;
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requireDiaryFields(value: unknown, fields: string[]): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error("diary input must be an object");
  }
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) {
      throw new Error(`Unknown diary field: ${field}`);
    }
  }
  return value;
}

function requireDiaryId(value: unknown, field = "id"): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

export function normalizeDiaryListInput(value: unknown): DiaryListInput {
  const input = requireDiaryFields(value, ["start", "count", "cursorCreateTime", "cursorId"]);
  const { start, count, cursorCreateTime, cursorId } = input;
  if (start !== undefined && (typeof start !== "number" || !Number.isInteger(start) || start < 0 || start > 2147483647)) {
    throw new Error("start must be an integer from 0 to 2147483647");
  }
  if (count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 200)) {
    throw new Error("count must be an integer from 1 to 200");
  }
  if ((cursorCreateTime !== undefined) !== (cursorId !== undefined)) {
    throw new Error("cursorCreateTime and cursorId must be provided together");
  }
  const result: DiaryListInput = {
    ...(start !== undefined ? { start: start as number } : {}),
    ...(count !== undefined ? { count: count as number } : {}),
  };
  if (cursorCreateTime !== undefined) {
    if (typeof cursorCreateTime !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursorCreateTime)
      || !Number.isFinite(Date.parse(cursorCreateTime))) {
      throw new Error("cursorCreateTime must be an ISO 8601 timestamp with a time zone");
    }
    // Keep the server's timestamp precision for stable cursor pagination.
    result.cursorCreateTime = cursorCreateTime;
    result.cursorId = requireDiaryId(cursorId, "cursorId");
  }
  return result;
}

function requireDiaryContent(input: Record<string, unknown>): DiaryCreateInput {
  if (typeof input.title !== "string" || input.title.length > 20) {
    throw new Error("title must be a string of at most 20 UTF-16 code units; empty strings are allowed");
  }
  if (typeof input.content !== "string" || input.content.length > 1000) {
    throw new Error("content must be a string of at most 1000 UTF-16 code units; empty strings are allowed");
  }
  const mood = DIARY_MOODS.find((name) => name === input.mood);
  if (mood === undefined) {
    throw new Error(`mood must be one of: ${DIARY_MOODS.join(", ")}`);
  }
  return { title: input.title, content: input.content, mood };
}

export function normalizeDiaryCreateInput(value: unknown): DiaryCreateInput {
  return requireDiaryContent(requireDiaryFields(value, ["title", "content", "mood"]));
}

export function normalizeDiaryUpdateInput(value: unknown): DiaryUpdateInput {
  const input = requireDiaryFields(value, ["id", "title", "content", "mood"]);
  return { id: requireDiaryId(input.id), ...requireDiaryContent(input) };
}

export function normalizeDiaryIdInput(value: unknown): DiaryGetInput {
  const input = requireDiaryFields(value, ["id"]);
  return { id: requireDiaryId(input.id) };
}

const ENVIRONMENT_SETTING_FIELDS = [
  "weather", "time", "lightingValue", "lightingEnabled", "ambientLightIntensity", "ambientLightEnabled",
  "musicAlbumTitle", "musicTitle", "musicPaused", "musicAction", "musicPlayType", "ambientSoundOperations",
];

function validateAmbientSoundOperations(value: unknown): AmbientSoundOperation[] {
  if (!Array.isArray(value)) {
    throw new Error("ambientSoundOperations must be an array");
  }
  return Array.from(value, (operation: unknown, index) => {
    const field = `ambientSoundOperations[${index}]`;
    if (!isPlainObject(operation) || Object.keys(operation).length !== 2
      || !Object.hasOwn(operation, "title") || !Object.hasOwn(operation, "action")) {
      throw new Error(`${field} must be an object with title and action`);
    }
    const title = AMBIENT_SOUND_TITLES.find((name) => name === operation.title);
    if (title === undefined) {
      throw new Error(`${field}.title must exactly match an ambient sound in the catalog`);
    }
    const action = AMBIENT_SOUND_ACTIONS.find((name) => name === operation.action);
    if (action === undefined) {
      throw new Error(`${field}.action must be Play or Stop`);
    }
    return { title, action };
  });
}

export function normalizeEnvironmentControl(value: unknown): EnvironmentControl {
  if (!isPlainObject(value)) {
    throw new Error("environment must be an object");
  }
  for (const key of Object.keys(value)) {
    if (key !== "ambientSoundOverwrite" && !ENVIRONMENT_SETTING_FIELDS.includes(key)) {
      throw new Error(`Unsupported environment field: ${key}`);
    }
  }
  const {
    weather, time, lightingValue, lightingEnabled, ambientLightIntensity, ambientLightEnabled,
    musicAlbumTitle, musicTitle, musicPaused, musicAction, musicPlayType, ambientSoundOperations, ambientSoundOverwrite,
  } = value;
  if (ambientSoundOverwrite !== undefined && typeof ambientSoundOverwrite !== "boolean") {
    throw new Error("ambientSoundOverwrite must be a boolean");
  }
  if (ambientSoundOverwrite !== undefined && ambientSoundOperations === undefined) {
    throw new Error("ambientSoundOverwrite requires ambientSoundOperations");
  }
  if (!ENVIRONMENT_SETTING_FIELDS.some((field) => value[field] !== undefined)) {
    throw new Error(`environment must contain at least one setting: ${ENVIRONMENT_SETTING_FIELDS.join(", ")}`);
  }
  if (weather !== undefined && (typeof weather !== "string" || !ENVIRONMENT_WEATHERS.includes(weather as EnvironmentWeather))) {
    throw new Error(`weather must be one of: ${ENVIRONMENT_WEATHERS.join(", ")}`);
  }
  if (time !== undefined && (typeof time !== "string" || !ENVIRONMENT_TIMES.includes(time as EnvironmentTime))) {
    throw new Error(`time must be one of: ${ENVIRONMENT_TIMES.join(", ")}`);
  }
  if (lightingValue !== undefined && (typeof lightingValue !== "number" || !Number.isFinite(lightingValue) || lightingValue < 0.1 || lightingValue > 2)) {
    throw new Error("lightingValue must be a finite number from 0.1 to 2; use lightingEnabled to turn lights off");
  }
  if (lightingEnabled !== undefined && typeof lightingEnabled !== "boolean") {
    throw new Error("lightingEnabled must be a boolean");
  }
  if (ambientLightIntensity !== undefined && (typeof ambientLightIntensity !== "number" || !Number.isFinite(ambientLightIntensity) || ambientLightIntensity < 0.5 || ambientLightIntensity > 3)) {
    throw new Error("ambientLightIntensity must be a finite number from 0.5 to 3; use ambientLightEnabled to turn ambient light off");
  }
  if (ambientLightEnabled !== undefined && typeof ambientLightEnabled !== "boolean") {
    throw new Error("ambientLightEnabled must be a boolean");
  }
  if (musicAlbumTitle !== undefined && (typeof musicAlbumTitle !== "string" || !musicAlbumTitle.trim())) {
    throw new Error("musicAlbumTitle must be a non-empty string");
  }
  if (musicTitle !== undefined && (typeof musicTitle !== "string" || !musicTitle.trim())) {
    throw new Error("musicTitle must be a non-empty string");
  }
  if ((musicAlbumTitle !== undefined || musicTitle !== undefined) && (musicPaused !== undefined || musicAction !== undefined)) {
    throw new Error("musicAlbumTitle and musicTitle cannot be combined with musicPaused or musicAction");
  }
  if (musicPaused !== undefined && typeof musicPaused !== "boolean") {
    throw new Error("musicPaused must be a boolean");
  }
  if (musicAction !== undefined && (typeof musicAction !== "string" || !MUSIC_ACTIONS.includes(musicAction as MusicAction))) {
    throw new Error(`musicAction must be one of: ${MUSIC_ACTIONS.join(", ")}`);
  }
  if (musicPlayType !== undefined && (typeof musicPlayType !== "string" || !MUSIC_PLAY_TYPES.includes(musicPlayType as MusicPlayType))) {
    throw new Error(`musicPlayType must be one of: ${MUSIC_PLAY_TYPES.join(", ")}`);
  }
  return {
    ...(weather !== undefined ? { weather: weather as EnvironmentWeather } : {}),
    ...(time !== undefined ? { time: time as EnvironmentTime } : {}),
    ...(lightingValue !== undefined ? { lightingValue: lightingValue as number } : {}),
    ...(lightingEnabled !== undefined ? { lightingEnabled: lightingEnabled as boolean } : {}),
    ...(ambientLightIntensity !== undefined ? { ambientLightIntensity: ambientLightIntensity as number } : {}),
    ...(ambientLightEnabled !== undefined ? { ambientLightEnabled: ambientLightEnabled as boolean } : {}),
    ...(musicAlbumTitle !== undefined ? { musicAlbumTitle: (musicAlbumTitle as string).trim() } : {}),
    ...(musicTitle !== undefined ? { musicTitle: (musicTitle as string).trim() } : {}),
    ...(musicPaused !== undefined ? { musicPaused: musicPaused as boolean } : {}),
    ...(musicAction !== undefined ? { musicAction: musicAction as MusicAction } : {}),
    ...(musicPlayType !== undefined ? { musicPlayType: musicPlayType as MusicPlayType } : {}),
    ...(ambientSoundOperations !== undefined
      ? { ambientSoundOperations: validateAmbientSoundOperations(ambientSoundOperations) }
      : {}),
    ...(ambientSoundOverwrite !== undefined ? { ambientSoundOverwrite: ambientSoundOverwrite as boolean } : {}),
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function normalizeJoinTags(value: unknown): { tags?: string[]; error?: string } {
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

export function isClockAction(value: unknown): value is ClockAction {
  return ["set", "stop"].includes(String(value));
}

function isIdlePlanPomodoroPhase(value: unknown): value is IdlePlanPomodoroPhase {
  return IDLE_PLAN_POMODORO_PHASES.includes(String(value) as IdlePlanPomodoroPhase);
}

export function normalizeAvatarStatus(value: unknown, fieldPath: string): { avatarStatus?: AvatarStatus; error?: string } {
  if (typeof value !== "string" || !AVATAR_STATUSES.includes(value as AvatarStatusName)) {
    return { error: `${fieldPath} must be one of: ${AVATAR_STATUSES.join(", ")}` };
  }
  return { avatarStatus: value as AvatarStatus };
}

export function normalizeIdlePlan(value: unknown): { idlePlan?: IdlePlan; error?: string } {
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

  const normalizedStages: IdlePlan["stages"] = [];
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
    const stageAvatarStatus = avatarStatus === undefined ? (
      pomodoroPhase === "focus" ? "Busy" : pomodoroPhase === "none" ? "Idle" : "Break"
    ) : avatarStatus;
    const normalizedAvatarStatus = normalizeAvatarStatus(stageAvatarStatus, `stages[${stageIndex}].avatarStatus`);
    if (normalizedAvatarStatus.error || normalizedAvatarStatus.avatarStatus === undefined) {
      return { error: normalizedAvatarStatus.error ?? `stages[${stageIndex}].avatarStatus is invalid` };
    }
    if (!isPositiveInteger(durationSeconds)) {
      return { error: `stages[${stageIndex}].durationSeconds must be a positive integer` };
    }
    if (!Array.isArray(actions) || actions.length === 0) {
      return { error: `stages[${stageIndex}].actions must contain at least one action` };
    }

    const normalizedActions: IdlePlanAction[] = [];
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

      const normalizedPoseType = poseType as PoseType;
      let actionDefinition: ActionDefinition;
      try {
        actionDefinition = getActionDefinition(normalizedPoseType, action.trim());
      } catch (error) {
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


function isPomodoroPhase(value: unknown): value is PomodoroPhase {
  return ["focus", "shortBreak", "longBreak"].includes(String(value));
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

export function normalizeClockConfig(value: unknown): { clock?: ClockConfig; error?: string } {
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
