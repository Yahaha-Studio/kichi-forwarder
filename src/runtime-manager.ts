import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Logger } from "openclaw/plugin-sdk";
import { resolveAgentIdFromSessionKey } from "openclaw/plugin-sdk/routing";
import { KichiForwarderService } from "./service.js";

const OPENCLAW_HOME_DIR = path.join(os.homedir(), ".openclaw");
const KICHI_WORLD_ROOT_DIR = path.join(OPENCLAW_HOME_DIR, "kichi-world");
const CANONICAL_AGENT_ROOT_DIR = path.join(KICHI_WORLD_ROOT_DIR, "agents");
const PREVIOUS_AGENT_ROOT_DIR = path.join(OPENCLAW_HOME_DIR, "kichi-forwarder", "agents");
const LEGACY_GLOBAL_STATE_PATH = path.join(KICHI_WORLD_ROOT_DIR, "state.json");
const LEGACY_GLOBAL_HOSTS_DIR = path.join(KICHI_WORLD_ROOT_DIR, "hosts");
const LEGACY_MIGRATION_AGENT_ID = "main";

type AgentLocator = {
  agentId?: string;
  sessionKey?: string;
};

type GetRuntimeOptions = {
  createIfMissing?: boolean;
};

export class KichiRuntimeManager {
  private services = new Map<string, KichiForwarderService>();

  constructor(private logger: Logger) {}

  getRuntime(locator: AgentLocator, options: GetRuntimeOptions = {}): KichiForwarderService | null {
    const agentId = this.resolveAgentId(locator);
    if (!agentId) {
      return null;
    }

    const existing = this.services.get(agentId);
    if (existing) {
      return existing;
    }

    if (!options.createIfMissing && !this.hasPersistedRuntime(agentId)) {
      return null;
    }

    return this.createRuntime(agentId);
  }

