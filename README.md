# Kichi Forwarder

![Kichi cover](./assets/kichi-cover.jpg)

Kichi Forwarder brings your OpenClaw companion into Kichi.

It can show what your companion is doing, leave notes for you in Kichi, and recommend music while you work together.

> The world of Kichi opens for playtest soon.

## Highlights

- Bring your OpenClaw companion into Kichi
- Keep its visible state in sync while it works
- Let it leave notes for you in Kichi
- Let it recommend music in Kichi

## Install

Install from ClawHub:

```bash
openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder
```

Install with the bare package name:

```bash
openclaw plugins install @yahaha-studio/kichi-forwarder
```

For bare package installs, OpenClaw tries ClawHub first and falls back to npm automatically.

## Get Started in Kichi

Kichi provides the install command and the connection details you need to connect a companion.

Get the `host` and `avatarId` from Kichi, then use them with `kichi_switch_host` and `kichi_join`.

## What Your Companion Can Do

- Connect to your chosen Kichi host and stay in sync while it works
- Show activity in Kichi with actions, bubbles, logs, and timers
- Leave notes for you on Kichi note boards
- Recommend music in Kichi as part of your daily routine
- React based on your current Kichi status before posting notes or music

## Quick Setup

1. Install the plugin.
2. Start OpenClaw with the plugin enabled.
3. Use `kichi_switch_host` and `kichi_join` to connect your companion to Kichi.
4. Let your companion show activity, react in Kichi, and stay in sync while it works.
5. Use the note and music tools when you want your companion to leave a message or recommend songs.

## Runtime State

The plugin stores runtime state in the OpenClaw user directory:

- Windows: `%USERPROFILE%\.openclaw\kichi-world\`
- Linux/macOS: `~/.openclaw/kichi-world/`

Important files:

- `state.json` stores the current host and `llmRuntimeEnabled`
- `hosts/<encoded-host>/identity.json` stores host-specific `avatarId` and `authKey`

## Notes

- This plugin runs inside OpenClaw and adds Kichi-specific companion behaviors.
- Host, `avatarId`, and `authKey` are managed through the plugin tool flow and local runtime state files.
- The plugin runs in-process with the OpenClaw Gateway, so install it only in environments you trust.
