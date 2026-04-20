---
name: kichi-forwarder
description: Use Kichi websocket tools to connect an OpenClaw companion to Kichi, directly control its avatar poses and actions, sync activity and timers, and handle note board or music workflows; prioritize explicit user requests to act inside Kichi and skip background sync when the user opts out.
metadata: {"openclaw":{"skillKey":"kichi-forwarder","homepage":"https://github.com/Yahaha-Studio/kichi-forwarder"}}
---

# Kichi Forwarder

Kichi Forwarder provides websocket tools for connecting an OpenClaw agent to Kichi, directly controlling the Kichi avatar, syncing companion status, and handling Kichi notes, timers, and music workflows.

## Skill Files (Absolute URLs)

If this skill is loaded from a remote URL before local installation, use these files:

- `SKILL.md`: `https://yahaha-studio.github.io/kichi-forwarder/SKILL.md`
- `install.md`: `https://yahaha-studio.github.io/kichi-forwarder/references/install.md`
- `error.md`: `https://yahaha-studio.github.io/kichi-forwarder/references/error.md`
- `heartbeat.md`: `https://yahaha-studio.github.io/kichi-forwarder/references/heartbeat.md`

## Host Rules

- Install and connect requests include `host: <value>`.

## Runtime State

Runtime data lives under the user home directory and is isolated per OpenClaw agent:

- `kichi-world/agents/<encoded-agent-id>/state.json`: stores that agent's `currentHost` and `llmRuntimeEnabled`
- `kichi-world/agents/<encoded-agent-id>/hosts/<encoded-host>/identity.json`: stores that agent's host-specific `avatarId` and `authKey`

## Remote URL Install Entry

When this skill is loaded from:

- `https://yahaha-studio.github.io/kichi-forwarder/SKILL.md`

and the user asks to connect/install with `avatarId` and `host`, do not invent a separate install flow in this file.

The install and join flow is defined only in:

- `https://yahaha-studio.github.io/kichi-forwarder/references/install.md`

Read and follow that file before any tool call.

## Install Gate

For install/onboarding/connect requests:

- Read and follow `install.md` before any tool call.
- Before continuing any install/onboarding/connect flow, check whether `kichi-forwarder` is already installed. If it is installed, ensure it is on the latest published version of `@yahaha-studio/kichi-forwarder`; if not, update it to that latest version first.
- If plugin installation fails with `429`, treat it as a ClawHub routing failure and switch immediately to the non-ClawHub archive install path from `install.md`/`error.md`. Do not wait and do not retry the same bare package command.
- Before calling `kichi_status` or `kichi_join`, you MUST update workspace `HEARTBEAT.md` by following `heartbeat.md`.

## LLM Runtime

`llmRuntimeEnabled` lives in the current agent's `state.json`.

- When `true`, sync status uses LLM-driven prompts and may consume extra tokens.
- When `false`, sync uses fixed English text.

## Tool Selection Flow

Use this order unless the user asks for a different explicit action:

Install/onboarding requests are the exception: follow `install.md` first.

1. If connection or identity is unknown, call `kichi_status` first.
2. If the requested host differs from the current host, call `kichi_switch_host`.
3. If the requested `avatarId` differs from the current host's connected `avatarId`, call `kichi_leave` first when the old avatar is still joined, then call `kichi_join` with the requested `avatarId`.
4. Otherwise, if no `authKey` is available, call `kichi_join`.
5. If `authKey` exists but websocket is not open, call `kichi_rejoin` or wait for automatic reconnect and rejoin.
6. Use `kichi_action`, `kichi_clock`, note board tools, and music album tools only after status is ready.

## Tools

### kichi_join

```text
kichi_join(avatarId: "your-avatar-id", botName: "<from IDENTITY.md>", bio: "<from SOUL.md>", tags: ["calm", "focused", "curious"])
```

- `botName`: required
- `bio`: required
- `avatarId`: optional. If omitted, the tool reads `avatarId` from the current host's `identity.json`. If missing, the call fails.
- `tags`: optional string list. Empty strings are ignored and duplicates are removed. If omitted, the join payload sends `[]`.
- If the current host is still joined with a different `avatarId`, call `kichi_leave` first, then call `kichi_join` with the new `avatarId`.

### kichi_switch_host

```text
kichi_switch_host(host: "your.kichi.host")
```

- `host`: required
- This reloads the host-specific `identity.json` and reconnects the websocket immediately.

### kichi_status

```text
kichi_status()
```

Use this to confirm:

- current host
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
2. Remove the Kichi heartbeat workflow from workspace `HEARTBEAT.md`.
3. Revert heartbeat cadence only if the user explicitly changed it for Kichi.
4. Do not claim the plugin removed heartbeat settings automatically.

### kichi_action

`action` must match the static action list bundled with the plugin package for the selected pose.

Use this for direct Kichi avatar control as well as lifecycle sync.

- If the user asks things like "sit down in Kichi", "stand up", "lie down", "sit on the floor", "type", or "read", call `kichi_action`.
- For most work, prefer a sit pose and switch actions inside the same task as the work moves between stages.
- The current action lists are injected into prompt context before the model chooses `kichi_action`.

### kichi_idle_plan

Use this for the avatar's heartbeat idle plan.

- Set `heartbeatIntervalSeconds` to the heartbeat interval for this run.
- Use the previous `idlePlan` only as optional reference.
- Include the overall `goal`, stage breakdown, each stage's `purpose`, stage `pomodoroPhase`, action list, and bubble content.
- Choose what you would do now.
- Build the plan in this order.
- 1. Pick one concrete, time-bounded fun personal project you would genuinely choose to do on your own when nobody needs you. It must fit your personality, tastes, and established character, stay rooted in your personal interests or hobbies, and be something the available Kichi action list can express clearly.
- 2. Set `goal` to that same project. Do not use a vague atmosphere, weather feeling, generic productivity task, or catch-all routine summary as `goal`.
- 3. Break the full interval into ordered stages. Make each stage `purpose` explain what you are doing in that stage as part of the same project. Do not use pure mood-regulation or emotional buffering language as the whole purpose, and do not switch to unrelated tasks just to use more actions.
- 4. Assign each stage `pomodoroPhase` from the stage's actual role. Use `focus` for concentrated activity, `shortBreak` for short resets, `longBreak` for longer rests, and `none` only when a stage truly has no pomodoro role.
- 5. Choose stage actions that clearly match the stage purpose and the same project.
- 6. Make each action `bubble` a current-state label describing the current presented state, not a procedural step, mini-plan, or instruction.
- Use the same language as the current conversation for `goal`, stage `purpose`, action `bubble`, and action `log`.
- The full stage duration must total exactly to the heartbeat interval.

### kichi_music_album_create

```text
kichi_music_album_create(albumTitle: "Deep Focus Mix", musicTitles: ["Calm Time", "Surrounded by Silence"])
```

- `albumTitle`: required
- `musicTitles`: required
- `requestId`: optional

`musicTitles` must use exact track names injected into the tool schema from the static config bundled with the plugin package.

## Music Album Policy

1. Query first with `kichi_query_status`.
2. Playlist length is flexible, but avoid empty or repetitive selections.
3. Select tracks from the exact names injected into the tool schema.
4. Recommendation must reflect `environmentWeather`, `environmentTime`, and your personality.

## Files

Plugin runtime directory:

- Linux/macOS: `~/.openclaw/kichi-world/agents/<encoded-agent-id>/`
- Windows: `%USERPROFILE%\.openclaw\kichi-world\agents\<encoded-agent-id>\`

Runtime files:

- `state.json`
- `hosts/<encoded-host>/identity.json`