  startPersistedRuntimes(): void {
    this.migrateRuntimeStorage();

    const rootDir = CANONICAL_AGENT_ROOT_DIR;
    if (!fs.existsSync(rootDir)) {
      return;
    }

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const runtimeDir = path.join(rootDir, entry.name);
      const statePath = path.join(runtimeDir, "state.json");
      if (!fs.existsSync(statePath)) {
        continue;
      }

      const agentId = decodeURIComponent(entry.name);
      if (this.services.has(agentId)) {
        continue;
      }

      this.createRuntime(agentId);
    }
  }

  stopAll(): void {
    for (const service of this.services.values()) {
      service.stop();
    }
    this.services.clear();
  }

  private resolveAgentId(locator: AgentLocator): string | null {
    if (typeof locator.agentId === "string" && locator.agentId.trim()) {
      return locator.agentId.trim();
    }

    if (typeof locator.sessionKey !== "string" || !locator.sessionKey.trim()) {
      return null;
    }

    try {
      const agentId = resolveAgentIdFromSessionKey(locator.sessionKey);
      return typeof agentId === "string" && agentId.trim() ? agentId.trim() : null;
    } catch {
      return null;
    }
  }

  private hasPersistedRuntime(agentId: string): boolean {
    return fs.existsSync(path.join(this.getRuntimeDir(agentId), "state.json"));
  }

  private migrateRuntimeStorage(): void {
    // Temporary startup migration for this release. Remove after users have
    // moved off the legacy/global layout and the temporary kichi-forwarder path.
    this.runMigrationStep("previous-agent-root", () => {
      this.migratePreviousAgentRoot();
    });
    this.runMigrationStep("legacy-global-root", () => {
      this.migrateLegacyGlobalRoot();
    });
  }

  private migratePreviousAgentRoot(): void {
    if (!fs.existsSync(PREVIOUS_AGENT_ROOT_DIR)) {
      return;
    }

    if (!fs.existsSync(CANONICAL_AGENT_ROOT_DIR)) {
      fs.mkdirSync(path.dirname(CANONICAL_AGENT_ROOT_DIR), { recursive: true, mode: 0o700 });
      fs.renameSync(PREVIOUS_AGENT_ROOT_DIR, CANONICAL_AGENT_ROOT_DIR);
      this.logger.info(`[kichi:migration] moved ${PREVIOUS_AGENT_ROOT_DIR} to ${CANONICAL_AGENT_ROOT_DIR}`);
      return;
    }

    for (const entry of fs.readdirSync(PREVIOUS_AGENT_ROOT_DIR, { withFileTypes: true })) {
      const sourcePath = path.join(PREVIOUS_AGENT_ROOT_DIR, entry.name);
      const targetPath = path.join(CANONICAL_AGENT_ROOT_DIR, entry.name);
      this.movePathIntoTarget(sourcePath, targetPath);
    }
    this.removeDirectoryIfEmpty(PREVIOUS_AGENT_ROOT_DIR);
    this.removeDirectoryIfEmpty(path.dirname(PREVIOUS_AGENT_ROOT_DIR));
  }

  private migrateLegacyGlobalRoot(): void {
    const hasLegacyState = fs.existsSync(LEGACY_GLOBAL_STATE_PATH);
    const hasLegacyHosts = fs.existsSync(LEGACY_GLOBAL_HOSTS_DIR);
    if (!hasLegacyState && !hasLegacyHosts) {
      return;
    }

    const targetRuntimeDir = this.getRuntimeDir(LEGACY_MIGRATION_AGENT_ID);
    fs.mkdirSync(targetRuntimeDir, { recursive: true, mode: 0o700 });

    if (hasLegacyState) {
      const targetStatePath = path.join(targetRuntimeDir, "state.json");
      this.movePathIntoTarget(LEGACY_GLOBAL_STATE_PATH, targetStatePath);
    }

    if (hasLegacyHosts) {
      const targetHostsDir = path.join(targetRuntimeDir, "hosts");
      this.movePathIntoTarget(LEGACY_GLOBAL_HOSTS_DIR, targetHostsDir);
    }
  }

  private movePathIntoTarget(sourcePath: string, targetPath: string): void {
    if (!fs.existsSync(sourcePath)) {
      return;
    }

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
      fs.renameSync(sourcePath, targetPath);
      this.logger.info(`[kichi:migration] moved ${sourcePath} to ${targetPath}`);
      return;
    }

    const sourceStat = fs.lstatSync(sourcePath);
    const targetStat = fs.lstatSync(targetPath);

    if (sourceStat.isDirectory() && targetStat.isDirectory()) {
      for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
        const nextSourcePath = path.join(sourcePath, entry.name);
        const nextTargetPath = path.join(targetPath, entry.name);
        this.movePathIntoTarget(nextSourcePath, nextTargetPath);
      }
      this.removeDirectoryIfEmpty(sourcePath);
      return;
    }

    fs.rmSync(sourcePath, { recursive: sourceStat.isDirectory(), force: true });
    this.logger.warn(`[kichi:migration] dropped ${sourcePath} because target already exists at ${targetPath}`);
  }

  private removeDirectoryIfEmpty(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      return;
    }
    if (!fs.lstatSync(dirPath).isDirectory()) {
      return;
    }
    if (fs.readdirSync(dirPath).length > 0) {
      return;
    }
    fs.rmdirSync(dirPath);
  }

  private runMigrationStep(label: string, fn: () => void): void {
    try {
      fn();
    } catch (error) {
      this.logger.warn(`[kichi:migration] skipped ${label} due to error: ${String(error)}`);
    }
  }

  private createRuntime(agentId: string): KichiForwarderService {
    const runtimeDir = this.getRuntimeDir(agentId);
    fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });

    const service = new KichiForwarderService(this.logger, {
      agentId,
      runtimeDir,
    });
    service.start();
    this.services.set(agentId, service);
    this.logger.debug(`[kichi:${agentId}] runtime initialized at ${runtimeDir}`);
    return service;
  }

  private getRuntimeDir(agentId: string): string {
    return path.join(CANONICAL_AGENT_ROOT_DIR, encodeURIComponent(agentId));
  }
}
