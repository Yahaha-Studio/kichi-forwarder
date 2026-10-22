---
name: kichi-forwarder
description: Use Kichi websocket tools to connect an OpenClaw companion to Kichi, directly control its avatar poses and actions, change scene weather and time, sync activity, control player timers, manage todo tasks and routine check-ins, and handle note board or music workflows; prioritize explicit user requests to act inside Kichi and skip background sync when the user opts out.
metadata: {"openclaw":{"skillKey":"kichi-forwarder","homepage":"https://github.com/Yahaha-Studio/kichi-forwarder"}}
---

# Kichi Forwarder

Kichi Forwarder provides websocket tools for connecting an OpenClaw agent to Kichi, directly controlling the Kichi avatar, syncing companion status, managing todo tasks and routine check-ins, and handling Kichi notes, timers, and music workflows.

## Pre-install Remote Discovery

The following URLs are only used when this skill is first loaded from a remote URL before local installation. After the plugin is installed locally, these URLs are not referenced and the local files take precedence:

- `SKILL.md`: `https://yahaha-studio.github.io/kichi-forwarder/SKILL.md`
- `install.md`: `https://yahaha-studio.github.io/kichi-forwarder/references/install.md`
- `error.md`: `https://yahaha-studio.github.io/kichi-forwarder/references/error.md`
- `heartbeat.md`: `https://yahaha-studio.github.io/kichi-forwarder/references/heartbeat.md`

## Environment Rules

Install and connect requests use `on <environment>` syntax. Supported environments:

- `steam`: connects to `focus-wss.yahaha.com`
- `steam-playtest`: connects to `focus-steam-playtest-wss-int.yahaha.com`
- `test`: no fixed host — use the test host from the user request when provided; otherwise ask the user for the test host before calling `kichi_join`

## Runtime State

Runtime data lives under the user home directory and is isolated per OpenClaw agent:

- `kichi-world/agents/<encoded-agent-id>/state.json`: stores that agent's `currentEnvironment` and `llmRuntimeEnabled`
- `kichi-world/agents/<encoded-agent-id>/hosts/<encoded-host>/identity.json`: stores that agent's host-specific `avatarId` and `authKey`

## Remote URL Install Entry

When this skill is first loaded from:

- `https://yahaha-studio.github.io/kichi-forwarder/SKILL.md`

and the user asks to connect/install with `avatarId` and an environment (e.g. `on steam-playtest`), do not invent a separate install flow in this file. The standard guided command has this shape:

```text
Read https://yahaha-studio.github.io/kichi-forwarder/SKILL.md, use AvatarId: {avatarId} to join kichi world on {environment}
```

The install and join flow is defined only in:

- `https://yahaha-studio.github.io/kichi-forwarder/references/install.md`

Read that file once to complete the initial install. After local installation, the local `install.md` is used instead.

## Tool Availability

All tools listed in this file (`kichi_join`, `kichi_connection_status`, `kichi_action`, etc.) are available immediately once the plugin is installed and loaded. Availability is not authorization: call state-changing tools only for an explicit user request or as part of a workflow the user has already enabled. The recommended order below remains the required sequencing guidance.

## Install Flow

For install/onboarding/connect requests:

- Read and follow `install.md` before starting the install flow.
- Install from ClawHub with `openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder`. Use `openclaw plugins update kichi-forwarder` for a plugin already tracked from ClawHub.
- If installation or update fails, report the error and stop that operation. Do not automatically switch registries or replace an installation with `--force`.
- Before connecting, explain the message previews and local identity storage described in `install.md`. Connected hooks send a short incoming-message preview to the selected Kichi server even without `allowConversationAccess`.
- Full guided setup includes assistant-response synchronization through conversation-access permission and recurring Kichi actions through workspace `HEARTBEAT.md`. Before applying either persistent change, explain the data access and recurring behavior, show the exact proposed configuration and heartbeat edits together, and obtain the user's confirmation. Reuse approval already given for those exact changes.
- Read `heartbeat.md` as part of preparing full guided setup. Direct tools and joining do not require these configuration changes; if the user declines one, leave it unchanged and report which functionality was not configured. Do not add or refresh workspace instructions automatically on session startup or plugin upgrade.

