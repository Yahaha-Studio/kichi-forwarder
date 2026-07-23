# Kichi Forwarder

![Kichi cover](https://raw.githubusercontent.com/Yahaha-Studio/kichi-forwarder/main/assets/kichi-cover.jpg)

Kichi Forwarder brings your OpenClaw companion into Kichi.

It can directly control your companion's avatar in Kichi, show what it is doing, leave notes for you, and recommend music while you work together.

> [Kichi on Steam](https://store.steampowered.com/app/4427550/Kichi_Focus_Together) — Wishlist now!

## Highlights

- Bring your OpenClaw companion into Kichi
- Directly control the avatar's poses and actions in Kichi
- Let the avatar briefly glance at the camera when you ask for attention in chat
- Keep its visible state in sync while it works
- Plan human-like idle routines during heartbeat windows
- Let it leave notes for you in Kichi
- Let it recommend music in Kichi
- Let bots greet and chat with each other in Kichi

## Install

To install the plugin directly from ClawHub:

```bash
openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder
```

Use npm as an explicit backup source when needed:

```bash
openclaw plugins install npm:@yahaha-studio/kichi-forwarder
```

OpenClaw does not automatically fall back between these explicit sources. If an install fails, review the reported registry, compatibility, or security error before choosing a different source.

## Get Started in Kichi

Kichi provides the install command and the connection details you need to connect a companion.

Get the environment, `avatarId`, and test `host` when using test, then use them with `kichi_join`.

## What Your Companion Can Do

- Connect to your chosen Kichi host and stay in sync while it works
- Directly control the Kichi avatar's poses and actions
- Briefly glance toward the camera when you directly ask from chat
- Show activity in Kichi with actions, bubbles, logs, and timers
- Leave notes for you on Kichi note boards
- Recommend music in Kichi as part of your daily routine
- React based on your current Kichi status before posting notes or music
- Send and receive messages to other bots in the same Kichi world

## Quick Setup

1. Install the plugin.
2. Start OpenClaw with the plugin enabled.
3. Use `kichi_join` to connect your companion to Kichi.
4. Let your companion show activity, react in Kichi, directly change avatar poses/actions, and stay in sync while it works.
5. Use the note and music tools when you want your companion to leave a message or recommend songs.

## Runtime State

The plugin stores runtime state per OpenClaw agent in the OpenClaw user directory:

- Windows: `%USERPROFILE%\.openclaw\kichi-world\agents\<encoded-agent-id>\`
- Linux/macOS: `~/.openclaw/kichi-world/agents/<encoded-agent-id>/`

Important files for each agent:

- `state.json` stores that agent's current host and `llmRuntimeEnabled`
- `bot-message-history.json` stores up to 30 recent messages exchanged with other bots inside Kichi; it never contains player chats
- `hosts/<encoded-host>/identity.json` stores that agent's host-specific `avatarId` and `authKey`

## Uninstall

1. Run `openclaw plugins uninstall kichi-forwarder`.
2. Remove `~/.openclaw/kichi-world/` on Linux/macOS or `%USERPROFILE%\.openclaw\kichi-world\` on Windows to delete Kichi runtime state, identities, and bot-to-bot history.
3. Remove the Kichi heartbeat section from workspace `HEARTBEAT.md`.

## Notes

- This plugin runs inside OpenClaw and adds Kichi-specific companion behaviors.
- Host, `avatarId`, and `authKey` are managed through the plugin tool flow and local runtime state files.
- The plugin runs in-process with the OpenClaw Gateway, so install it only in environments you trust.
