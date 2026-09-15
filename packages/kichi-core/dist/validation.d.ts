import type { AvatarStatus, ClockAction, ClockConfig, EnvironmentControl, PoseType } from "./types.js";
export declare const IDLE_PLAN_POMODORO_PHASES: readonly ["focus", "shortBreak", "longBreak", "none"];
export declare const AVATAR_STATUSES: readonly ["Idle", "Busy", "Activities", "Break"];
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
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
export declare function normalizeEnvironmentControl(value: unknown): EnvironmentControl;
export declare function normalizeJoinTags(value: unknown): {
    tags?: string[];
    error?: string;
};
export declare function isClockAction(value: unknown): value is ClockAction;
export declare function normalizeAvatarStatus(value: unknown, fieldPath: string): {
    avatarStatus?: AvatarStatus;
    error?: string;
};
export declare function normalizeIdlePlan(value: unknown): {
    idlePlan?: IdlePlan;
    error?: string;
};
export declare function normalizeClockConfig(value: unknown): {
    clock?: ClockConfig;
    error?: string;
};
export {};
