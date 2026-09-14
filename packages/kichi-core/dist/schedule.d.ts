import type { MateDailySchedule, MateDailyScheduleSlot } from "./types.js";
export declare const PRESENCE_SCOPES: readonly ["current", "today"];
export type PresenceScope = typeof PRESENCE_SCOPES[number];
export declare function parseMateDailySchedule(value: unknown): MateDailySchedule;
type ResolvedMateDailySchedule = {
    date: string;
    timezone: string;
    currentHour: number;
    currentSlot: MateDailyScheduleSlot;
    activeArcs?: string[];
    upcomingSlots?: MateDailyScheduleSlot[];
};
export declare function isPresenceScope(value: unknown): value is PresenceScope;
export declare function resolveMateDailySchedule(schedule: MateDailySchedule, scope: PresenceScope, now?: Date): ResolvedMateDailySchedule;
export {};
