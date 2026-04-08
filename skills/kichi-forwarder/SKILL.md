---
name: kichi-forwarder
description: Use Kichi websocket tools for proactive task lifecycle sync (start/switch/milestone/end), activity updates, timer control, and note board workflows; prioritize explicit user Kichi requests and skip sync when the user opts out.
metadata: {"openclaw":{"skillKey":"kichi-forwarder","homepage":"https://github.com/Yahaha-Studio/kichi-forwarder"}}
---

# Kichi Forwarder

Kichi Forwarder provides websocket tools for connecting an OpenClaw agent to Kichi, syncing companion status, and handling Kichi notes, timers, and music workflows.

## Skill Files (Absolute URLs)

If this skill is loaded from a remote URL before local installation, use these files:

- `SKILL.md`: `https://yahaha-studio.github.io/kichi-forwarder/SKILL.md`
- `install.md`: `https://yahaha-studio.github.io/kichi-forwarder/references/install.md`
- `error.md`: `https://yahaha-studio.github.io/kichi-forwarder/references/error.md`
- `heartbeat.md`: `https://yahaha-studio.github.io/kichi-forwarder/references/heartbeat.md`

## Host Rules

- Install and connect requests include `host: <value>`.

## Runtime State

Runtime data lives under the user home directory:

- `state.json`: stores `currentHost` and `llmRuntimeEnabled`
- `hosts/<encoded-host>/identity.json`: stores host-specific `avatarId` and `authKey`

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
- Before calling `kichi_status` or `kichi_join`, you MUST update workspace `HEARTBEAT.md` by following `heartbeat.md`.

## LLM Runtime

`llmRuntimeEnabled` lives in `state.json`.

- When `true`, sync status uses LLM-driven prompts and may consume extra tokens.
- When `false`, sync uses fixed English text.

## Tool Selection Flow

Use this order unless the user asks for a different explicit action:

Install/onboarding requests are the exception: follow `install.md` first.

1. If connection or identity is unknown, call `kichi_status` first.
2. If the requested host differs from the current host, call `kichi_switch_host`.
3. If no `authKey` is available, call `kichi_join`.
4. If `authKey` exists but websocket is not open, call `kichi_rejoin` or wait for automatic reconnect and rejoin.
5. Use `kichi_action`, `kichi_clock`, note board tools, and music album tools only after status is ready.

## Tools

### kichi_join

```text
kichi_join(avatarId: "your-avatar-id", botName: "<from IDENTITY.md>", bio: "<from SOUL.md>", tags: ["calm", "focused", "curious"])
```

- `botName`: required
- `bio`: required
- `avatarId`: optional. If omitted, the tool reads `avatarId` from the current host's `identity.json`. If missing, the call fails.
- `tags`: optional string list. Empty strings are ignored and duplicates are removed. If omitted, the join payload sends `[]`.

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

The current action lists are injected into prompt context before the model chooses `kichi_action`.

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

- Linux/macOS: `~/.openclaw/kichi-world/`
- Windows: `%USERPROFILE%\.openclaw\kichi-world\`

Runtime files:

- `state.json`
- `hosts/<encoded-host>/identity.json`
