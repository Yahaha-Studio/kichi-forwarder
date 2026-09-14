import * as fs from "node:fs";
import * as path from "node:path";

const JOIN_SOURCE_FILE_NAME = "join-source.json";
const OFFICIAL_OPENCLAW_JOIN_SOURCE = "kichiclaw";

export function getJoinSourcePath(kichiWorldRootDir: string): string {
  return path.join(kichiWorldRootDir, JOIN_SOURCE_FILE_NAME);
}

export function readConfiguredJoinSource(kichiWorldRootDir: string): string | null {
  const sourcePath = getJoinSourcePath(kichiWorldRootDir);
  if (!fs.existsSync(sourcePath)) {
    return null;
  }

  const data = JSON.parse(fs.readFileSync(sourcePath, "utf-8")) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${JOIN_SOURCE_FILE_NAME} must contain a JSON object`);
  }

  const source = (data as { source?: unknown }).source;
  if (typeof source !== "string" || !source.trim()) {
    throw new Error(`${JOIN_SOURCE_FILE_NAME} must contain a non-empty string source`);
  }

  return source.trim();
}

export function isOfficialOpenClawSource(kichiWorldRootDir: string): boolean {
  return readConfiguredJoinSource(kichiWorldRootDir) === OFFICIAL_OPENCLAW_JOIN_SOURCE;
}
