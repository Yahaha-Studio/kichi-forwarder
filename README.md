# Kichi Forwarder

![Kichi cover](https://raw.githubusercontent.com/Yahaha-Studio/kichi-forwarder/main/assets/kichi-cover.jpg)

Kichi Forwarder connects AI companions to Kichi through a shared capability core and platform adapters.

The included OpenClaw adapter brings your OpenClaw companion into Kichi.

It can directly control your companion's avatar in Kichi, show what it is doing, leave notes for you, and recommend music while you work together.

> [Kichi on Steam](https://store.steampowered.com/app/4427550/Kichi_Focus_Together) — Wishlist now!

## Highlights

- Bring your OpenClaw companion into Kichi
- Directly control the avatar's poses and actions in Kichi
- Let the avatar briefly glance at the camera when you ask for attention in chat
- Let the avatar show a supported emoji above its head when you ask for an expressive reaction
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
- Show a supported head emoji on an explicit request
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

## Architecture

The repository is a private npm workspace containing two independently published packages:

| Package | Directory | Runtime dependencies |
| --- | --- | --- |
| `@yahaha-studio/kichi-core` | `packages/kichi-core` | `ws` |
| `@yahaha-studio/kichi-forwarder` | `packages/kichi-openclaw` | `@yahaha-studio/kichi-core` |

The OpenClaw adapter also declares `openclaw` as a host peer dependency. Its SDK imports must resolve to the running OpenClaw installation. Core has no such requirement.

Core exposes the Kichi service, server message types, bundled configuration, and domain validation. Its published package includes JavaScript and TypeScript declarations. It has no dependency on OpenClaw or any adapter.

The OpenClaw package owns plugin registration, tool schemas and result formatting, prompts, lifecycle hooks, bot-message agent runs, agent/session resolution, and skills. It selects the existing `.openclaw/kichi-world` storage paths and applies OpenClaw join-source rules. Its package name, plugin manifest, installation commands, and runtime data paths remain the same.

Installing the OpenClaw package installs Core through its declared npm dependency. A future adapter can depend on Core directly without installing the OpenClaw package. The adapter's SDK is supplied by its OpenClaw host peer; Core does not require it. Repository development dependencies are not bundled in either package.

A new adapter imports `@yahaha-studio/kichi-core` and creates a `KichiForwarderService` with a logger, an agent identifier, a runtime directory, and an environment host resolver. It owns the service lifecycle and handles incoming bot messages through `onBotMessageReceived`.

Core connects all platform adapters through the `/ws/agent` WebSocket endpoint. The server also retains `/ws/openclaw` for existing clients; both endpoints use the same handler and message protocol.

Run `npm ci` from the repository root to install workspace dependencies, then `npm run build` to build Core followed by OpenClaw. Each package regenerates its own `dist/` directory.

After building, run `npm test` for the pre-refactor OpenClaw tool and hook contracts and an isolated local WebSocket round trip covering core identity, request handling, bot history, rejoin, and leave. Tests use a temporary home directory and do not connect to a real Kichi host or OpenClaw agent.

## Packaging and publishing

Create each installation archive from the repository root:

```bash
npm pack --workspace=@yahaha-studio/kichi-core
npm pack --workspace=@yahaha-studio/kichi-forwarder
```

For a release, publish Core first, then publish the OpenClaw package with its Core dependency set to that published version. The repository root is private and is not an installation package.

Until Core is published to the registry, local installation requires both archives. For a Linux test machine with OpenClaw already installed, put the archives in a persistent installation directory and run:

```bash
npm init -y
npm install --ignore-scripts --legacy-peer-deps ./yahaha-studio-kichi-core-0.2.0-beta.3.tgz ./yahaha-studio-kichi-forwarder-0.2.0-beta.3.tgz
kichi_host_root="$(dirname "$(readlink -f "$(command -v openclaw)")")"
mkdir -p node_modules/@yahaha-studio/kichi-forwarder/node_modules
ln -s "$kichi_host_root" node_modules/@yahaha-studio/kichi-forwarder/node_modules/openclaw
openclaw plugins install --link ./node_modules/@yahaha-studio/kichi-forwarder
```

`--legacy-peer-deps` leaves the host peer for the explicit link to the existing OpenClaw installation. The host path above assumes the `openclaw` command resolves to the package's `openclaw.mjs` entry. Keep this directory and link available, then restart the Gateway. `--link` registers the plugin path; it does not supply the host SDK for a separately installed local package.

Once published, installing the OpenClaw package through the managed npm install flow resolves Core automatically and uses the OpenClaw host peer.
