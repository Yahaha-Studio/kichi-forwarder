import { isPlainObject } from "./validation.js";
import type {
  MateDailySchedule,
  MateDailySchedulePlace,
  MateDailyScheduleSlot,
} from "./types.js";

export const PRESENCE_SCOPES = ["current", "today"] as const;
export type PresenceScope = typeof PRESENCE_SCOPES[number];

function parseMateDailySchedulePlace(value: unknown, slotIndex: number): MateDailySchedulePlace {
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

function parseMateDailyScheduleSlot(value: unknown, index: number): MateDailyScheduleSlot {
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

export function parseMateDailySchedule(value: unknown): MateDailySchedule {
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

type ResolvedMateDailySchedule = {
  date: string;
  timezone: string;
  currentHour: number;
  currentSlot: MateDailyScheduleSlot;
  activeArcs?: string[];
  upcomingSlots?: MateDailyScheduleSlot[];
};

export function isPresenceScope(value: unknown): value is PresenceScope {
  return typeof value === "string" && PRESENCE_SCOPES.includes(value as PresenceScope);
}

function getScheduleLocalDateAndHour(
  timezone: string,
  now = new Date(),
): { date: string; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const readPart = (type: string): string => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) {
      throw new Error(`Failed to resolve ${type} in timezone ${timezone}`);
    }
    return value;
  };
  const hour = Number.parseInt(readPart("hour"), 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Failed to resolve current hour in timezone ${timezone}`);
  }
  return {
    date: `${readPart("year")}-${readPart("month")}-${readPart("day")}`,
    hour,
  };
}

export function resolveMateDailySchedule(
  schedule: MateDailySchedule,
  scope: PresenceScope,
  now = new Date(),
): ResolvedMateDailySchedule {
  const local = getScheduleLocalDateAndHour(schedule.timezone, now);
  if (schedule.date !== local.date) {
    throw new Error(
      `daily-schedule.json is for ${schedule.date}, but the current date in ${schedule.timezone} is ${local.date}`,
    );
  }

  const slots = [...schedule.slots].sort((left, right) => left.h - right.h);
  if (slots.length === 0) {
    throw new Error("daily-schedule.json must contain at least one slot");
  }
  for (let index = 1; index < slots.length; index += 1) {
    if (slots[index - 1].h === slots[index].h) {
      throw new Error(`daily-schedule.json contains duplicate slots for hour ${slots[index].h}`);
    }
  }

  let currentSlot: MateDailyScheduleSlot | undefined;
  for (const slot of slots) {
    if (slot.h > local.hour) {
      break;
    }
    currentSlot = slot;
  }
  if (!currentSlot) {
    throw new Error(`daily-schedule.json has no slot covering hour ${local.hour}`);
  }

  const resolved: ResolvedMateDailySchedule = {
    date: schedule.date,
    timezone: schedule.timezone,
    currentHour: local.hour,
    currentSlot,
  };
  if (scope === "today") {
    resolved.activeArcs = schedule.activeArcs;
    resolved.upcomingSlots = slots.filter((slot) => slot.h > local.hour);
  }
  return resolved;
}

