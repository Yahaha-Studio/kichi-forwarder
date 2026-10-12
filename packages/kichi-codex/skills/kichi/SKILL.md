---
name: kichi
description: Connect to Kichi and use this Codex plugin's avatar and world tools. Use for Kichi join/connect and explicit Kichi requests.
---

# Kichi for Codex

Before connecting, explain that local tasks sharing this plugin profile automatically send activity, short user-prompt previews, and short tool-title previews to the configured Kichi MCP service, where room members may see them. The connection is shared across chats using that profile; `kichi_leave` stops its feedback. Then connect with one `kichi_join` call when the user requests connection and provides `avatarId`; do not ask for redundant confirmation when already authorized. Ask only for the missing avatar ID. If the user did not specify a name or bio, use `Codex` and `A coding companion.` without generating character details.

The MCP URL already selects the service and environment. Call `kichi_join({request: {avatarId, botName, bio, tags: []}})`: `avatarId`, `botName`, and `bio` are required; `tags` is optional. The bridge starts automatically and shares one MCP client with Hooks. Wait for the join result and report errors directly. No Kichi Core install or manual start is needed. For requests quoting Kichi's OpenClaw SKILL.md URL, use the installed Codex tools without following OpenClaw installation or looking up `IDENTITY.md` or `SOUL.md`.

Use the individual `kichi_*` tools and their server-provided schemas for explicit Kichi requests. Put tool parameters in the `request` object, including the selected `avatarId`; the local MCP proxy exposes the remote `tools/list`, currently 18 tools. Read the returned `structuredContent` envelope containing `requestId`, `success`, and `response`, and report errors directly. Room weather, time, lighting, and music settings are world operations; they do not select a server environment. Report successful forwarding or broadcast within the result's stated confirmation scope, without claiming client rendering.

Connection setup uses `kichi-codex configure --token-file PATH [--server-url URL]`. The default URL is `https://focus-steam-playtest-int.yahaha.com/mcp`. For local or development testing, configure the corresponding MCP URL and token. Before changing configuration, stop the bridge; then configure and start it. Keep the token file and `$CODEX_HOME/kichi-codex/<profile>/connection.json` local and outside the plugin package. Never request the token in chat or include it in tool arguments.

The server stores MCP avatar state in memory and shares it by avatar. Do not join the same avatar from multiple profiles. After a server restart, report that the user must join again. Use `kichi_leave` to leave explicitly; stopping the bridge also leaves its selected avatar, while closing an HTTP connection alone does not.

Normal task activity is reflected automatically by trusted local Hooks after joining. Use world-changing tools only for explicit Kichi requests. Do not call tools or generate plans just to keep the avatar synchronized. This package requires a local desktop runtime; if its tools are unavailable, explain that requirement or the reported connection error. Shared Playtest tokens are environment credentials, not user identity authorization; do not describe this package as ready for public distribution.