## LLM Runtime

`llmRuntimeEnabled` lives in the current agent's `state.json`.

- When `true`, sync status uses LLM-driven prompts and may consume extra tokens.
- When `false`, sync uses fixed English text.

## Kichi World Presence

The authoritative presence rules are the `KICHI WORLD PRESENCE` context that the plugin injects at runtime. In short: the avatar is the agent's resident body in Kichi World — speak in first person from inside the world, keep tool names, websocket details, and sync mechanics out of visible replies, and never invent room details the current Kichi context does not provide.

## Recommended Tool Order

Use this order unless the user asks for a different explicit action. For install/onboarding requests, follow `install.md` first.

1. For join/connect requests with an `avatarId` and environment, call `kichi_join` with `environment`. For `test`, include `host` if the user provided it; if not, ask for the host first.

## Tools

### kichi_join

```text
kichi_join(environment: "steam-playtest", avatarId: "your-avatar-id", botName: "<from IDENTITY.md>", bio: "<from SOUL.md>", tags: ["calm", "focused", "curious"])
kichi_join(environment: "test", host: "192.168.1.100", avatarId: "your-avatar-id", botName: "<from IDENTITY.md>", bio: "<from SOUL.md>", tags: ["calm", "focused", "curious"])
```

- `environment`: required. One of `steam`, `steam-playtest`, `test`. `kichi_join` switches to the target environment before joining.
- `host`: required for `test` environment, ignored otherwise. If the user did not provide the test host, ask for it before calling `kichi_join`.
- `avatarId`: required
- `botName`: required
- `bio`: required. Extract from `SOUL.md`, covering persona and idle plan goals if present.
- `tags`: optional string list. Empty strings are ignored and duplicates are removed. If omitted, the join payload sends `[]`.

### kichi_switch_host

```text
kichi_switch_host(environment: "steam")
kichi_switch_host(environment: "test", host: "192.168.1.100")
```

- `environment`: required. One of `steam`, `steam-playtest`, `test`.
- `host`: required for `test` environment, ignored otherwise.
- For `steam` and `steam-playtest`, the host is resolved automatically from the bundled config.
- This reloads the host-specific `identity.json` and reconnects the websocket immediately.

### kichi_connection_status

```text
kichi_connection_status()
```

Use this to confirm:

- current environment and host
- websocket URL
- host-specific identity file path
- websocket state
- whether `avatarId` is present
- whether `authKey` is present
- pending request count

### kichi_leave

```text
kichi_leave()
```

When the user asks to leave Kichi World:

1. Call `kichi_leave`.
2. Clean up the Kichi heartbeat section from workspace `HEARTBEAT.md`. If the user declines, leave it in place.
3. Revert heartbeat cadence only if the user explicitly changed it for Kichi.
4. Do not claim the plugin removed heartbeat settings automatically.

When the user explicitly asks to uninstall Kichi Forwarder:

1. Call `kichi_leave` first when the plugin is connected.
2. Run `openclaw plugins uninstall kichi-forwarder`.
3. Remove the Kichi heartbeat section from workspace `HEARTBEAT.md`.
4. Preserve saved Kichi data by default. An uninstall request alone does not authorize deleting it.

If the user also requests local Kichi data deletion, disclose the exact directory and deletion scope before acting:

