import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "node:crypto";
import type { Logger } from "openclaw/plugin-sdk";
import type {
  ActionPlayback,
  ClockAction,
  ClockConfig,
  ClockPayload,
  CreateMusicAlbumPayload,
  CreateNotesBoardNotePayload,
  HookNotifyPayload,
  HookNotifyType,
  IdlePlanContent,
  IdlePlanPayload,
  JoinAckPayload,
  JoinPayload,
  KichiConnectionStatus,
  KichiIdentity,
  KichiState,
  LeaveAckPayload,
  PoseType,
  QueryStatusPayload,
  QueryStatusResultPayload,
  StatusPayload,
} from "./types.js";

const MAX_NOTEBOARD_TEXT_LENGTH = 200;
const DEFAULT_LLM_RUNTIME_ENABLED = true;

type AckFailureResult = {
  success: false;
  error: string;
  errorCode?: string;
  errorMessage?: string;
};

export type JoinResult =
  | {
      success: true;
      authKey: string;
    }
  | AckFailureResult;

export type LeaveResult =
  | {
      success: true;
    }
  | AckFailureResult;

type KichiForwarderServiceOptions = {
  agentId: string;
  runtimeDir: string;
};

type ConnectReason = "startup" | "switch_host" | "reconnect";

export class KichiForwarderService {
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private joinTimeout: NodeJS.Timeout | null = null;
  private identity: KichiIdentity | null = null;
  private host: string | null = null;
  private joinResolve: ((result: JoinResult) => void) | null = null;
  private pendingRequests = new Map<
    string,
    {
      expectedType: string;
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(
    private logger: Logger,
    private options: KichiForwarderServiceOptions,
  ) {}

  start(): void {
    this.host = this.loadCurrentHost();
    this.identity = this.host ? this.loadIdentity() : null;
    this.stopped = false;
    if (this.host) {
      this.connect("startup");
      return;
    }
    this.log("debug", "host is not configured yet; waiting for kichi_switch_host");
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnectTimeout();
    this.rejectPendingRequests("Kichi websocket stopped");
    this.failPendingJoin("Kichi websocket stopped");
    this.closeSocket();
  }

  async switchHost(host: string): Promise<KichiConnectionStatus> {
    this.persistCurrentHost(host);
    this.host = host;
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

  async join(
    avatarId: string,
    botName: string,
    bio: string,
    tags: string[],
  ): Promise<JoinResult> {
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
      const payload: JoinPayload = { type: "join", avatarId, botName, bio, tags };
      const sendJoin = () => this.ws?.send(JSON.stringify(payload));
      if (this.ws?.readyState === WebSocket.OPEN) {
        sendJoin();
      } else {
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

  sendStatus(poseType: PoseType | "", action: string, bubble: string, log: string, playback: ActionPlayback): void {
    if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) return;
    const payload: StatusPayload = {
      type: "status",
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      poseType,
      action,
      bubble,
      log,
      playback,
    };
    this.ws.send(JSON.stringify(payload));
  }

  sendHookNotify(hookType: HookNotifyType, bubble: string): void {
    if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) return;
    const payload: HookNotifyPayload = {
      type: hookType,
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      bubble,
    };
    this.ws.send(JSON.stringify(payload));
  }

  sendIdlePlan(payload: IdlePlanContent): boolean {
    if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) return false;
    const outboundPayload: IdlePlanPayload = {
      type: "kichi_idle_plan",
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      ...payload,
    };
    this.ws.send(JSON.stringify(outboundPayload));
    return true;
  }

  sendClock(action: ClockAction, clock?: ClockConfig, requestId?: string): boolean {
    if (!this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) return false;
    if (action === "set" && !clock) return false;

    const basePayload = {
      type: "clock" as const,
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      ...(requestId ? { requestId } : {}),
    };

    const payload: ClockPayload =
      action === "set"
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

  async queryStatus(requestId?: string): Promise<QueryStatusResultPayload> {
    const identity = this.requireIdentity();
    if (!identity) {
      throw new Error("Missing Kichi identity");
    }

    const payload: QueryStatusPayload = {
      type: "query_status",
      requestId: requestId?.trim() || randomUUID(),
      avatarId: identity.avatarId,
      authKey: identity.authKey,
    };
    return this.sendRequest<QueryStatusResultPayload>(payload, "query_status_result");
  }

  createNotesBoardNote(propId: string, data: string): void {
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

    const payload: CreateNotesBoardNotePayload = {
      type: "create_notes_board_note",
      avatarId: identity.avatarId,
      authKey: identity.authKey,
      propId,
      data,
    };
    this.ws.send(JSON.stringify(payload));
  }

  createMusicAlbum(albumTitle: string, musicTitles: string[], requestId?: string): string {
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
    const payload: CreateMusicAlbumPayload = {
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

  isConnected(): boolean { return this.ws?.readyState === WebSocket.OPEN && !!this.identity?.authKey; }

  hasValidIdentity(): boolean { return !!this.identity?.avatarId && !!this.identity?.authKey; }

  isLlmRuntimeEnabled(): boolean {
    return this.readStateFile()?.llmRuntimeEnabled ?? DEFAULT_LLM_RUNTIME_ENABLED;
  }

  getCurrentHost(): string {
    return this.host ?? "";
  }

  getAgentId(): string {
    return this.options.agentId;
  }

  getRuntimeDir(): string {
    return this.options.runtimeDir;
  }

  getStatePath(): string {
    return path.join(this.options.runtimeDir, "state.json");
  }

  getIdentityPath(): string {
    if (!this.host) {
      return "";
    }
    return path.join(this.getIdentityDir(), "identity.json");
  }

  readSavedAvatarId(): string | null {
    if (!this.host) {
      return null;
    }
    return this.loadIdentity()?.avatarId ?? null;
  }

  requestRejoin(): { accepted: boolean; mode: "sent" | "waiting_open" | "reconnecting" | "unavailable"; message: string } {
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

  getConnectionStatus(): KichiConnectionStatus {
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

  async leave(): Promise<LeaveResult> {
    if (!this.identity?.avatarId || !this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) {
      return { success: false, error: "Failed or not connected" };
    }

    return new Promise((resolve) => {
      const handler = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "leave_ack") {
            this.ws?.off("message", handler);
            const leaveAck = msg as LeaveAckPayload;
            if (leaveAck.success === false) {
              resolve(this.buildAckFailure(leaveAck, "Leave failed"));
              return;
            }
            this.clearAuthKey();
            resolve({ success: true });
          }
        } catch (e) {
          this.log("warn", `failed to parse leave response: ${e}`);
        }
      };
      this.ws!.on("message", handler);
      this.ws!.send(
        JSON.stringify({ type: "leave", avatarId: this.identity!.avatarId, authKey: this.identity!.authKey }),
      );
      setTimeout(() => {
        this.ws?.off("message", handler);
        resolve({ success: false, error: "Timed out waiting for leave_ack" });
      }, 10000);
    });
  }

  private connect(reason: ConnectReason): void {
    if (this.stopped || !this.host) return;
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
      if (this.ws !== ws) return;
      this.log("info", `connected to ${wsUrl} (${this.host})`);
      this.sendRejoinPayload();
    });

    ws.on("message", (data) => {
      if (this.ws !== ws) return;
      this.handleMessage(data.toString());
    });

    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.rejectPendingRequests("Kichi websocket closed");
      this.failPendingJoin("Kichi websocket closed");
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    ws.on("error", (error) => {
      if (this.ws !== ws) return;
      this.log("warn", `websocket error: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private handleMessage(data: string): void {
    this.log("debug", `ws recv ${data}`);
    try {
      const msg = JSON.parse(data);
      this.tryResolvePendingRequest(msg);
      if (msg.type === "join_ack") {
        const joinAck = msg as JoinAckPayload;
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
          this.log("info", `joined as ${this.identity.avatarId}`);
        }
        this.joinResolve?.({ success: true, authKey: joinAck.authKey });
        this.joinResolve = null;
        this.clearJoinTimeout();
      } else if (msg.type === "rejoin_failed" || msg.type === "auth_error") {
        this.log("warn", `auth failed: ${msg.reason || "unknown"}`);
        this.clearAuthKey();
      } else if (msg.type === "leave_ack") {
        const leaveAck = msg as LeaveAckPayload;
        if (leaveAck.success === false) {
          const failure = this.buildAckFailure(leaveAck, "Leave failed");
          this.log("warn", `leave failed: ${failure.error}`);
        } else {
          this.log("info", "left Kichi world");
        }
      }
    } catch (e) {
      this.log("warn", `failed to parse message: ${e}`);
    }
  }

  private buildAckFailure(
    msg: { errorCode?: unknown; errorMessage?: unknown },
    fallbackError: string,
  ): AckFailureResult {
    const errorCode =
      typeof msg.errorCode === "string" && msg.errorCode.trim().length > 0 ? msg.errorCode : undefined;
    const errorMessage =
      typeof msg.errorMessage === "string" && msg.errorMessage.trim().length > 0
        ? msg.errorMessage
        : undefined;

    return {
      success: false,
      error: errorMessage ?? (errorCode ? `${fallbackError} (${errorCode})` : fallbackError),
      errorCode,
      errorMessage,
    };
  }

  private tryResolvePendingRequest(msg: { type?: unknown; requestId?: unknown }): void {
    const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
    if (!requestId) {
      return;
    }
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    if (msg.type !== pending.expectedType) {
      pending.reject(
        new Error(
          `Unexpected response type for request ${requestId}: ${String(msg.type)} (expected ${pending.expectedType})`,
        ),
      );
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    pending.resolve(msg);
  }

  private rejectPendingRequests(reason: string): void {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${reason} (${requestId})`));
    }
    this.pendingRequests.clear();
  }

  private requireIdentity(): { avatarId: string; authKey: string } | null {
    if (!this.identity?.avatarId || !this.identity?.authKey) {
      return null;
    }
    return {
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
    };
  }

  private sendRequest<TResponse extends { type?: unknown; requestId?: unknown }>(
    payload: { type: string; requestId?: string },
    expectedType: string,
    timeoutMs = 10000,
  ): Promise<TResponse> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Kichi websocket is not connected"));
    }

