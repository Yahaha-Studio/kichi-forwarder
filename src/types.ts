export type KichiForwarderConfig = Record<string, never>;

export type PoseType = "stand" | "sit" | "lay" | "floor";
export type ActionPlaybackMode = "loop" | "once";
export type ActionPlayback = {
  mode: ActionPlaybackMode;
  resumeAction?: string;
};
export type ActionDefinition = {
  name: string;
  playback: ActionPlaybackMode;
  resumeAction?: string;
};

export type ActionResult = {
  poseType: PoseType;
  action: string;
  bubble: string;
  log?: string;
};

export type KichiStaticConfig = {
  actions: Record<PoseType, ActionDefinition[]>;
  album: Album;
};

export type Track = {
  album: string;
  name: string;
  tags: string[];
};

export type Album = {
  albumCount: number;
  trackCount: number;
  track: Track[];
};

export type KichiState = {
  currentHost?: string;
  llmRuntimeEnabled: boolean;
};

export type KichiIdentity = {
  avatarId: string;
  authKey?: string;
};

export type KichiConnectionStatus = {
  agentId?: string;
  runtimeDir?: string;
  statePath?: string;
  host?: string;
  wsUrl?: string;
  identityPath?: string;
  hostConfigured: boolean;
  connected: boolean;
  websocketState: "idle" | "connecting" | "open" | "closing" | "closed";
  hasIdentity: boolean;
  avatarId?: string;
  hasAuthKey: boolean;
  pendingRequestCount: number;
  reconnectScheduled: boolean;
};

export type KichiErrorResult = {
  success: false;
  errorCode?: string;
  error?: string;
  message?: string;
  dailyLimit?: number;
  remaining?: number;
  resetAtUtc?: string;
};

export type JoinPayload = {
  type: "join";
  avatarId: string;
  botName: string;
  bio: string;
  tags: string[];
};

export type JoinAckPayload = {
  type: "join_ack";
  authKey?: string;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export type LeaveAckPayload = {
  type: "leave_ack";
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export type LeavePayload = {
  type: "leave";
  avatarId: string;
  authKey: string;
};

export type StatusPayload = {
  type: "status";
  requestId?: string;
  avatarId: string;
  authKey: string;
  poseType: PoseType | "";
  action: string;
  bubble: string;
  log: string;
  playback: ActionPlayback;
};

export type StatusAckPayload = {
  type: "status_ack";
  requestId: string;
  poseType: PoseType | "";
  action: string;
  warning?: string;
};

export type HookNotifyType = "message_received" | "before_send_message";

export type HookNotifyPayload = {
  type: HookNotifyType;
  avatarId: string;
  authKey: string;
  bubble: string;
};

export type IdlePlanPhase = "focus" | "shortBreak" | "longBreak" | "none";

export type IdlePlanStageAction = {
  poseType: PoseType;
  action: string;
  durationSeconds: number;
  bubble: string;
  log?: string;
};

export type IdlePlanStage = {
  name: string;
  purpose: string;
  pomodoroPhase: IdlePlanPhase;
  durationSeconds: number;
  actions: IdlePlanStageAction[];
};

export type IdlePlanContent = {
  requestId?: string;
  heartbeatIntervalSeconds: number;
  goal: string;
  stages: IdlePlanStage[];
};

export type IdlePlanPayload = IdlePlanContent & {
  type: "kichi_idle_plan";
  avatarId: string;
  authKey: string;
};

export type ClockAction = "set" | "stop";

export type ClockMode = "pomodoro" | "countDown" | "countUp";

export type PomodoroPhase = "focus" | "shortBreak" | "longBreak";

export type PomodoroClock = {
  mode: "pomodoro";
  running: boolean;
  kichiSeconds: number;
  shortBreakSeconds: number;
  longBreakSeconds: number;
  sessionCount: number;
  currentSession: number;
  phase: PomodoroPhase;
  remainingSeconds: number;
};

export type CountDownClock = {
  mode: "countDown";
  running: boolean;
  durationSeconds: number;
  remainingSeconds: number;
};

export type CountUpClock = {
  mode: "countUp";
  running: boolean;
  elapsedSeconds: number;
};

export type ClockConfig = PomodoroClock | CountDownClock | CountUpClock;

type ClockPayloadBase = {
  type: "clock";
  avatarId: string;
  authKey: string;
  requestId?: string;
};

export type ClockSetPayload = ClockPayloadBase & {
  action: "set";
  clock: ClockConfig;
};

export type ClockControlPayload = ClockPayloadBase & {
  action: Exclude<ClockAction, "set">;
};

export type ClockPayload = ClockSetPayload | ClockControlPayload;

export type QueryStatusPayload = {
  type: "query_status";
  requestId: string;
  avatarId: string;
  authKey: string;
};

export type QueryStatusResultPayload = {
  type: "query_status_result";
  requestId: string;
  dailyLimit: number;
  remaining: number;
  hasCreatedMusicAlbumToday?: boolean;
  errorCode: string;
  errorMessage: string;
  notes: QueryStatusNote[];
  ownerState?: QueryStatusOwnerState | null;
  timer?: Record<string, unknown> | null;
  idlePlan?: IdlePlanContent | null;
  /** All other server fields (timer, environmentWeather, etc.) are passed through to the LLM as-is. */
  [key: string]: unknown;
};

export type QueryStatusOwnerState = {
  poseType?: string;
  action?: string;
  interactingItemName?: string;
  desktopActivityCategory?: string;
  desktopAppName?: string;
  desktopSummary?: string;
};

export type QueryStatusNote = {
  propId: string;
  authorName: string;
  isCreatedByCurrentAgent: boolean;
  isFromOwner: boolean;
  createdAtUtc: string;
  content: string;
};

export type CreateNotesBoardNotePayload = {
  type: "create_notes_board_note";
  avatarId: string;
  authKey: string;
  propId: string;
  data: string;
};

export type CreateMusicAlbumPayload = {
  type: "create_music_album";
  requestId: string;
  avatarId: string;
  authKey: string;
  albumTitle: string;
  musicTitles: string[];
};
