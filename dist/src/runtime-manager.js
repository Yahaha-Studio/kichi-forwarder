import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KichiForwarderService } from "./service.js";
const OPENCLAW_HOME_DIR = path.join(os.homedir(), ".openclaw");
const KICHI_WORLD_ROOT_DIR = path.join(OPENCLAW_HOME_DIR, "kichi-world");
const CANONICAL_AGENT_ROOT_DIR = path.join(KICHI_WORLD_ROOT_DIR, "agents");
export class KichiRuntimeManager {
    logger;
    services = new Map();
    resolveEnvironmentHost = null;
    botMessageHandler = null;
    constructor(logger) {
        this.logger = logger;
    }
    setBotMessageHandler(handler) {
        this.botMessageHandler = handler;
        for (const service of this.services.values()) {
            service.onBotMessageReceived = handler;
        }
    }
    setEnvironmentHostResolver(resolver) {
        this.resolveEnvironmentHost = resolver;
    }
    getRuntime(locator) {
        const agentId = this.resolveAgentId(locator);
        if (!agentId) {
            return null;
        }
        return this.services.get(agentId) ?? null;
    }
    resolveRuntimeAgentId(locator) {
        return this.resolveAgentId(locator);
    }
    createRuntimeForAgent(agentId) {
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
    initializeStartupRuntimes() {
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
    stopAll() {
        for (const service of this.services.values()) {
            service.stop();
        }
        this.services.clear();
    }
    resolveAgentId(locator) {
        const directAgentId = this.normalizeAgentId(locator.ctxAgentId) ?? this.normalizeAgentId(locator.agentId);
        const sessionAgentId = typeof locator.sessionKey === "string" && locator.sessionKey.trim()
            ? this.parseAgentIdFromSessionKey(locator.sessionKey)
            : null;
        if (sessionAgentId) {
            if (directAgentId && directAgentId !== sessionAgentId) {
                this.logger.error(`[kichi] runtime scope mismatch: directAgentId=${directAgentId} sessionAgentId=${sessionAgentId}`);
            }
            this.logger.debug(`[kichi] resolved agent runtime from sessionKey: ${sessionAgentId}`);
            return sessionAgentId;
        }
        return directAgentId;
    }
    normalizeAgentId(value) {
        return typeof value === "string" && value.trim() ? value.trim() : null;
    }
    parseAgentIdFromSessionKey(sessionKey) {
        const trimmed = sessionKey.trim();
        const match = /^agent:([^:]+):/i.exec(trimmed);
        if (!match) {
            return null;
        }
        return this.normalizeAgentId(match[1]);
    }
    createRuntime(agentId) {
        if (!this.resolveEnvironmentHost) {
            throw new Error("Environment host resolver not set on KichiRuntimeManager");
        }
        const runtimeDir = this.getRuntimeDir(agentId);
        fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
        const resolveEnvironmentHost = this.resolveEnvironmentHost;
        const service = new KichiForwarderService(this.logger, {
            agentId,
            runtimeDir,
            resolveEnvironmentHost,
        });
        if (this.botMessageHandler) {
            service.onBotMessageReceived = this.botMessageHandler;
        }
        service.start();
        this.services.set(agentId, service);
        this.logger.debug(`[kichi:${agentId}] runtime initialized at ${runtimeDir}`);
        return service;
    }
    getRuntimeDir(agentId) {
        return path.join(CANONICAL_AGENT_ROOT_DIR, encodeURIComponent(agentId));
    }
}