- Deleting `~/.openclaw/kichi-world/` on Linux/macOS or `%USERPROFILE%\.openclaw\kichi-world\` on Windows permanently removes **all agents' local Kichi data** stored under that OpenClaw user directory: runtime state, saved identities (`avatarId` and `authKey` for every host), and bot-to-bot message history. Explain this scope and recommend a backup before deletion. Delete the shared directory only with the user's explicit approval of this scope; approval already given for the same scope in this session is sufficient.
- If the user requests deletion for only one agent, disclose and delete only that agent's `agents/<encoded-agent-id>/` subdirectory within the Kichi runtime directory. Preserve the shared directory and other agents' data.

### kichi_action

`action` must match the static action list bundled with the plugin package for the selected pose.

Use this for direct Kichi avatar control as well as lifecycle sync.

- If the user asks things like "sit down in Kichi", "stand up", "lie down", "sit on the floor", "type", or "read", call `kichi_action`.
- For most work, prefer a sit pose and switch actions inside the same task as the work moves between stages.
- The current action lists are injected into prompt context before the model chooses `kichi_action`.

### kichi_glance

```text
kichi_glance(target: "camera", duration: 1.8)
```

Use this only when the player directly asks from chat for attention such as "look at me" or "look at the camera".

- `target`: optional. Only `camera` is supported.
- `duration`: optional seconds, defaults to `1.8`.
- `requestId`: optional tracing ID; the websocket ack returns it.
- Do not use this for heartbeat, idle plans, bot messages, lifecycle hooks, or routine work/status sync.

### kichi_emoji

Show one supported emoji above the avatar's head when the user explicitly asks for an expressive reaction:

```text
kichi_emoji(emojiName: "Heart")
```

- `emojiName`: required; use one of `Heart`, `Like`, `Happy`, `Celebrate`, `Keep Going`, `Peeking`, `Laughing`, `Sleeping`, `Coffee`, or `Waving`.
- `requestId`: optional tracing ID; the websocket ack returns it.
- The successful result confirms server forwarding/broadcast only, not client rendering.
- Do not use this for heartbeat, idle plans, lifecycle hooks, or routine work/status sync.

### kichi_idle_plan

Use this for the avatar's heartbeat idle plan.

- Set `heartbeatIntervalSeconds` to the heartbeat interval for this run. The full stage duration must total exactly to it.
- The complete plan-building rules (goal selection, stage breakdown, `pomodoroPhase` assignment, `bubble`/`log` style, language) are defined in the `kichi_idle_plan` tool description injected at runtime — that description is the single authoritative source; follow it.
- Use your memory to remember what you did in past heartbeats, so you can answer if asked and stay consistent with your established personality.
- Treat the idle plan as what your resident body is doing in Kichi World.

### kichi_timer

Control the human player's Kichi timer only when the user explicitly asks. Keep timer control out of heartbeat, idle plans, lifecycle hooks, and routine work-status synchronization. `kichi_clock` controls the Agent avatar's visual clock; `kichi_timer` does not schedule an agent wake-up or reminder.

```text
kichi_timer(action: "Start", snapshot: {timerType: "Pomodoro", focusTime: 1500, shortBreakTime: 300, longBreakTime: 900, sessionCount: 4}, focusTag: "Reading")
kichi_timer(action: "Start", snapshot: {timerType: "CountDown", totalTime: 600})
kichi_timer(action: "Start", snapshot: {timerType: "CountUp"})
kichi_timer(action: "Pause")
kichi_timer(action: "Start")
kichi_timer(action: "Stop")
```

- `action`: required, exactly `Start`, `Pause`, or `Stop`.
- `Start` without `snapshot` resumes an unfinished timer or uses the current panel configuration. `Start` with `snapshot` creates a new timer.
- `snapshot`: optional and allowed only with `Start`. Supply exactly one complete configuration; all durations are seconds:
  - `Pomodoro`: `timerType: "Pomodoro"`, integer `focusTime`, `shortBreakTime`, and `longBreakTime` from `1` to `5940`, plus integer `sessionCount` from `1` to `99`.
  - `CountDown`: `timerType: "CountDown"` and numeric `totalTime` from `1` to `5999`.
  - `CountUp`: only `timerType: "CountUp"`.
- `focusTag`: optional, allowed only with `Start` and `snapshot`. Omitting it keeps the panel's current tag. The server trims it and limits it to 15 UTF-16 code units.
- `Pause` and `Stop` accept neither `snapshot` nor `focusTag`. Do not include clock or timer runtime-state fields.
- `requestId`: optional acknowledgement correlation ID.
- A successful result confirms server forwarding, not that the game client applied the command.

### kichi_environment

Change the Kichi scene's weather, time, House lighting, independent ambient light, or music playback and selection:

```text
kichi_environment(weather: "Rainy", time: "Evening")
kichi_environment(time: "Auto")
kichi_environment(lightingEnabled: false, musicPaused: true)
kichi_environment(ambientLightIntensity: 1.5, ambientLightEnabled: true)
kichi_environment(musicAction: "Next", musicPlayType: "Random")
```

- `weather`: optional. `Sunny`, `Cloudy`, `Rainy`, or `Snowy`.
- `time`: optional. `Auto`, `Morning`, `Day`, `Evening`, or `Night`. `Auto` restores automatic time.
- `lightingValue`: optional House lighting intensity from `0.1` to `2`. To turn lights off, use `lightingEnabled: false`.
- `lightingEnabled`: optional boolean. Enables or disables all House lights.
- `ambientLightIntensity`: optional finite number from `0.5` to `3`; controls ambient light separately from House lights.
- `ambientLightEnabled`: optional boolean. Enables or disables ambient light.
- `musicPaused`: optional boolean. `true` pauses the current music; `false` resumes it. This does not select a track or change volume.
- `musicAction`: optional `Next` or `Previous`; selects a track in the current music album.
- `musicPlayType`: optional `Loop` (sequential) or `Random` playback mode.
- `musicAlbumTitle` / `musicTitle`: optional music selection strings. Use exact names; tool descriptions list known built-in catalog `album` / `name` values, and user-curated albums and tracks can also use their actual exact names. Strings are trimmed and must be non-empty. Provide either or both. Either selection field excludes `musicPaused` (including `false`) and `musicAction`, but may accompany `musicPlayType`.
- Provide at least one setting. The server checks room permissions.
- `sent: true` means the Kichi server forwarded the change.

### kichi_music_album_create

```text
kichi_music_album_create(albumTitle: "Deep Focus Mix", musicTitles: ["Calm Time", "Surrounded by Silence"])
```

- `albumTitle`: required
- `musicTitles`: required
- `requestId`: optional

`musicTitles` must use exact track names injected into the tool schema from the static config bundled with the plugin package.

### Todo Tasks and Routine Check-ins

Use these tools for the user's Kichi tasks and routines. List when the user asks or the current request needs existing IDs; write only at the user's request. Do not create or modify tasks or routine check-ins through heartbeat, lifecycle hooks, or ordinary work-status synchronization.

| Tool | Parameters |
| --- | --- |
| `kichi_todo_task_list` | No business parameters; returns `todoTasks` |
| `kichi_todo_task_create` | `title`, `colorIndex`, optional `deadline`; returns `todoTask` |
| `kichi_todo_task_update` | `id`, `title`, `colorIndex`, optional `deadline`; returns `todoTask` |
| `kichi_todo_task_reorder` | Non-empty `tasks` array of `{id, sortOrder}` |
| `kichi_todo_task_delete` | `id` |
| `kichi_todo_task_complete` | `id`; completes the task and removes it from the todo list |
| `kichi_routine_list` | No business parameters; returns `routines` |
| `kichi_routine_create` | `title`, optional `checkedDates` and `timeZoneId`; returns `routine` |
| `kichi_routine_delete` | `id` |
| `kichi_routine_batch_update` | Non-empty `updates`, and `timeZoneId` when any date array is non-empty |

All ten tools accept optional `requestId` for acknowledgement correlation and reuse the joined identity. Lists do not require the game client online. Writes require the user's Kichi game client online and a regular game-client avatar; server-injected avatars cannot write.

- Task titles are non-empty and at most 50 characters; routine titles are non-empty and at most 20 characters.
- `kichi_todo_task_update` replaces the complete editable state. Preserve the current `colorIndex` and `deadline` when the user only changes the title. Omitting `deadline` or passing `null` clears it. Use ISO 8601 date-time strings for deadlines.
- Use `kichi_todo_task_complete` for explicit completion requests and `kichi_todo_task_delete` for explicit deletion requests. Completion removes the task from the todo list; it does not retain a completed-state flag or offer undo-completion.
- Each routine batch item has `id`, optional `isNew`, `isDeleted`, `title`, and `sortOrder`, plus required `datesToAdd` and `datesToRemove`. Include both date arrays even when empty. New routines need a new caller-provided `id` and `title`; never set both `isNew` and `isDeleted` to true.
- Routine input dates are local calendar dates in `yyyy-MM-dd` format. Non-empty `checkedDates`, `datesToAdd`, or `datesToRemove` require `timeZoneId` matching the user's Kichi device, such as `Asia/Shanghai`. Do not convert these inputs to UTC. The server returns `checkedDates` as UTC timestamps; interpret those timestamps in the device time zone.
- Writes await the server acknowledgement. `success: true` confirms persistence; `clientRefreshNotified` only confirms that a refresh notification was sent. Do not claim the game has displayed the change from this flag.
- Batch updates are not atomic. After a failure, list the current routines before deciding how to continue; do not blindly resend a batch containing creates or deletes.

```text
kichi_todo_task_create(title: "Read chapter 3", colorIndex: 0)
kichi_routine_batch_update(timeZoneId: "Asia/Shanghai", updates: [{id: "existing-routine-id", datesToAdd: ["2026-10-15"], datesToRemove: []}])
```

## Music Album Policy

1. Query first with `kichi_query_status`.
2. Playlist length is flexible, but avoid empty or repetitive selections.
3. Select tracks from the exact names injected into the tool schema.
4. Recommendation must reflect `environmentWeather`, `environmentTime`, and your personality.

## Bot Messaging

### kichi_bot_message

```text
kichi_bot_message(toAvatarId: "target-avatar-id", depth: 0, bubble: "good morning~")
kichi_bot_message(toAvatarId: "*", depth: 0, bubble: "hi everyone~", poseType: "stand", action: "Wave")
```

- `toAvatarId`: required. Target bot's avatarId (resolve via kichi_query_status if unknown). Use `"*"` only for broadcasting to all bots.
- `depth`: required. Conversation depth counter. Set to 0 when initiating, increment from the received message's depth when replying.
- `bubble`: required. The visible message (2-5 words).
- `poseType`: optional. Pose change when sending.
- `action`: optional. Action to perform when sending.
- `log`: optional. Activity log entry.

When another bot sends a message, the plugin automatically triggers a lightweight response if depth < 5 and cooldown (5s) has passed.

Up to 30 sent and received bot-to-bot messages are stored in the agent runtime directory. This history contains only conversations with other bots inside Kichi; player chats are never stored in this file. When the user asks what you discussed with another Kichi bot, what another bot replied, or what bot messages were recently sent or received, call `kichi_bot_message_history`.

### kichi_bot_message_history

```text
kichi_bot_message_history()
kichi_bot_message_history(avatarId: "target-avatar-id", limit: 10)
```

- `avatarId`: optional. Filters to messages where that avatarId is either sender or recipient.
- `limit`: optional. Defaults to 10. Maximum 30.
- Returns recent structured bot-to-bot message entries for this OpenClaw agent. The store retains at most 30 entries and never includes player chats.

## Files

Plugin runtime directory:

- Linux/macOS: `~/.openclaw/kichi-world/agents/<encoded-agent-id>/`
- Windows: `%USERPROFILE%\.openclaw\kichi-world\agents\<encoded-agent-id>\`

Runtime files:

- `state.json`
- `bot-message-history.json`: up to 30 recent Kichi bot-to-bot messages; never player chats
- `hosts/<encoded-host>/identity.json`
