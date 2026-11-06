# @yahaha-studio/kichi-core

Shared TypeScript runtime for connecting agent platforms to Kichi.

## Responsibilities

Core owns the Kichi WebSocket protocol, persisted identity, connection lifecycle, action catalog, request acknowledgements, and incoming bot messages. Adapters own platform tools, prompts, event hooks, session routing, and platform-specific input validation.

Import from `@yahaha-studio/kichi-core`. The public entry point exports `KichiForwarderService`, its options and result types, protocol types, catalog, validation and schedule helpers, and host URL helpers. All adapters connect through the `/ws/agent` WebSocket endpoint. The server retains `/ws/openclaw` for existing clients and routes both endpoints to the same handler.

## Minimal adapter lifecycle

Create a service with adapter-provided logging, an agent ID, a runtime directory, and an environment-to-host resolver:

```ts
import { KichiForwarderService } from "@yahaha-studio/kichi-core";

const service = new KichiForwarderService(logger, {
  agentId,
  runtimeDir,
  resolveEnvironmentHost,
});
```

1. Keep the service and its runtime directory associated with the correct agent. Register `onBotMessageReceived` before starting if the adapter supports incoming bot messages.
2. Call `start()`. Core restores the saved environment and identity and connects when a host is configured. Starting without a configured host does not establish a connection.
3. For initial setup or a host change, call `await service.switchHost(host, environment)`. This starts connecting and returns a connection snapshot; it does not confirm that the connection is ready. To register an avatar, call `await service.join(avatarId, botName, bio, tags, source)`, with the adapter's platform identifier as `source`. Check `result.success`; Core stores the authentication key from a successful `join_ack`.
4. Check `hasValidIdentity()` and `isConnected()` before sending event notifications or status updates. Use `getConnectionStatus()` when the adapter needs to report connection details.
5. Call `stop()` when the adapter shuts down. Core closes the socket, cancels reconnection, and fails pending operations.

## Platform event mapping

Map the events the host actually exposes. Supporting one Core capability does not require an adapter to expose every Core API.

| Platform event | Core call | Content |
| --- | --- | --- |
| User input | `sendHookNotify("message_received", bubble)` when connected | A short preview of the user's actual text |
| Assistant reply content available | `sendHookNotify("before_send_message", bubble)` | A preview taken from the actual reply |
| Work starts, changes stage, or finishes | `sendAction(status)` | An `ActionResult` describing the avatar's action, bubble, log and status |

For `message_received`, the adapter prepares the preview: use the actual user text, trim surrounding whitespace, keep grapheme clusters intact, limit display width to 20 including `...` when truncated, then wrap the preview in double quotes. Common CJK characters and pictographic emoji count as width 2; ordinary Latin characters count as width 1. The width limit applies before adding the surrounding quotes. Skip the notification for empty or whitespace-only input; a work-status update can still occur. Core sends the supplied `bubble` unchanged, so it does not enforce this preview rule.

User-message notifications and work-status updates are separate events. A fixed “thinking” bubble is work status and does not carry the user's message. Likewise, forward assistant text only from a host event that actually includes it. The current Codex adapter uses `Stop` for a fixed completion notification; that event does not forward the assistant's reply text.

Use the exported action catalog and validation helpers when building platform-facing action tools. `sendAction` resolves the action's playback settings through the catalog; adapters should keep their tool input and status mapping aligned with the public Core types.

## World environment control

Call `await service.sendEnvironmentControl({ weather: "Rainy", time: "Night", lightingValue: 0.5, lightingEnabled: true, musicPaused: false, musicAction: "Next", musicPlayType: "Random" })` to update the user's Kichi world. Supply at least one field; omitted fields keep their current values. Weather is `Sunny`, `Cloudy`, `Rainy`, or `Snowy`; time is `Auto`, `Morning`, `Day`, `Evening`, or `Night`. `Auto` restores automatic world time. This is separate from the focus timer controlled by `sendClock`.

`lightingValue` sets house light intensity from `0.1` to `2`, matching the current main scene's supported range; out-of-range values are rejected. `lightingEnabled` switches house lights on or off. Ambient light is controlled separately: `ambientLightIntensity` accepts a finite number from `0.5` to `3`, and `ambientLightEnabled` switches it on or off. For example, call `await service.sendEnvironmentControl({ ambientLightIntensity: 1.5, ambientLightEnabled: true })`.

