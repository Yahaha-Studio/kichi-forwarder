import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeKichiHost } from "./host.js";
import type {
  ActionDefinition,
  ActionPlayback,
  Album,
  KichiEnvironment,
  KichiEnvironmentsConfig,
  KichiStaticConfig,
  PoseType,
} from "./types.js";

const BUNDLED_STATIC_CONFIG_PATH = new URL("../config/kichi-config.json", import.meta.url);
const BUNDLED_ENVIRONMENTS_CONFIG_PATH = new URL("../config/environments.json", import.meta.url);
let cachedStaticConfig: KichiStaticConfig | null = null;
let cachedStaticConfigMtime = 0;

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

export function getMusicTitleEnum(): string[] {
  return loadRuntimeAlbumConfig().track.map((item) => item.name);
}

export function getMusicTitleExamples(): string[] {
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

export function loadStaticConfig(): KichiStaticConfig {
  const configPath = fileURLToPath(BUNDLED_STATIC_CONFIG_PATH);
  const stat = fs.statSync(configPath);
  if (!cachedStaticConfig || stat.mtimeMs !== cachedStaticConfigMtime) {
    const raw = fs.readFileSync(configPath, "utf-8");
    cachedStaticConfig = normalizeStaticConfig(JSON.parse(raw));
    cachedStaticConfigMtime = stat.mtimeMs;
  }
  return cachedStaticConfig;
}

export const VALID_ENVIRONMENTS: KichiEnvironment[] = ["steam", "steam-playtest", "test"];
let cachedEnvironmentsConfig: KichiEnvironmentsConfig | null = null;
let cachedEnvironmentsConfigMtime = 0;

function getEnvironmentsConfigPath(): string {
  return fileURLToPath(BUNDLED_ENVIRONMENTS_CONFIG_PATH);
}

export function loadEnvironmentsConfig(): KichiEnvironmentsConfig {
  const configPath = getEnvironmentsConfigPath();
  const stat = fs.statSync(configPath);
  if (cachedEnvironmentsConfig && stat.mtimeMs === cachedEnvironmentsConfigMtime) {
    return cachedEnvironmentsConfig;
  }
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as unknown;
  if (!raw || typeof raw !== "object") {
    throw new Error("config/environments.json must be a valid object");
  }
  const config = raw as Record<string, unknown>;
  for (const env of VALID_ENVIRONMENTS) {
    if (!(env in config)) {
      throw new Error(`config/environments.json missing environment "${env}"`);
    }
    const value = config[env];
    if (value !== null && typeof value !== "string") {
      throw new Error(`config/environments.json environment "${env}" must be a string or null`);
    }
  }
  cachedEnvironmentsConfig = config as KichiEnvironmentsConfig;
  cachedEnvironmentsConfigMtime = stat.mtimeMs;
  return cachedEnvironmentsConfig;
}

export function isKichiEnvironment(value: unknown): value is KichiEnvironment {
  return typeof value === "string" && VALID_ENVIRONMENTS.includes(value as KichiEnvironment);
}

function resolveEnvironmentHost(environment: KichiEnvironment): { host?: string; error?: string } {
  const config = loadEnvironmentsConfig();
  const configuredHost = config[environment];
  if (typeof configuredHost === "string" && configuredHost.trim()) {
    const host = configuredHost.trim();
    try {
      normalizeKichiHost(host);
      return { host };
    } catch (error) {
      return { error: `environment "${environment}" has an invalid host: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  return { error: `environment "${environment}" has no configured host — update config/environments.json first` };
}

export function resolveJoinEnvironmentHost(params: {
  environment?: unknown;
  host?: unknown;
}): { environment?: KichiEnvironment; host?: string; error?: string } {
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
    } catch (error) {
      return { environment: params.environment, error: error instanceof Error ? error.message : String(error) };
    }
  }
  const resolved = resolveEnvironmentHost(params.environment);
  if (resolved.error) {
    return { environment: params.environment, error: resolved.error };
  }
  return { environment: params.environment, host: resolved.host };
}

export function normalizeMusicTitles(value: unknown): { titles: string[]; invalidTitles: string[] } {
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

export function getActionDefinition(poseType: PoseType, action: string): ActionDefinition {
  const poseActions = loadStaticConfig().actions[poseType];
  const matched = poseActions.find((entry) => entry.name.toLowerCase() === action.toLowerCase());
  if (!matched) {
    throw new Error(`Unknown action "${action}" for poseType "${poseType}"`);
  }
  return matched;
}

export function getActionPlayback(action: ActionDefinition): ActionPlayback {
  return action.playback === "once"
    ? {
        mode: "once",
        resumeAction: action.resumeAction,
      }
    : {
        mode: "loop",
      };
}

