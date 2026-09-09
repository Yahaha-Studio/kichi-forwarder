# Kichi Core

`@yahaha-studio/kichi-core` provides the shared Kichi capabilities used by platform adapters: server connections and identity, avatar actions and status, clocks, notes, music, daily schedules, and bot messages.

It depends on `ws` and does not depend on OpenClaw or any platform adapter. The package includes built JavaScript, TypeScript declarations, and the Kichi action, music, and environment configuration.

## Using the core

```ts
import { KichiForwarderService } from "@yahaha-studio/kichi-core";
```

Construct the service with a logger and `{ agentId, runtimeDir, resolveEnvironmentHost }`. The adapter supplies its own runtime directory and maps its platform identity to `agentId`. Start and stop the service with the adapter's lifecycle; set `onBotMessageReceived` to handle incoming Kichi bot messages.

The same entry point exposes server payload types, host normalization, action and music catalogs, and clock, idle-plan, and daily-schedule validation. Platform tool schemas, prompts, and event-trigger rules belong to the adapter.

The existing KichiServer WebSocket endpoint is `/ws/openclaw`; it is the server wire contract used by all adapters. Core does not select an OpenClaw storage directory or load the OpenClaw SDK.
