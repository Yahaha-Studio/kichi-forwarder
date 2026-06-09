import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "node:crypto";
const MAX_NOTEBOARD_TEXT_LENGTH = 200;
const DEFAULT_LLM_RUNTIME_ENABLED = true;
const DEFAULT_GLANCE_DURATION_SECONDS = 1.8;
const JOIN_SOURCE_FILE_NAME = "join-source.json";
const SMS_STATE_FILE_NAME = "sms-state.json";
export class KichiForwarderService {
    logger;
    options;
    ws = null;
    stopped = false;
    reconnectTimeout = null;
    joinTimeout = null;
    identity = null;
    host = null;
    environment = null;
    joinResolve = null;
    pendingRequests = new Map();
    onBotMessageReceived = null;
    cachedRoomContext = null;
    constructor(logger, options) {
        this.logger = logger;
        this.options = options;
    }
    start() {
        const state = this.readStateFile();
        this.environment = state?.currentEnvironment ?? null;
        if (this.environment) {
            this.host = this.options.resolveEnvironmentHost(this.environment);
            if (!this.host && this.environment === "test" && state?.testHost) {
                this.host = state.testHost;
            }
        }
        else {
            this.host = null;
        }
        this.identity = this.host ? this.loadIdentity() : null;
        this.stopped = false;
        if (this.host) {
            this.connect("startup");
            return;
        }
        this.log("debug", "host is not configured yet; waiting for kichi_switch_host");
    }
    stop() {
        this.stopped = true;
        this.clearReconnectTimeout();
        this.rejectPendingRequests("Kichi websocket stopped");
        this.failPendingJoin("Kichi websocket stopped");
        this.closeSocket();
    }
    async switchHost(host, environment) {
        this.persistCurrentHost(host, environment);
        this.host = host;
        this.environment = environment ?? null;
        this.identity = this.loadIdentity();
        this.clearReconnectTimeout();
        this.rejectPendingRequests(`Kichi websocket switched to ${host}`);
        this.failPendingJoin(`Kichi websocket switched to ${host}`);
        this.closeSocket();
        if (!this.stopped) {
            this.connect("switch_host");
        }
        return this.getConnectionStatus();
    }
    async join(avatarId, botName, bio, tags, source) {
        if (!this.host) {
            return { success: false, error: "No Kichi host configured. Run kichi_switch_host first." };
        }
        if (this.ws?.readyState !== WebSocket.OPEN && this.ws?.readyState !== WebSocket.CONNECTING) {
            return {
                success: false,
                error: "Kichi websocket is not connected. Restart the gateway to reconnect before joining.",
            };
        }
        return new Promise((resolve) => {
            this.failPendingJoin("Kichi join superseded by a new join request");
            this.identity = { avatarId };
            this.saveIdentity();
            this.joinResolve = resolve;
            const payload = { type: "join", avatarId, botName, bio, tags, source };
            const sendJoin = () => this.ws?.send(JSON.stringify(payload));
            if (this.ws?.readyState === WebSocket.OPEN) {
                sendJoin();
            }
            else {
                this.ws?.once("open", sendJoin);
            }
            this.joinTimeout = setTimeout(() => {
                if (this.joinResolve) {
                    this.joinResolve = null;
                    this.clearJoinTimeout();
                    resolve({ success: false, error: "Timed out waiting for join_ack" });
                }
            }, 10000);
        });
    }
    sendStatus(poseType, action, bubble, log, playback, avatarStatus, propId) {
        if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN)
            return;
        const payload = {
            type: "status",
            avatarId: this.identity.avatarId,
            authKey: this.identity.authKey,
            poseType,
            action,
            bubble,
            log,
            playback,
            avatarStatus,
            ...(propId ? { propId } : {}),
        };
        this.ws.send(JSON.stringify(payload));
    }
    async sendStatusVerified(poseType, action, bubble, log, playback, avatarStatus, propId) {
        if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error("Kichi websocket is not connected");
        }
        const payload = {
            type: "status",
            requestId: randomUUID(),
            avatarId: this.identity.avatarId,
            authKey: this.identity.authKey,
            poseType,
            action,
            bubble,
            log,
            playback,
            avatarStatus,
            ...(propId ? { propId } : {}),
        };
        return this.sendRequest(payload, "status_ack", 5000);
    }
    sendHookNotify(hookType, bubble) {
        if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN)
            return;
        const payload = {
            type: hookType,
            avatarId: this.identity.avatarId,
            authKey: this.identity.authKey,
            bubble,
        };
        this.ws.send(JSON.stringify(payload));
    }
    sendIdlePlan(payload) {
        if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN)
            return false;
        const outboundPayload = {
            type: "kichi_idle_plan",
            avatarId: this.identity.avatarId,
            authKey: this.identity.authKey,
            ...payload,
        };
        this.ws.send(JSON.stringify(outboundPayload));
        return true;
    }
    sendClock(action, clock, requestId) {
        if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN)
            return false;
        if (action === "set" && !clock)
            return false;
        const basePayload = {
            type: "clock",
            avatarId: this.identity.avatarId,
            authKey: this.identity.authKey,
            ...(requestId ? { requestId } : {}),
        };
        const payload = action === "set"
            ? {
                ...basePayload,
                action,
                clock,
            }
            : {
                ...basePayload,
                action,
            };
        this.ws.send(JSON.stringify(payload));
        return true;
    }
    async sendGlance(target, durationSeconds = DEFAULT_GLANCE_DURATION_SECONDS, requestId) {
        const identity = this.requireIdentity();
        if (!identity) {
            throw new Error("Missing Kichi identity");
        }
        if (this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error("Kichi websocket is not connected");
        }
        if (target !== "camera") {
            throw new Error("target must be camera");
        }
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            throw new Error("duration must be a positive finite number");
        }
        const payload = {
            type: "kichi_glance",
            requestId: requestId?.trim() || randomUUID(),
            avatarId: identity.avatarId,
            authKey: identity.authKey,
            target,
            duration: durationSeconds,
        };
        return this.sendRequest(payload, "kichi_glance_ack", 5000);
    }
    async queryStatus(requestId) {
        const identity = this.requireIdentity();
        if (!identity) {
            throw new Error("Missing Kichi identity");
        }
        const payload = {
            type: "query_status",
            requestId: requestId?.trim() || randomUUID(),
            avatarId: identity.avatarId,
            authKey: identity.authKey,
        };
        const result = await this.sendRequest(payload, "query_status_result");
        if (result.RoomContext && typeof result.RoomContext === "object") {
            this.cachedRoomContext = result.RoomContext;
        }
        return result;
    }
    createNotesBoardNote(propId, data) {
        const identity = this.requireIdentity();
        if (!identity) {
            throw new Error("Missing Kichi identity");
        }
        if (data.trim().length > MAX_NOTEBOARD_TEXT_LENGTH) {
            throw new Error(`Note content must be ${MAX_NOTEBOARD_TEXT_LENGTH} characters or fewer`);
        }
        if (this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error("Kichi websocket is not connected");
        }
        const payload = {
            type: "create_notes_board_note",
            avatarId: identity.avatarId,
            authKey: identity.authKey,
            propId,
            data,
        };
        this.ws.send(JSON.stringify(payload));
    }
    createMusicAlbum(albumTitle, musicTitles, requestId) {
        const identity = this.requireIdentity();
        if (!identity) {
            throw new Error("Missing Kichi identity");
        }
        if (!albumTitle.trim()) {
            throw new Error("albumTitle is required");
        }
        if (!Array.isArray(musicTitles) || musicTitles.length === 0) {
            throw new Error("musicTitles must contain at least one track title");
        }
        if (this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error("Kichi websocket is not connected");
        }
        const normalizedRequestId = requestId?.trim() || randomUUID();
        const payload = {
            type: "create_music_album",
            requestId: normalizedRequestId,
            avatarId: identity.avatarId,
            authKey: identity.authKey,
            albumTitle: albumTitle.trim(),
            musicTitles,
        };
        this.ws.send(JSON.stringify(payload));
        return normalizedRequestId;
    }
    async sendBotMessage(toAvatarId, depth, bubble, options) {
        if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error("Kichi websocket is not connected");
        }
        const payload = {
            type: "bot_message",
            avatarId: this.identity.avatarId,
            authKey: this.identity.authKey,
            toAvatarId,
            depth,
            bubble,
            requestId: randomUUID(),
            ...(options?.poseType ? { poseType: options.poseType } : {}),
            ...(options?.action ? { action: options.action } : {}),
            ...(options?.playback ? { playback: options.playback } : {}),
            ...(options?.log ? { log: options.log } : {}),
            ...(options?.history?.length ? { history: options.history } : {}),
        };
        return this.sendRequest(payload, "bot_message_ack", 5000);
    }
    isConnected() { return this.ws?.readyState === WebSocket.OPEN && !!this.identity?.authKey; }
    getCachedRoomContext() { return this.cachedRoomContext; }
    hasValidIdentity() { return !!this.identity?.avatarId && !!this.identity?.authKey; }
    isLlmRuntimeEnabled() {
        return this.readStateFile()?.llmRuntimeEnabled ?? DEFAULT_LLM_RUNTIME_ENABLED;
    }
    getCurrentHost() {
        return this.host ?? "";
    }
    getAgentId() {
        return this.options.agentId;
    }
    getRuntimeDir() {
        return this.options.runtimeDir;
    }
    getJoinSourcePath() {
        return path.join(this.getKichiWorldRootDir(), JOIN_SOURCE_FILE_NAME);
    }
    readConfiguredJoinSource() {
        const sourcePath = this.getJoinSourcePath();
        if (!fs.existsSync(sourcePath)) {
            return null;
        }
        const data = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error(`${JOIN_SOURCE_FILE_NAME} must contain a JSON object`);
        }
        const source = data.source;
        if (typeof source !== "string" || !source.trim()) {
            throw new Error(`${JOIN_SOURCE_FILE_NAME} must contain a non-empty string source`);
        }
        return source.trim();
    }
    getStatePath() {
        return path.join(this.options.runtimeDir, "state.json");
    }
    getIdentityPath() {
        if (!this.host) {
            return "";
        }
        return path.join(this.getIdentityDir(), "identity.json");
    }
    readSavedAvatarId() {
        if (!this.host) {
            return null;
        }
        return this.loadIdentity()?.avatarId ?? null;
    }
    requestRejoin() {
        if (!this.identity?.avatarId || !this.identity?.authKey) {
            return {
                accepted: false,
                mode: "unavailable",
                message: this.host
                    ? "Missing authKey. Run kichi_join first."
                    : "No Kichi host configured. Run kichi_switch_host first.",
            };
        }
        if (this.ws?.readyState === WebSocket.OPEN) {
            const sent = this.sendRejoinPayload();
            return {
                accepted: sent,
                mode: sent ? "sent" : "unavailable",
                message: sent ? "Rejoin payload sent." : "Unable to send rejoin payload.",
            };
        }
        if (this.ws?.readyState === WebSocket.CONNECTING) {
            return {
                accepted: true,
                mode: "waiting_open",
                message: "WebSocket is connecting. Rejoin will be sent automatically on open.",
            };
        }
        if (this.stopped) {
            return {
                accepted: false,
                mode: "unavailable",
                message: "Service is not running.",
            };
        }
        if (this.reconnectTimeout) {
            return {
                accepted: true,
                mode: "reconnecting",
                message: "WebSocket reconnect is already scheduled. Rejoin will be sent automatically on open.",
            };
        }
        return {
            accepted: false,
            mode: "unavailable",
            message: "WebSocket is not connected. Restart the gateway or wait for the scheduled reconnect.",
        };
    }
    getConnectionStatus() {
        const host = this.host ?? undefined;
        return {
            agentId: this.options.agentId,
            runtimeDir: this.getRuntimeDir(),
            statePath: this.getStatePath(),
            ...(host ? {
                host,
                wsUrl: this.getWsUrl(),
                identityPath: this.getIdentityPath(),
            } : {}),
            ...(this.environment ? { environment: this.environment } : {}),
            hostConfigured: !!host,
            connected: this.isConnected(),
            websocketState: this.getWebsocketState(),
            hasIdentity: !!this.identity?.avatarId,
            avatarId: this.identity?.avatarId,
            hasAuthKey: !!this.identity?.authKey,
            pendingRequestCount: this.pendingRequests.size,
            reconnectScheduled: !!this.reconnectTimeout,
        };
    }
    async leave() {
        if (!this.identity?.avatarId || !this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) {
            return { success: false, error: "Failed or not connected" };
        }
        return new Promise((resolve) => {
            const handler = (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === "leave_ack") {
                        this.ws?.off("message", handler);
                        const leaveAck = msg;
                        if (leaveAck.success === false) {
                            resolve(this.buildAckFailure(leaveAck, "Leave failed"));
                            return;
                        }
                        this.clearAuthKey();
                        resolve({ success: true });
                    }
                }
                catch (e) {
                    this.log("warn", `failed to parse leave response: ${e}`);
                }
            };
            this.ws.on("message", handler);
            this.ws.send(JSON.stringify({ type: "leave", avatarId: this.identity.avatarId, authKey: this.identity.authKey }));
            setTimeout(() => {
                this.ws?.off("message", handler);
                resolve({ success: false, error: "Timed out waiting for leave_ack" });
            }, 10000);
        });
    }
    connect(reason) {
        if (this.stopped || !this.host)
            return;
        if (this.ws?.readyState === WebSocket.CONNECTING || this.ws?.readyState === WebSocket.OPEN) {
            this.log("debug", `skipped websocket connect (${reason}) because socket is already ${this.getWebsocketState()}`);
            return;
        }
        this.clearReconnectTimeout();
        const wsUrl = this.getWsUrl();
        const ws = new WebSocket(wsUrl);
        this.ws = ws;
        this.log("debug", `opening websocket (${reason}) to ${wsUrl}`);
        ws.on("open", () => {
            if (this.ws !== ws)
                return;
            this.log("info", `connected to ${wsUrl} (${this.host})`);
            this.sendRejoinPayload();
        });
        ws.on("message", (data) => {
            if (this.ws !== ws)
                return;
            this.handleMessage(data.toString());
        });
        ws.on("close", () => {
            if (this.ws !== ws)
                return;
            this.ws = null;
            this.rejectPendingRequests("Kichi websocket closed");
            this.failPendingJoin("Kichi websocket closed");
            if (!this.stopped) {
                this.scheduleReconnect();
            }
        });
        ws.on("error", (error) => {
            if (this.ws !== ws)
                return;
            this.log("warn", `websocket error: ${error instanceof Error ? error.message : String(error)}`);
        });
    }
    handleMessage(data) {
        this.log("debug", `ws recv ${data}`);
        try {
            const msg = JSON.parse(data);
            this.tryResolvePendingRequest(msg);
            if (msg.type === "join_ack") {
                const joinAck = msg;
                if (joinAck.success === false || !joinAck.authKey) {
                    const failure = this.buildAckFailure(joinAck, "Join failed");
                    this.log("warn", `join failed: ${failure.error}`);
                    this.joinResolve?.(failure);
                    this.joinResolve = null;
                    this.clearJoinTimeout();
                    return;
                }
                if (this.identity) {
                    this.identity.authKey = joinAck.authKey;
                    this.saveIdentity();
                    this.updateSmsLastActiveAt();
                    this.log("info", `joined as ${this.identity.avatarId}`);
                }
                this.joinResolve?.({ success: true, authKey: joinAck.authKey });
                this.joinResolve = null;
                this.clearJoinTimeout();
            }
            else if (msg.type === "rejoin_failed" || msg.type === "auth_error") {
                this.log("warn", `auth failed: ${msg.reason || "unknown"}`);
                this.clearAuthKey();
            }
            else if (msg.type === "leave_ack") {
                const leaveAck = msg;
                if (leaveAck.success === false) {
                    const failure = this.buildAckFailure(leaveAck, "Leave failed");
                    this.log("warn", `leave failed: ${failure.error}`);
                }
                else {
                    this.log("info", "left Kichi world");
                }
            }
            else if (msg.type === "bot_message_received") {
                const payload = msg;
                this.log("info", `bot_message_received from=${payload.from} depth=${payload.depth} bubble="${payload.bubble}"`);
                this.onBotMessageReceived?.(this, payload);
            }
        }
        catch (e) {
            this.log("warn", `failed to parse message: ${e}`);
        }
    }
    buildAckFailure(msg, fallbackError) {
        const errorCode = typeof msg.errorCode === "string" && msg.errorCode.trim().length > 0 ? msg.errorCode : undefined;
        const errorMessage = typeof msg.errorMessage === "string" && msg.errorMessage.trim().length > 0
            ? msg.errorMessage
            : undefined;
        return {
            success: false,
            error: errorMessage ?? (errorCode ? `${fallbackError} (${errorCode})` : fallbackError),
            errorCode,
            errorMessage,
        };
    }
    tryResolvePendingRequest(msg) {
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        if (!requestId) {
            return;
        }
        const pending = this.pendingRequests.get(requestId);
        if (!pending) {
            return;
        }
        if (msg.type !== pending.expectedType) {
            pending.reject(new Error(`Unexpected response type for request ${requestId}: ${String(msg.type)} (expected ${pending.expectedType})`));
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(requestId);
            return;
        }
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
        pending.resolve(msg);
    }
    rejectPendingRequests(reason) {
        for (const [requestId, pending] of this.pendingRequests.entries()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(`${reason} (${requestId})`));
        }
        this.pendingRequests.clear();
    }
    requireIdentity() {
        if (!this.identity?.avatarId || !this.identity?.authKey) {
            return null;
        }
        return {
            avatarId: this.identity.avatarId,
            authKey: this.identity.authKey,
        };
    }
    sendRequest(payload, expectedType, timeoutMs = 10000) {
        if (this.ws?.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error("Kichi websocket is not connected"));
        }
        const requestId = payload.requestId?.trim() || randomUUID();
        const outboundPayload = { ...payload, requestId };
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Timed out waiting for ${expectedType}`));
            }, timeoutMs);
            this.pendingRequests.set(requestId, {
                expectedType,
                timeout,
                resolve: (value) => resolve(value),
                reject,
            });
            try {
                this.ws?.send(JSON.stringify(outboundPayload));
            }
            catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }
    loadIdentity() {
        if (!this.host) {
            return null;
        }
        try {
            const identityPath = this.getIdentityPath();
            if (!fs.existsSync(identityPath))
                return null;
            const data = JSON.parse(fs.readFileSync(identityPath, "utf-8"));
            const avatarId = typeof data.avatarId === "string" && data.avatarId ? data.avatarId : null;
            if (avatarId) {
                return {
                    avatarId,
                    authKey: typeof data.authKey === "string" ? data.authKey : undefined,
                };
            }
            return null;
        }
        catch (e) {
            this.log("warn", `failed to load identity: ${e}`);
            return null;
        }
    }
    saveIdentity() {
        if (!this.identity?.avatarId || !this.host)
            return;
        try {
            const identityDir = this.getIdentityDir();
            const identityPath = this.getIdentityPath();
            if (!fs.existsSync(identityDir))
                fs.mkdirSync(identityDir, { recursive: true, mode: 0o700 });
            fs.writeFileSync(identityPath, JSON.stringify(this.identity, null, 2), { mode: 0o600 });
        }
        catch (e) {
            this.log("error", `failed to save identity: ${e}`);
        }
    }
    clearAuthKey() {
        if (!this.identity)
            return;
        this.identity.authKey = undefined;
        this.saveIdentity();
        this.log("info", "authKey cleared");
    }
    sendRejoinPayload() {
        if (!this.identity?.avatarId || !this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) {
            return false;
        }
        this.ws.send(JSON.stringify({ type: "rejoin", avatarId: this.identity.avatarId, authKey: this.identity.authKey }));
        this.log("debug", `sent rejoin for ${this.identity.avatarId}`);
        return true;
    }
    getWebsocketState() {
        if (!this.ws) {
            return "idle";
        }
        if (this.ws.readyState === WebSocket.CONNECTING) {
            return "connecting";
        }
        if (this.ws.readyState === WebSocket.OPEN) {
            return "open";
        }
        if (this.ws.readyState === WebSocket.CLOSING) {
            return "closing";
        }
        return "closed";
    }
    getIdentityDir() {
        if (!this.host) {
            throw new Error("No Kichi host configured");
        }
        return path.join(this.options.runtimeDir, "hosts", encodeURIComponent(this.host));
    }
    getSmsStatePath() {
        return path.join(this.options.runtimeDir, SMS_STATE_FILE_NAME);
    }
    getKichiWorldRootDir() {
        return path.dirname(path.dirname(this.options.runtimeDir));
    }
    getWsUrl() {
        if (!this.host) {
            throw new Error("No Kichi host configured");
        }
        const isLocal = this.isPlainIpHost(this.host) || this.host === "localhost";
        const protocol = isLocal ? "ws" : "wss";
        const port = isLocal ? ":48870" : "";
        return `${protocol}://${this.host}${port}/ws/openclaw`;
    }
    isPlainIpHost(host) {
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
            || /^\[[0-9a-f:]+\]$/i.test(host)
            || /^[0-9a-f:]+$/i.test(host);
    }
    persistCurrentHost(host, environment) {
        const previousState = this.readStateFile();
        const testHost = environment === "test" ? host : (previousState?.testHost ?? undefined);
        const nextState = {
            ...(environment ? { currentEnvironment: environment } : {}),
            llmRuntimeEnabled: previousState?.llmRuntimeEnabled ?? DEFAULT_LLM_RUNTIME_ENABLED,
            ...(testHost ? { testHost } : {}),
        };
        fs.mkdirSync(this.options.runtimeDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(this.getStatePath(), JSON.stringify(nextState, null, 2), { mode: 0o600 });
    }
    updateSmsLastActiveAt() {
        try {
            const now = new Date();
            const previousState = this.readSmsStateFile();
            const nextState = {
                date: now.toISOString().slice(0, 10),
                totalSent: 0,
                windows: { morning: 0, afternoon: 0, evening: 0 },
                lastTypes: [],
                ...previousState,
                lastActiveAt: now.toISOString(),
            };
            fs.mkdirSync(this.options.runtimeDir, { recursive: true, mode: 0o700 });
            fs.writeFileSync(this.getSmsStatePath(), JSON.stringify(nextState, null, 2), { mode: 0o600 });
        }
        catch (e) {
            this.log("error", `failed to update sms state: ${e}`);
        }
    }
    readStateFile() {
        const statePath = this.getStatePath();
        if (!fs.existsSync(statePath)) {
            return null;
        }
        const data = JSON.parse(fs.readFileSync(statePath, "utf-8"));
        if (!data || typeof data !== "object") {
            throw new Error(`Invalid state payload in ${statePath}`);
        }
        return data;
    }
    readSmsStateFile() {
        const smsStatePath = this.getSmsStatePath();
        if (!fs.existsSync(smsStatePath)) {
            return null;
        }
        const data = JSON.parse(fs.readFileSync(smsStatePath, "utf-8"));
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error(`Invalid SMS state payload in ${smsStatePath}`);
        }
        return data;
    }
    clearReconnectTimeout() {
        if (!this.reconnectTimeout)
            return;
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
    }
    clearJoinTimeout() {
        if (!this.joinTimeout)
            return;
        clearTimeout(this.joinTimeout);
        this.joinTimeout = null;
    }
    scheduleReconnect() {
        if (this.reconnectTimeout || this.stopped) {
            return;
        }
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect("reconnect");
        }, 2000);
    }
    closeSocket() {
        const socket = this.ws;
        this.ws = null;
        socket?.removeAllListeners();
        socket?.close();
    }
    failPendingJoin(reason) {
        if (!this.joinResolve)
            return;
        this.joinResolve({ success: false, error: reason });
        this.joinResolve = null;
        this.clearJoinTimeout();
    }
    logPrefix() {
        return `[kichi:${this.options.agentId}]`;
    }
    log(level, message) {
        const formatted = `${this.logPrefix()} ${message}`;
        switch (level) {
            case "debug":
                this.logger.debug(formatted);
                return;
            case "info":
                this.logger.info(formatted);
                return;
            case "warn":
                this.logger.warn(formatted);
                return;
            case "error":
                this.logger.error(formatted);
                return;
        }
    }
}
