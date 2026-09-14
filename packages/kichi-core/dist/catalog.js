import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeKichiHost } from "./host.js";
const BUNDLED_STATIC_CONFIG_PATH = new URL("../config/kichi-config.json", import.meta.url);
const BUNDLED_ENVIRONMENTS_CONFIG_PATH = new URL("../config/environments.json", import.meta.url);
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
export function getMusicTitleEnum() {
    return loadRuntimeAlbumConfig().track.map((item) => item.name);
}
export function getMusicTitleExamples() {
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
export function loadStaticConfig() {
    const configPath = fileURLToPath(BUNDLED_STATIC_CONFIG_PATH);
    const stat = fs.statSync(configPath);
    if (!cachedStaticConfig || stat.mtimeMs !== cachedStaticConfigMtime) {
        const raw = fs.readFileSync(configPath, "utf-8");
        cachedStaticConfig = normalizeStaticConfig(JSON.parse(raw));
        cachedStaticConfigMtime = stat.mtimeMs;
    }
    return cachedStaticConfig;
}
export const VALID_ENVIRONMENTS = ["steam", "steam-playtest", "test"];
let cachedEnvironmentsConfig = null;
let cachedEnvironmentsConfigMtime = 0;
function getEnvironmentsConfigPath() {
    return fileURLToPath(BUNDLED_ENVIRONMENTS_CONFIG_PATH);
}
export function loadEnvironmentsConfig() {
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
export function isKichiEnvironment(value) {
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
export function resolveJoinEnvironmentHost(params) {
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
export function normalizeMusicTitles(value) {
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
export function getActionDefinition(poseType, action) {
    const poseActions = loadStaticConfig().actions[poseType];
    const matched = poseActions.find((entry) => entry.name.toLowerCase() === action.toLowerCase());
    if (!matched) {
        throw new Error(`Unknown action "${action}" for poseType "${poseType}"`);
    }
    return matched;
}
export function getActionPlayback(action) {
    return action.playback === "once"
        ? {
            mode: "once",
            resumeAction: action.resumeAction,
        }
        : {
            mode: "loop",
        };
}