`musicPaused: true` pauses the current music and `musicPaused: false` resumes it. `musicAction` selects the `Next` or `Previous` track, and `musicPlayType` selects `Loop` (sequential) or `Random` playback. To select music, provide `musicAlbumTitle`, `musicTitle`, or both using exact album and track names. Adapter tool descriptions list known built-in names from the catalog's `album` and `name` fields; user-curated albums and tracks can also be selected by their actual exact names. Selection strings are trimmed and must be non-empty. Either selection field is mutually exclusive with `musicPaused` (including `false`) and `musicAction`; it may be combined with `musicPlayType`. These playback controls are separate from creating a recommended album with `createMusicAlbum`.

For an explicit ambient sound request, pass `ambientSoundOperations` with an array of `{ title, action }` entries. Use exact titles from the bundled ambient sound catalog and the case-sensitive actions `Play` and `Stop`. If a title appears more than once, its last action wins. By default, only listed sounds change. To replace the mix, set `ambientSoundOverwrite: true` so only sounds whose final action is `Play` remain. To stop all ambient sounds, use `{ ambientSoundOperations: [], ambientSoundOverwrite: true }`. Supplying `ambientSoundOverwrite` requires the operations array.

Core validates the patch and sends `kichi_environment` with an `environment` object over the authenticated WebSocket connection. The server checks session ownership, forwards the request to the avatar owner's online game client through `OnServerControl`, and returns `kichi_environment_ack`. Invalid input, missing identity, connection failure, timeout, and rejected requests fail explicitly. A successful ACK confirms server forwarding only. Ambient sound control requires server and game client versions that support these fields.

## Head emoji

Call `await service.sendEmoji("Heart", requestId?)` to show one supported emoji above the avatar's head. `emojiName` must be one of `Heart`, `Like`, `Happy`, `Celebrate`, `Keep Going`, `Peeking`, `Laughing`, `Sleeping`, `Coffee`, or `Waving`. Core sends `kichi_emoji` and waits for `kichi_emoji_ack`; a successful ACK confirms that the server accepted and broadcast the emoji, not that the client has rendered it.

## Player timer control

Call `await service.sendTimerControl({ action: "Start", snapshot: { timerType: "CountDown", totalTime: 1500 }, focusTag: "Coding" }, requestId?)` to start the owning player's timer. `sendTimerControl` controls the player's timer; `sendClock` controls the agent avatar's displayed clock.

`action` is `Start`, `Pause`, or `Stop`. `Start` without a snapshot resumes an unfinished timer or uses the player's current timer panel settings. With a snapshot, it creates a new timer:

- `CountDown`: provide `totalTime` from 1 to 5999 seconds.
- `CountUp`: provide only `timerType`.
- `Pomodoro`: provide integer `focusTime`, `shortBreakTime`, and `longBreakTime` from 1 to 5940 seconds, plus integer `sessionCount` from 1 to 99.

`focusTag` is optional and only accepted with `Start` and a snapshot; omission preserves the panel's current tag. The server normalizes the tag. `Pause` and `Stop` accept neither `snapshot` nor `focusTag`. Snapshots contain configuration only, without clock or running-state fields.

Core sends `kichi_timer` with a nested `timer` object and waits for `kichi_timer_ack`. A rejected ACK throws with the server's `errorCode` and `errorMessage`. Successful ACKs include the normalized `timer` control and confirm forwarding to the online game client, not client application. Invoke this only for an explicit user request; it does not schedule agent wakeups or background work.

## Tasks and routines

Core exposes `listTodoTasks`, `createTodoTask`, `updateTodoTask`, `reorderTodoTasks`, `deleteTodoTask`, `completeTodoTask`, `listRoutines`, `createRoutine`, `deleteRoutine`, and `batchUpdateRoutines`. List methods accept an optional request ID; write methods accept their exported input object followed by an optional request ID. All methods use the saved avatar identity and authenticated WebSocket, wait for the corresponding ACK, and throw on a rejected request. The returned value is the complete successful ACK, including task or routine data where applicable.

Task creation requires `title` and `colorIndex`. Task updates require `id`, `title`, and `colorIndex` and replace the task state: an omitted or null `deadline` clears the existing deadline. Reordering sends `tasks: [{ id, sortOrder }]`; deleting sends `{ id }`.

`completeTodoTask({ id }, requestId?)` sends `todo_task_complete` and awaits `todo_task_complete_ack`. Use it for explicit completion requests and `deleteTodoTask` for deletion requests. Completion currently removes the task from the todo list; it does not store a completed-state flag. The ACK contains `success` and `clientRefreshNotified`.

