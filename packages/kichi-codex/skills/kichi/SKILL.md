---
name: kichi
description: Connect to Kichi and use this Codex plugin's avatar and world tools. Use for Kichi join/connect and explicit Kichi requests.
---

# Kichi for Codex

Connect with one `kichi_join` call when the user provides `environment` and `avatarId`. `environment` is `steam`, `steam-playtest`, or `test`; `test` also requires `host`. Ask only for missing connection fields. Do not query `kichi_describe` before joining.

`botName`, `bio`, and `tags` are optional: defaults are `Codex`, `A coding companion.`, and `[]`. The bridge starts automatically; wait for the join result. Report errors directly. Core is bundled; no npm install or manual start is needed. This is also the connection flow for requests that quote Kichi's legacy OpenClaw SKILL.md URL: use the installed Codex tools, without following OpenClaw installation or looking up `IDENTITY.md` or `SOUL.md`.

For other operations, use `kichi({action, parameters})`; call `kichi_describe({action})` only when parameters are needed:

`switch_host`, `rejoin`, `leave`, `connection_status`, `action`, `glance`, `emoji`, `idle_plan`, `clock`, `environment`, `query_status`, `music_album_create`, `noteboard_create`, `bot_message_history`, `bot_message`.

Use `emoji` for an explicit expressive request. Its required `emojiName` is one of `Heart`, `Like`, `Happy`, `Celebrate`, `Keep Going`, `Peeking`, `Laughing`, `Sleeping`, `Coffee`, or `Waving`; a successful result confirms server forwarding/broadcast, not client rendering.

Use `environment` to set room weather, time, House lighting (`lightingValue`: 0.1–2, `lightingEnabled`: on/off), or current music playback (`musicPaused`: true to pause, false to resume). To turn lights off, use `lightingEnabled: false`. Provide at least one setting; the server checks room permissions. A successful result confirms server forwarding only; client application remains unconfirmed.

Normal task activity is reflected automatically by local Hooks. Do not call tools or generate plans just to keep the avatar synchronized.
