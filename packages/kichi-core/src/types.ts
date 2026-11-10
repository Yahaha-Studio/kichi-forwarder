export type KichiLogger = {
  debug?(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type PoseType = "stand" | "sit" | "lay" | "floor";
export type ActionPlaybackMode = "loop" | "once";
export type AvatarStatus = "Idle" | "Busy" | "Activities" | "Break";
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
  avatarStatus: AvatarStatus;
  log?: string;
  propId?: string;
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

export type KichiEnvironment = "steam" | "steam-playtest" | "test";

export type KichiEnvironmentsConfig = Record<KichiEnvironment, string | null>;

export type KichiState = {
  currentEnvironment?: KichiEnvironment;
  llmRuntimeEnabled: boolean;
  testHost?: string;
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
  environment?: KichiEnvironment;
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
  source: string;
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
  avatarStatus: AvatarStatus;
  propId?: string;
};

export type StatusAckPayload = {
  type: "status_ack";
  requestId: string;
  poseType: PoseType | "";
  action: string;
  requestedPropId?: string;
  warning?: string;
};

export type GlanceTarget = "camera";

export type GlancePayload = {
  type: "kichi_glance";
  requestId: string;
  avatarId: string;
  authKey: string;
  target: GlanceTarget;
  duration: number;
};

export type GlanceAckPayload = {
  type: "kichi_glance_ack";
  requestId: string;
  target: GlanceTarget;
};

export const KICHI_EMOJI_NAMES = [
  "Heart",
  "Like",
  "Happy",
  "Celebrate",
  "Keep Going",
  "Peeking",
  "Laughing",
  "Sleeping",
  "Coffee",
  "Waving",
] as const;

export type KichiEmojiName = typeof KICHI_EMOJI_NAMES[number];

export type EmojiPayload = {
  type: "kichi_emoji";
  requestId: string;
  avatarId: string;
  authKey: string;
  emojiName: KichiEmojiName;
};

export type EmojiAckPayload = {
  type: "kichi_emoji_ack";
  requestId: string;
} & (
  | { success: true; emojiName: KichiEmojiName }
  | { success: false; errorCode: string; errorMessage: string }
);

export const ENVIRONMENT_WEATHERS = ["Sunny", "Cloudy", "Rainy", "Snowy"] as const;
export const ENVIRONMENT_TIMES = ["Auto", "Morning", "Day", "Evening", "Night"] as const;
export const MUSIC_ACTIONS = ["Next", "Previous"] as const;
export const MUSIC_PLAY_TYPES = ["Loop", "Random"] as const;
export const SOUND_VOLUME_TYPES = ["Global", "Music", "AmbientSound", "UISound", "SceneSound"] as const;
export const AMBIENT_SOUND_ACTIONS = ["Play", "Stop"] as const;
// Keep these titles aligned with FocusProject's AgentWorldCatalog.AmbientSounds.
export const AMBIENT_SOUND_TITLES = [
  "Birds", "Forest", "Frog", "Cicadas", "Insects", "Breeze", "Wind",
  "Light Rain", "Heavy Rain", "Rain with Thunder", "Waves", "River",
  "Traffic", "Cosmos", "Campfire", "Wind Chime", "Clock",
  "White Noise", "Pink Noise", "Airplane", "Waterfall", "Fan",
  "Train", "Steps on Snow",
] as const;

export type EnvironmentWeather = typeof ENVIRONMENT_WEATHERS[number];
export type EnvironmentTime = typeof ENVIRONMENT_TIMES[number];
export type MusicAction = typeof MUSIC_ACTIONS[number];
export type MusicPlayType = typeof MUSIC_PLAY_TYPES[number];
export type AmbientSoundOperation = {
  title: typeof AMBIENT_SOUND_TITLES[number];
  action: typeof AMBIENT_SOUND_ACTIONS[number];
};
export type SoundVolumeControl = {
  type: typeof SOUND_VOLUME_TYPES[number];
  mute?: boolean;
  /** Absolute volume on a 0 to 1 scale. Incompatible with delta. */
  volume?: number;
  /** Signed change on the same scale. Incompatible with volume. */
  delta?: number;
};

export type EnvironmentControl = {
  weather?: EnvironmentWeather;
  time?: EnvironmentTime;
  /** House light intensity, from 0.1 to 2. Use lightingEnabled to turn lights off. */
  lightingValue?: number;
  lightingEnabled?: boolean;
  /** Scene ambient light intensity, from 0.5 to 3. */
  ambientLightIntensity?: number;
  ambientLightEnabled?: boolean;
  /** Select music by exact album and/or track name; incompatible with musicPaused and musicAction. */
  musicAlbumTitle?: string;
  musicTitle?: string;
  /** Pause (true) or resume (false) the current music. */
  musicPaused?: boolean;
  /** Select the next or previous track in the current music album. */
  musicAction?: MusicAction;
  /** Select sequential (Loop) or random track playback. */
  musicPlayType?: MusicPlayType;
  /** Apply operations in order, with the last operation for each title taking effect. */
  ambientSoundOperations?: AmbientSoundOperation[];
  /** Requires ambientSoundOperations. True keeps only sounds whose final operation is Play. */
  ambientSoundOverwrite?: boolean;
  /** Non-empty array. The last entry for each sound type replaces all earlier entries of that type. */
  volumeControls?: SoundVolumeControl[];
};

export type EnvironmentControlPayload = {
  type: "kichi_environment";
  requestId: string;
  avatarId: string;
  authKey: string;
  environment: EnvironmentControl;
};

export type EnvironmentControlAckPayload = {
  type: "kichi_environment_ack";
  requestId: string;
} & (
  | { success: true; environment: EnvironmentControl }
  | { success: false; errorCode: string; errorMessage: string }
);

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
  log: string;
  propId?: string;
};

export type IdlePlanStage = {
  name: string;
  purpose: string;
  pomodoroPhase: IdlePlanPhase;
  avatarStatus?: AvatarStatus;
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

export type MateDailySchedulePlace =
  | { type: "home" }
  | { type: "kichi_room" }
  | { type: "real_world"; name: string };

export type MateDailyScheduleSlot = {
  h: number;
  place: MateDailySchedulePlace;
  act: string;
  mood: string;
  sleep: boolean;
};

export type MateDailySchedule = {
  date: string;
  timezone: string;
  activeArcs: string[];
  slots: MateDailyScheduleSlot[];
};

export type SyncMateDailySchedulePayload = {
  type: "kichi_sync_mate_daily_schedule";
  avatarId: string;
  authKey: string;
  schedule: MateDailySchedule;
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

export type TimerSnapshot =
  | {
      timerType: "Pomodoro";
      focusTime: number;
      shortBreakTime: number;
      longBreakTime: number;
      sessionCount: number;
    }
  | { timerType: "CountDown"; totalTime: number }
  | { timerType: "CountUp" };

/** Controls the owning player's timer, independently of the agent avatar clock. */
export type TimerControl =
  | {
      action: "Start";
      /** Omit to resume an unfinished timer or use the player's current panel settings. */
      snapshot?: TimerSnapshot;
      /** Only valid with a new snapshot; omission preserves the panel's focus tag. */
      focusTag?: string;
    }
  | { action: "Pause" | "Stop" };

export type TimerControlPayload = {
  type: "kichi_timer";
  requestId: string;
  avatarId: string;
  authKey: string;
  timer: TimerControl;
};

export type TimerControlAckPayload = {
  type: "kichi_timer_ack";
  requestId: string;
} & (
  | {
      success: true;
      timer: {
        action: TimerControl["action"];
        snapshot: {
          timerType: TimerSnapshot["timerType"];
          focusTime: number | null;
          shortBreakTime: number | null;
          longBreakTime: number | null;
          sessionCount: number | null;
          totalTime: number | null;
        } | null;
        focusTag: string | null;
      };
    }
  | { success: false; errorCode: string; errorMessage: string }
);

export type QueryStatusPayload = {
  type: "query_status";
  requestId: string;
  avatarId: string;
  authKey: string;
};

export type QueryStatusResultPayload = {
  type: "query_status_result";
  requestId: string;
  isAvatarInScene: boolean;
  dailyLimit: number;
  remaining: number;
  hasCreatedMusicAlbumToday?: boolean;
  errorCode: string;
  errorMessage: string;
  notes: QueryStatusNote[];
  currentUserActivity?: QueryStatusCurrentUserActivity | null;
  timer?: Record<string, unknown> | null;
  idlePlan?: IdlePlanContent | null;
  /** All other server fields (timer, environmentWeather, etc.) are passed through to the LLM as-is. */
  [key: string]: unknown;
};

export type QueryStatusCurrentUserActivity = {
  poseType?: string;
  action?: string;
  interactingItemName?: string;
  desktopAppName?: string;
};

export type QueryStatusNote = {
  propId: string;
  authorName: string;
  isCreatedByCurrentAgent: boolean;
  isFromCurrentUser: boolean;
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

export type BotMessageHistoryEntry = {
  from: string;
  fromName: string;
  bubble: string;
};

export type BotMessageTranscriptEntry = {
  id: string;
  requestId?: string;
  at: string;
  direction: "sent" | "received";
  from: string;
  fromName?: string;
  to?: string;
  toName?: string;
  depth: number;
  bubble: string;
};

export type BotMessageTranscriptStore = {
  version: 1;
  entries: BotMessageTranscriptEntry[];
};

export type BotMessagePayload = {
  type: "bot_message";
  avatarId: string;
  authKey: string;
  requestId: string;
  toAvatarId: string;
  depth: number;
  poseType?: PoseType;
  action?: string;
  playback?: ActionPlayback;
  bubble: string;
  log?: string;
  history?: BotMessageHistoryEntry[];
};

export type BotMessageReceivedPayload = {
  type: "bot_message_received";
  from: string;
  fromName: string;
  depth: number;
  bubble: string;
  history?: BotMessageHistoryEntry[];
};

export type CommandErrorPayload = {
  type: "command_error";
  requestId: string;
  errorCode: string;
  errorMessage: string;
};

export type TodoTask = {
  id: string;
  ownerId: string;
  createTime: string;
  updateTime: string;
  title: string;
  deadline: string | null;
  colorIndex: number;
  sortOrder: number;
};

export type Routine = {
  id: string;
  ownerId: string;
  createTime: string;
  updateTime: string;
  title: string;
  /** UTC timestamps returned by the server. Date inputs use yyyy-MM-dd instead. */
  checkedDates: string[];
  sortOrder: number;
};

export type TodoTaskCreateInput = {
  title: string;
  colorIndex: number;
  deadline?: string | null;
};

/** Updates replace the task state; an omitted or null deadline clears it. */
export type TodoTaskUpdateInput = TodoTaskCreateInput & {
  id: string;
};

export type TodoTaskReorderInput = {
  tasks: { id: string; sortOrder: number }[];
};

export type TodoTaskDeleteInput = {
  id: string;
};

export type TodoTaskCompleteInput = {
  id: string;
};

export type RoutineCreateInput = {
  title: string;
  /** Local calendar dates in yyyy-MM-dd format. */
  checkedDates?: string[];
  /** Required when checkedDates contains dates. */
  timeZoneId?: string;
};

export type RoutineDeleteInput = {
  id: string;
};

export type RoutineUpdate = {
  id: string;
  isNew?: boolean;
  isDeleted?: boolean;
  title?: string | null;
  sortOrder?: number | null;
  /** Required, including when no dates are added. Uses yyyy-MM-dd. */
  datesToAdd: string[];
  /** Required, including when no dates are removed. Uses yyyy-MM-dd. */
  datesToRemove: string[];
};

export type RoutineBatchUpdateInput = {
  updates: RoutineUpdate[];
  /** Required when any update adds or removes dates. */
  timeZoneId?: string;
};

export const DIARY_MOODS = ["Happy", "Adore", "Amaze", "Bored", "Upset", "Mad"] as const;
export type DiaryMood = typeof DIARY_MOODS[number];

export type Diary = {
  id: string;
  ownerId: string;
  createTime: string;
  updateTime: string;
  title: string;
  content: string;
  mood: DiaryMood;
};

export type DiaryListInput = {
  /** Zero-based offset, defaults to 0. Ignored when a cursor is supplied. */
  start?: number;
  /** Page size, defaults to 20; maximum 200. */
  count?: number;
  /** Exact createTime from the previous page's last diary; requires cursorId. */
  cursorCreateTime?: string;
  cursorId?: string;
};

export type DiaryGetInput = { id: string };

export type DiaryCreateInput = {
  /** Up to 20 UTF-16 code units; empty strings are allowed and whitespace is preserved. */
  title: string;
  /** Up to 1000 UTF-16 code units; empty strings are allowed and whitespace is preserved. */
  content: string;
  mood: DiaryMood;
};

/** Updates replace all three editable fields; preserve values that should not change. */
export type DiaryUpdateInput = DiaryCreateInput & { id: string };
export type DiaryDeleteInput = { id: string };

type ServerDataRequestIdentity = {
  requestId: string;
  avatarId: string;
  authKey: string;
};

export type TodoTaskListPayload = ServerDataRequestIdentity & { type: "todo_task_list" };
export type TodoTaskCreatePayload = ServerDataRequestIdentity & TodoTaskCreateInput & { type: "todo_task_create" };
export type TodoTaskUpdatePayload = ServerDataRequestIdentity & TodoTaskUpdateInput & { type: "todo_task_update" };
export type TodoTaskReorderPayload = ServerDataRequestIdentity & TodoTaskReorderInput & { type: "todo_task_reorder" };
export type TodoTaskDeletePayload = ServerDataRequestIdentity & TodoTaskDeleteInput & { type: "todo_task_delete" };
export type TodoTaskCompletePayload = ServerDataRequestIdentity & TodoTaskCompleteInput & { type: "todo_task_complete" };
export type RoutineListPayload = ServerDataRequestIdentity & { type: "routine_list" };
export type RoutineCreatePayload = ServerDataRequestIdentity & RoutineCreateInput & { type: "routine_create" };
export type RoutineDeletePayload = ServerDataRequestIdentity & RoutineDeleteInput & { type: "routine_delete" };
export type RoutineBatchUpdatePayload = ServerDataRequestIdentity & RoutineBatchUpdateInput & { type: "routine_batch_update" };
export type DiaryListPayload = ServerDataRequestIdentity & DiaryListInput & { type: "diary_list" };
export type DiaryGetPayload = ServerDataRequestIdentity & DiaryGetInput & { type: "diary_get" };
export type DiaryCreatePayload = ServerDataRequestIdentity & DiaryCreateInput & { type: "diary_create" };
export type DiaryUpdatePayload = ServerDataRequestIdentity & DiaryUpdateInput & { type: "diary_update" };
export type DiaryDeletePayload = ServerDataRequestIdentity & DiaryDeleteInput & { type: "diary_delete" };

export type DiaryRequestPayload =
  | DiaryListPayload
  | DiaryGetPayload
  | DiaryCreatePayload
  | DiaryUpdatePayload
  | DiaryDeletePayload;

export type TaskRoutineRequestPayload =
  | TodoTaskListPayload
  | TodoTaskCreatePayload
  | TodoTaskUpdatePayload
  | TodoTaskReorderPayload
  | TodoTaskDeletePayload
  | TodoTaskCompletePayload
  | RoutineListPayload
  | RoutineCreatePayload
  | RoutineDeletePayload
  | RoutineBatchUpdatePayload;

type ServerDataAckPayload<TType extends string, TResult extends object> = {
  type: TType;
  requestId: string;
  success: true;
} & TResult;

type ServerDataMutationResult = {
  /** Whether the server sent a refresh notification, not confirmation of client application. */
  clientRefreshNotified: boolean;
};

export type TodoTaskListAckPayload = ServerDataAckPayload<"todo_task_list_ack", { todoTasks: TodoTask[] }>;
export type TodoTaskCreateAckPayload = ServerDataAckPayload<"todo_task_create_ack", ServerDataMutationResult & { todoTask: TodoTask }>;
export type TodoTaskUpdateAckPayload = ServerDataAckPayload<"todo_task_update_ack", ServerDataMutationResult & { todoTask: TodoTask }>;
export type TodoTaskReorderAckPayload = ServerDataAckPayload<"todo_task_reorder_ack", ServerDataMutationResult>;
export type TodoTaskDeleteAckPayload = ServerDataAckPayload<"todo_task_delete_ack", ServerDataMutationResult>;
export type TodoTaskCompleteAckPayload = ServerDataAckPayload<"todo_task_complete_ack", ServerDataMutationResult>;
export type RoutineListAckPayload = ServerDataAckPayload<"routine_list_ack", { routines: Routine[] }>;
export type RoutineCreateAckPayload = ServerDataAckPayload<"routine_create_ack", ServerDataMutationResult & { routine: Routine }>;
export type RoutineDeleteAckPayload = ServerDataAckPayload<"routine_delete_ack", ServerDataMutationResult>;
export type RoutineBatchUpdateAckPayload = ServerDataAckPayload<"routine_batch_update_ack", ServerDataMutationResult>;
export type DiaryListAckPayload = ServerDataAckPayload<"diary_list_ack", { diaries: Diary[]; total: number }>;
export type DiaryGetAckPayload = ServerDataAckPayload<"diary_get_ack", { diary: Diary }>;
export type DiaryCreateAckPayload = ServerDataAckPayload<"diary_create_ack", ServerDataMutationResult & { diary: Diary }>;
export type DiaryUpdateAckPayload = ServerDataAckPayload<"diary_update_ack", ServerDataMutationResult & { diary: Diary }>;
export type DiaryDeleteAckPayload = ServerDataAckPayload<"diary_delete_ack", ServerDataMutationResult>;
