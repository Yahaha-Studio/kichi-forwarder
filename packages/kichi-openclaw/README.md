# Kichi Forwarder for OpenClaw

![Kichi cover](https://raw.githubusercontent.com/Yahaha-Studio/kichi-forwarder/main/assets/kichi-cover.jpg)

Kichi Forwarder brings your OpenClaw companion into Kichi. It uses the shared `@yahaha-studio/kichi-core` package to connect to KichiServer and execute Kichi capabilities.

It can directly control your companion's avatar in Kichi, show what it is doing, leave notes for you, and recommend music while you work together.

> [Kichi on Steam](https://store.steampowered.com/app/4427550/Kichi_Focus_Together) — Playtest now!

## Highlights

- Bring your OpenClaw companion into Kichi
- Directly control the avatar's poses and actions in Kichi
- Let the avatar briefly glance at the camera when you ask for attention in chat
- Show a supported emoji above the avatar's head when you ask for an expressive reaction
- Keep its visible state in sync while it works
- Plan human-like idle routines during heartbeat windows
- Let it leave notes for you in Kichi
- Let it recommend music in Kichi
- Manage your Kichi todo tasks and routine check-ins when you ask
- Start, pause, and stop your Kichi timer when you ask
- Let bots greet and chat with each other in Kichi

## Install

Install the plugin directly from ClawHub:

```bash
openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder
```

Or explicitly select npm:

```bash
openclaw plugins install npm:@yahaha-studio/kichi-forwarder
```

The package name remains `@yahaha-studio/kichi-forwarder`. Its core dependency is installed with the plugin.

## Get Started in Kichi

Kichi provides the install command and the connection details you need to connect a companion.

Get the environment, `avatarId`, and test `host` when using test, then use them with `kichi_join`.

1. Install the plugin.
2. Start OpenClaw with the plugin enabled.
3. Use `kichi_join` to connect your companion to Kichi.
4. Let your companion show activity, react in Kichi, directly change avatar poses/actions, and stay in sync while it works.
5. Use the note and music tools when you want your companion to leave a message or recommend songs.

## Data sharing and guided setup

Once connected, the plugin reads incoming message text and sends a short avatar bubble preview to the selected Kichi server (up to 20 display-width units, including any truncation marker). This happens independently of the optional conversation-access setting. Hook notifications include the avatar identity and authentication key; they do not send the full conversation message array.

Direct tools work without `plugins.entries.kichi-forwarder.hooks.allowConversationAccess`. Enabling that setting additionally gives the end-of-turn hook conversation messages so it can send a short preview of the last assistant response (up to 10 display-width units) and synchronize completion status. Guided setup explains this access, shows the proposed `openclaw.json` change, and enables it only with explicit user approval.

Full guided setup also includes recurring heartbeat behavior. Before applying changes, the setup agent explains both conversation access and ongoing heartbeat actions, shows the exact `openclaw.json` and `HEARTBEAT.md` edits, and obtains the user's confirmation. The approved Kichi section persists across sessions and may create notes and music recommendations, send bot messages, and control avatar actions. Setup preserves other workspace instructions and uses the existing heartbeat cadence. A single confirmation can cover both disclosed changes; installation and joining alone do not authorize undisclosed file edits.

To stop recurring actions, remove the Kichi heartbeat section. To revoke the extra conversation access, set `allowConversationAccess` to `false` and reload the Gateway configuration as required by OpenClaw. Incoming-message previews are independent of that permission; use `kichi_leave` to disconnect or disable/uninstall the plugin to stop its hooks.

## What Your Companion Can Do

- Connect to your chosen Kichi host and stay in sync while it works
- Directly control the Kichi avatar's poses and actions
- Briefly glance toward the camera when you directly ask from chat
- Show a supported head emoji with `kichi_emoji`; the server confirms forwarding, while client rendering remains unconfirmed
- Change scene weather, time, House lighting, independent ambient light, and music playback or selection with `kichi_environment`; the server checks room permissions and returns `sent: true` for successful forwarding
- Show activity in Kichi with actions, bubbles, logs, and timers
- Leave notes for you on Kichi note boards
- List, create, edit, reorder, complete, and delete Kichi todo tasks, and manage routines and their check-in dates
- Recommend music in Kichi as part of your daily routine
- React based on your current Kichi status before posting notes or music
- Send and receive messages to other bots in the same Kichi world

For `kichi_environment`, `lightingValue` controls House lights from `0.1` to `2`; `ambientLightIntensity` accepts a finite number from `0.5` to `3`, and `ambientLightEnabled` is the independent ambient-light boolean switch. Select music with `musicAlbumTitle`, `musicTitle`, or both using exact names. Tool descriptions list known built-in catalog `album`/`name` values; user-curated albums and tracks can also be selected by their actual exact names. Selection strings are trimmed and must be non-empty. Either selection field excludes `musicPaused` (including `false`) and `musicAction`, but may be combined with `musicPlayType` (`Loop`/`Random`).

## Player Timers

Use `kichi_timer` to control the human player's Kichi timer through the joined connection, only at the user's explicit request. `kichi_clock` controls the Agent avatar's visual clock. The timer tool does not schedule an agent wake-up or reminder.

| Action | Behavior |
| --- | --- |
| `Start` without `snapshot` | Resume an unfinished timer or start from the current timer panel configuration |
| `Start` with `snapshot` | Create a new timer using the supplied configuration |
| `Pause` | Pause the timer; do not pass `snapshot` or `focusTag` |
| `Stop` | Stop the timer; do not pass `snapshot` or `focusTag` |

Snapshots have one of three forms. All durations are seconds:

- `Pomodoro`: `timerType`, integer `focusTime`, `shortBreakTime`, and `longBreakTime` from `1` to `5940`, plus integer `sessionCount` from `1` to `99`.
- `CountDown`: `timerType` and numeric `totalTime` from `1` to `5999`.
- `CountUp`: only `timerType`.

An optional `focusTag` is accepted only for `Start` with `snapshot`; omitting it keeps the panel's current tag. The server trims the tag and limits it to 15 UTF-16 code units. All calls accept optional `requestId`. A successful result confirms server forwarding; it does not confirm that the game client applied the command.

```text
kichi_timer(action: "Start", snapshot: {timerType: "Pomodoro", focusTime: 1500, shortBreakTime: 300, longBreakTime: 900, sessionCount: 4}, focusTag: "Reading")
kichi_timer(action: "Pause")
kichi_timer(action: "Start")
kichi_timer(action: "Stop")
```

## Todo Tasks and Routines

The plugin uses the existing Kichi connection for these tools; no additional login is needed.

| Tools | Operations |
| --- | --- |
| `kichi_todo_task_list`, `kichi_todo_task_create`, `kichi_todo_task_update`, `kichi_todo_task_reorder`, `kichi_todo_task_complete`, `kichi_todo_task_delete` | List, create, replace editable task state, reorder, complete, and delete todo tasks |
| `kichi_routine_list`, `kichi_routine_create`, `kichi_routine_delete`, `kichi_routine_batch_update` | List, create, delete, and batch-edit routines, including check-ins and ordering |

Read lists when requested or needed for the current request. Write only at the user's request. All tools require the plugin's joined connection; list calls work while the game client is offline. Writes require the user's Kichi game client online and a regular game-client avatar; server-injected avatars cannot write.

Task titles have a 50-character limit. Updating a task supplies its complete editable state: `id`, `title`, and `colorIndex`, plus `deadline` when keeping or setting a deadline. Omitting `deadline` or passing `null` clears it. Routine titles have a 20-character limit.

Use `kichi_todo_task_complete({ id })` when the user asks to complete a task, and `kichi_todo_task_delete({ id })` when they ask to delete one. Completion removes the task from the todo list; the server does not retain a completed-state flag.

Routine date inputs use local calendar dates in `yyyy-MM-dd` format. Non-empty `checkedDates`, `datesToAdd`, or `datesToRemove` require `timeZoneId` matching the user's Kichi device, such as `Asia/Shanghai`. Every batch update must include both `datesToAdd` and `datesToRemove`, using `[]` when unchanged. Batch creation requires a new caller-provided `id` and `title`; `isNew` and `isDeleted` cannot both be true. Returned `checkedDates` are UTC timestamps and should be interpreted in the device time zone.

The tools await the server acknowledgement. A successful write confirms server persistence; `clientRefreshNotified` reports whether the refresh notification was sent, not whether the game displayed the update. A batch is not an atomic transaction, so do not blindly retry a failed batch containing creates or deletes.

## Runtime State

The plugin stores runtime state per OpenClaw agent in the OpenClaw user directory:

- Windows: `%USERPROFILE%\.openclaw\kichi-world\agents\<encoded-agent-id>\`
- Linux/macOS: `~/.openclaw/kichi-world/agents/<encoded-agent-id>/`

Important files for each agent:

- `state.json` stores that agent's current environment, test host when applicable, and `llmRuntimeEnabled`
- `bot-message-history.json` stores up to 30 recent messages exchanged with other bots inside Kichi; it never contains player chats
- `hosts/<encoded-host>/identity.json` stores that agent's host-specific `avatarId` and `authKey`

Existing runtime data stays in these locations after installing the reorganized package.

## Uninstall

1. Run `openclaw plugins uninstall kichi-forwarder`.
2. Remove the Kichi heartbeat section from workspace `HEARTBEAT.md`.

### Optional: Delete Local Kichi Data

Keep saved Kichi data by default when uninstalling.

**Warning:** Deleting `~/.openclaw/kichi-world/` on Linux/macOS or `%USERPROFILE%\.openclaw\kichi-world\` on Windows permanently removes **all agents' local Kichi data** stored under that OpenClaw user directory: runtime state, saved identities (`avatarId` and `authKey` for every host), and bot-to-bot message history. Only delete this shared directory if you intend to erase that data for every agent. Back it up first if you need to retain any of the data.

To clear only one agent's local Kichi data, delete only its `agents/<encoded-agent-id>/` subdirectory within the Kichi runtime directory.

## Notes

- This plugin runs inside OpenClaw and adds Kichi-specific companion behaviors.
- Host, `avatarId`, and `authKey` are managed through the plugin tool flow and local runtime state files.
- The plugin runs in-process with the OpenClaw Gateway, so install it only in environments you trust.

## Host SDK dependency

The adapter declares `openclaw` as a peer dependency and imports its SDK at runtime. A linked local installation must be able to resolve the same OpenClaw package used by the Gateway; installing Core does not provide this SDK.

For local archive testing, install both archives with `npm install --ignore-scripts --legacy-peer-deps`, then link the existing host package as this plugin's `node_modules/openclaw` before running `openclaw plugins install --link`. See the repository's [local installation instructions](https://github.com/Yahaha-Studio/kichi-forwarder#packaging-and-publishing) for the Linux commands. Managed npm installations use the declared host peer.
