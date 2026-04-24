import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Logger } from "openclaw/plugin-sdk";
import { KichiForwarderService } from "./service.js";

const OPENCLAW_HOME_DIR = path.join(os.homedir(), ".openclaw");
const KICHI_WORLD_ROOT_DIR = path.join(OPENCLAW_HOME_DIR, "kichi-world");
const CANONICAL_AGENT_ROOT_DIR = path.join(KICHI_WORLD_ROOT_DIR, "agents");

type AgentLocator = {
  agentId?: string;
  ctxAgentId?: string;
  sessionKey?: string;
};

export class KichiRuntimeManager {
  private services = new Map<string, KichiForwarderService>();

  constructor(private logger: Logger) {}

  getRuntime(locator: AgentLocator): KichiForwarderService | null {
    const agentId = this.resolveAgentId(locator);
    if (!agentId) {
      return null;
    }

    return this.services.get(agentId) ?? null;
  }

  resolveRuntimeAgentId(locator: AgentLocator): string | null {
    return this.resolveAgentId(locator);
  }

  createRuntimeForAgent(agentId: string): KichiForwarderService {
    const normalizedAgentId = this.normalizeAgentId(agentId);
    if (!normalizedAgentId) {
      throw new Error("Cannot create Kichi runtime without a valid agentId");
    }

    const existing = this.services.get(normalizedAgentId);
    if (existing) {
      return existing;
    }

    return this.createRuntime(normalizedAgentId);
  }

  initializeStartupRuntimes(): void {
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
    const directAgentId = this.normalizeAgentId(locator.ctxAgentId) ?? this.normalizeAgentId(locator.agentId);
    const sessionAgentId =
      typeof locator.sessionKey === "string" && locator.sessionKey.trim()
        ? this.parseAgentIdFromSessionKey(locator.sessionKey)
        : null;

    if (sessionAgentId) {
      if (directAgentId && directAgentId !== sessionAgentId) {
        this.logger.error(
          `[kichi] runtime scope mismatch: directAgentId=${directAgentId} sessionAgentId=${sessionAgentId} sessionKey=${locator.sessionKey}`,
        );
      }
      this.logger.debug(`[kichi] resolved agent runtime from sessionKey: ${sessionAgentId}`);
      return sessionAgentId;
    }

    return directAgentId;
  }

  private normalizeAgentId(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private parseAgentIdFromSessionKey(sessionKey: string): string | null {
    const trimmed = sessionKey.trim();
    const match = /^agent:([^:]+):/i.exec(trimmed);
    if (!match) {
      return null;
    }
    return this.normalizeAgentId(match[1]);
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