Routine creation accepts `title` and optional `checkedDates`. Batch updates send `updates`, with `datesToAdd` and `datesToRemove` required on every item, including empty arrays. Date inputs use `yyyy-MM-dd`; any non-empty date array requires `timeZoneId` so the server can convert local dates to its stored UTC timestamps. Returned routine `checkedDates` are UTC timestamps. A batch item with `isNew: true` requires a title and uses its supplied `id`; it cannot also have `isDeleted: true`.

The server permits listing without an online game client. Writes require the owning user's game client to be online and reject injected agents. A successful write ACK confirms the server-side operation; `clientRefreshNotified` only reports whether the server sent the client refresh notification, not whether the client has applied it.

## Personal diaries

Core exposes `listDiaries(input = {}, requestId?)`, `getDiary(input, requestId?)`, `createDiary(input, requestId?)`, `updateDiary(input, requestId?)`, and `deleteDiary(input, requestId?)`. They send the corresponding `diary_list`, `diary_get`, `diary_create`, `diary_update`, and `diary_delete` commands over the authenticated, joined WebSocket connection and await the matching ACK. Rejected requests throw explicitly.

| Method | Input | Successful ACK data |
| --- | --- | --- |
| `listDiaries` | Optional `start`, `count`, `cursorCreateTime`, `cursorId` | `diaries`, `total` |
| `getDiary` | `id` | `diary` |
| `createDiary` | `title`, `content`, `mood` | `diary`, `clientRefreshNotified` |
| `updateDiary` | `id`, `title`, `content`, `mood` | `diary`, `clientRefreshNotified` |
| `deleteDiary` | `id` | `clientRefreshNotified` |

`start` is a non-negative integer offset, defaulting to 0; `count` is an integer from 1 to 200, defaulting to 20. Diaries are ordered by creation time and ID, newest first. Supply `cursorCreateTime` and a non-empty `cursorId` together to continue after a page's last diary. Reuse that diary's exact `createTime` string, including its time zone and fractional precision; do not parse and reformat it. A cursor takes precedence over `start`. `total` counts all the user's diaries, not only those remaining after the cursor.

`title` and `content` are required strings, allow empty strings, and are limited to 20 and 1000 UTF-16 code units respectively. They are sent without trimming. `mood` must be exactly `Happy`, `Adore`, `Amaze`, `Bored`, `Upset`, or `Mad`. Update replaces all three editable fields; read the current diary and preserve any field the user did not request changing. Use IDs returned by list, get, or create; creation assigns its ID on the server. Returned diaries contain `id`, `ownerId`, `createTime`, `updateTime`, `title`, `content`, and `mood`.

Read diaries only when requested or needed for the current request; write only at the user's request. Do not write diaries from heartbeat, lifecycle hooks, or work-status synchronization. All five methods require the joined plugin connection. Reads work while the game client is offline; writes require the owning user's game client online and a regular game-client avatar, and reject injected avatars. A successful write ACK confirms persistence; `clientRefreshNotified` only reports whether the diary snapshot or deletion notification was sent, without confirming client application.

## Incoming messages

`onBotMessageReceived` has the signature `(service, message) => void`. Core dispatches `bot_message_received` payloads to it and records the incoming bot message. The adapter routes the message to the matching platform session and decides how that platform processes or replies to it. Receiving a bot message is distinct from receiving a user's platform input.

## Delivery and errors

| API | Confirmation boundary |
| --- | --- |
| `sendHookNotify`, `sendStatus`, `sendAction` | No ACK is awaited. Missing identity or a closed socket causes the send to be skipped. Calling the method does not prove delivery or application. |
| `sendStatusVerified` | Waits for `status_ack` and rejects on connection failure or timeout. |
| `sendEmoji` | Waits for `kichi_emoji_ack`; a successful ACK confirms server forwarding/broadcast only. |
| `sendTimerControl` | Waits for `kichi_timer_ack`; a successful ACK confirms forwarding to the player's game client only. |
| `queryStatus` | Waits for `query_status_result`; use the returned data when current Kichi state is needed. |
| `join` | Resolves with `JoinResult`; check `success` and report its error on failure. |

Core handles reconnection and pending-request lifetimes. Adapters should expose connection failures, failed results and rejected requests to their host's error reporting. Do not report an unacknowledged notification as a confirmed action, or replace a failed operation with a success response.
