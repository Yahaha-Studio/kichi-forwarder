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

Call `await service.sendEnvironmentControl({ weather: "Rainy", time: "Night" })` to update the user's Kichi world. Supply either field or both; omitted fields keep their current values. Weather is `Sunny`, `Cloudy`, `Rainy`, or `Snowy`; time is `Auto`, `Morning`, `Day`, `Evening`, or `Night`. `Auto` restores automatic world time. This is separate from the focus timer controlled by `sendClock`.

Core validates the patch and sends `kichi_environment` with an `environment` object over the authenticated WebSocket connection. The server forwards it through `OnServerControl` and returns `kichi_environment_ack`. Invalid input, missing identity, connection failure, timeout, and rejected requests fail explicitly. A successful ACK confirms server forwarding only; it does not confirm that the client has applied the change. This requires the corresponding server WebSocket handler and a client with `ServerControlNotify` support.

## Incoming messages

`onBotMessageReceived` has the signature `(service, message) => void`. Core dispatches `bot_message_received` payloads to it and records the incoming bot message. The adapter routes the message to the matching platform session and decides how that platform processes or replies to it. Receiving a bot message is distinct from receiving a user's platform input.

## Delivery and errors

| API | Confirmation boundary |
| --- | --- |
| `sendHookNotify`, `sendStatus`, `sendAction` | No ACK is awaited. Missing identity or a closed socket causes the send to be skipped. Calling the method does not prove delivery or application. |
| `sendStatusVerified` | Waits for `status_ack` and rejects on connection failure or timeout. |
| `queryStatus` | Waits for `query_status_result`; use the returned data when current Kichi state is needed. |
| `join` | Resolves with `JoinResult`; check `success` and report its error on failure. |

Core handles reconnection and pending-request lifetimes. Adapters should expose connection failures, failed results and rejected requests to their host's error reporting. Do not report an unacknowledged notification as a confirmed action, or replace a failed operation with a success response.