    const requestId = payload.requestId?.trim() || randomUUID();
    const outboundPayload = { ...payload, requestId };

    return new Promise<TResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Timed out waiting for ${expectedType}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        expectedType,
        timeout,
        resolve: (value) => resolve(value as TResponse),
        reject,
      });

      try {
        this.ws?.send(JSON.stringify(outboundPayload));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private loadIdentity(): KichiIdentity | null {
    if (!this.host) {
      return null;
    }
    try {
      const identityPath = this.getIdentityPath();
      if (!fs.existsSync(identityPath)) return null;
      const data = JSON.parse(fs.readFileSync(identityPath, "utf-8"));
      const avatarId = typeof data.avatarId === "string" && data.avatarId ? data.avatarId : null;
      if (avatarId) {
        return {
          avatarId,
          authKey: typeof data.authKey === "string" ? data.authKey : undefined,
        };
      }
      return null;
    } catch (e) {
      this.log("warn", `failed to load identity: ${e}`);
      return null;
    }
  }

  private saveIdentity(): void {
    if (!this.identity?.avatarId || !this.host) return;
    try {
      const identityDir = this.getIdentityDir();
      const identityPath = this.getIdentityPath();
      if (!fs.existsSync(identityDir)) fs.mkdirSync(identityDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(identityPath, JSON.stringify(this.identity, null, 2), { mode: 0o600 });
    } catch (e) {
      this.log("error", `failed to save identity: ${e}`);
    }
  }

  private clearAuthKey(): void {
    if (!this.identity) return;
    this.identity.authKey = undefined;
    this.saveIdentity();
    this.log("info", "authKey cleared");
  }

  private sendRejoinPayload(): boolean {
    if (!this.identity?.avatarId || !this.identity?.authKey || this.ws?.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.ws.send(
      JSON.stringify({ type: "rejoin", avatarId: this.identity.avatarId, authKey: this.identity.authKey }),
    );
    this.log("debug", `sent rejoin for ${this.identity.avatarId}`);
    return true;
  }

  private getWebsocketState(): KichiConnectionStatus["websocketState"] {
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

  private getIdentityDir(): string {
    if (!this.host) {
      throw new Error("No Kichi host configured");
    }
    return path.join(this.options.runtimeDir, "hosts", encodeURIComponent(this.host));
  }

  private getWsUrl(): string {
    if (!this.host) {
      throw new Error("No Kichi host configured");
    }
    const protocol = this.isPlainIpHost(this.host) || this.host === "localhost" ? "ws" : "wss";
    return `${protocol}://${this.host}:48870/ws/openclaw`;
  }

  private isPlainIpHost(host: string): boolean {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
      || /^\[[0-9a-f:]+\]$/i.test(host)
      || /^[0-9a-f:]+$/i.test(host);
  }

  private loadCurrentHost(): string | null {
    try {
      const statePath = this.getStatePath();
      if (!fs.existsSync(statePath)) {
        return null;
      }
      const data = JSON.parse(fs.readFileSync(statePath, "utf-8")) as { currentHost?: unknown };
      if (typeof data.currentHost === "string" && data.currentHost.trim()) {
        return data.currentHost;
      }
      throw new Error(`Invalid currentHost value in ${statePath}`);
    } catch (error) {
      throw new Error(`Failed to load current host: ${error}`);
    }
  }

  private persistCurrentHost(host: string): void {
    const previousState = this.readStateFile();
    const nextState: KichiState = {
      currentHost: host,
      llmRuntimeEnabled: previousState?.llmRuntimeEnabled ?? DEFAULT_LLM_RUNTIME_ENABLED,
    };
    fs.mkdirSync(this.options.runtimeDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.getStatePath(), JSON.stringify(nextState, null, 2), { mode: 0o600 });
  }

  private readStateFile(): Partial<KichiState> | null {
    const statePath = this.getStatePath();
    if (!fs.existsSync(statePath)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(statePath, "utf-8")) as unknown;
    if (!data || typeof data !== "object") {
      throw new Error(`Invalid state payload in ${statePath}`);
    }
    return data as Partial<KichiState>;
  }

  private clearReconnectTimeout(): void {
    if (!this.reconnectTimeout) return;
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = null;
  }

  private clearJoinTimeout(): void {
    if (!this.joinTimeout) return;
    clearTimeout(this.joinTimeout);
    this.joinTimeout = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout || this.stopped) {
      return;
    }
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect("reconnect");
    }, 2000);
  }

  private closeSocket(): void {
    const socket = this.ws;
    this.ws = null;
    socket?.removeAllListeners();
    socket?.close();
  }

  private failPendingJoin(reason: string): void {
    if (!this.joinResolve) return;
    this.joinResolve({ success: false, error: reason });
    this.joinResolve = null;
    this.clearJoinTimeout();
  }

  private logPrefix(): string {
    return `[kichi:${this.options.agentId}]`;
  }

  private log(level: "debug" | "info" | "warn" | "error", message: string): void {
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
