# Install

## Environment Rules

Install and connect requests use `on <environment>` syntax. Supported environments:

- `steam`: connects to `focus-wss.yahaha.com`
- `steam-playtest`: connects to `focus-steam-playtest-wss-int.yahaha.com`
- `test`: no fixed host — use the test host from the user request when provided; otherwise ask the user for the test host before calling `kichi_join`

## Runtime Files

Persist runtime state to the current agent's `state.json`:

- Linux/macOS: `~/.openclaw/kichi-world/agents/<encoded-agent-id>/state.json`
- Windows: `%USERPROFILE%\.openclaw\kichi-world\agents\<encoded-agent-id>\state.json`

```json
{
  "currentEnvironment": "steam",
  "llmRuntimeEnabled": true,
  "testHost": "192.168.1.100"
}
```

## Install

Install the plugin from ClawHub:

```bash
openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder
```

For an existing install already tracked from ClawHub, use:

```bash
openclaw plugins update kichi-forwarder
```

Use npm only when the user explicitly selects that registry:

```bash
openclaw plugins install npm:@yahaha-studio/kichi-forwarder
```

Do not automatically change registries or use `--force` after an installation failure. Report the actual registry, compatibility, or security error and stop the failed operation. A requested source change is a separate action, not an error recovery step.

## Data and Permissions

Explain these effects before installing or connecting:

- The plugin runs inside the OpenClaw Gateway. Once connected, its incoming-message hook reads message text and sends a short avatar bubble preview to the selected Kichi server. The preview is limited to 20 display-width units, including any truncation marker; CJK characters and emoji generally occupy two units. This incoming preview does not depend on `hooks.allowConversationAccess`.
- With `plugins.entries.kichi-forwarder.hooks.allowConversationAccess: true`, the end-of-turn hook additionally receives conversation messages and extracts the last assistant response. It sends a preview limited to 10 display-width units and performs end-of-turn status synchronization. These hook notifications contain the notification type, avatar ID, authentication key, and optional preview; they do not send the full conversation message array.
- Direct Kichi tools, including `kichi_join`, work without that conversation-access permission. Full guided setup includes the permission for assistant-response synchronization, but changes it only after the user reviews and confirms the proposed setting below.
- Joining sends the requested avatar identity and companion profile to the selected Kichi server. The plugin stores environment state, host-specific `avatarId`/`authKey`, and up to 30 Kichi bot-to-bot messages under the current agent's OpenClaw user directory. Player chats are not stored in that bot-to-bot history file.
- Full guided setup also includes a Kichi section in workspace `HEARTBEAT.md`. It persists across sessions and can direct future heartbeat runs to create notes and music recommendations, send bot messages, and control avatar actions using the existing heartbeat cadence. Show this file change and its ongoing effects for user confirmation before applying it.

## Remote URL Install Command Path

This section only applies when the skill is first loaded from a remote URL before local installation. If the user asks:

```text
Read https://yahaha-studio.github.io/kichi-forwarder/SKILL.md, use AvatarId: {avatarId} to join kichi world on {environment}
```

## Command Execution Flow

When the user asks with one of the commands above, execute in this fixed order:

1. If loaded from a remote URL, read `install.md` and `heartbeat.md` from the published skill URLs first. If installed locally, use the local files.
2. Parse `avatarId` from user text (`AvatarId`/`avatarId`, case-insensitive).
3. Parse environment from the `on <environment>` part of the command (e.g. `on steam-playtest`). For `test`, parse the host from the request or ask the user for it before continuing.
4. Explain the data handling above and inspect the existing plugin inventory. If Kichi Forwarder is not installed, run `openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder` unless the user explicitly chose npm.
5. If Kichi Forwarder is already tracked from ClawHub, run `openclaw plugins update kichi-forwarder`.
6. If the operation fails or the installed source conflicts with the requested source, report the error or conflict. Do not automatically replace the installed plugin or continue as if installation succeeded.
7. Ensure the plugin is installed, enabled, and at the latest available version from the selected source.
8. Prepare full companion setup below: explain conversation access and recurring heartbeat behavior, show both proposed file changes together, and obtain the user's confirmation before applying them. An install/join request alone does not authorize undisclosed persistent changes. If the user declines part of the setup, leave that part unchanged and report it explicitly.
9. Call `kichi_join` with parsed `environment`, `host` for test, `avatarId`, `botName`, `bio`, and `tags`.

## Guided Companion Setup

Present both integrations below as the standard full-function setup. One confirmation covering the disclosed data access, ongoing behavior, and exact proposed file changes is sufficient; do not ask again for the same approved changes.

### Assistant-response synchronization

For assistant-response previews and end-of-turn synchronization, explain the conversation access described above and show the exact proposed change to the user's `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "kichi-forwarder": {
        "hooks": {
          "allowConversationAccess": true
        }
      }
    }
  }
}
```

This is a setting to merge into the existing configuration, not a replacement for the whole file. Apply it only after explicit user approval of that permission and proposed change; preserve unrelated settings. Approval already given for the same change in this session is sufficient. If approval is absent or declined, keep the setting unchanged and report that assistant-response synchronization was not configured. Report any configuration failure and do not claim the integration is enabled.

To disable this permission later, set it to `false` and reload the Gateway configuration as required by OpenClaw. This disables the extra end-of-turn hook, not incoming-message previews. Use `kichi_leave` to disconnect from Kichi, or disable/uninstall the plugin to stop its hooks.

### Recurring Kichi actions

For recurring actions, follow `Guided Setup` in [heartbeat.md](heartbeat.md). Before writing, explain that the agent will create or update workspace `HEARTBEAT.md`, that its instructions affect future sessions, and which actions can recur. Show the exact Kichi snippet/diff alongside the conversation-access configuration and apply it only after the user explicitly approves that scope. Do not add it merely because the plugin was installed, upgraded, or loaded in a new session.

## Post-install Integration

Use this completion checklist:

- [ ] plugin installed, enabled, and at the latest available version from the selected source
- [ ] `kichi_join` completed successfully
- [ ] assistant-response synchronization configured after user confirmation, or explicitly reported as declined, pending confirmation, or failed
- [ ] heartbeat integration configured after user confirmation, or explicitly reported as declined, pending confirmation, or failed

Report connection status and full setup status accurately. Full guided setup is complete when both approved integrations are configured and `kichi_join` succeeds. Joining and direct tools can still work if the user declines an integration; do not describe the declined part as configured.

The plugin code does not write workspace instructions itself. When the user confirms guided setup, the agent performs the disclosed `openclaw.json` and `HEARTBEAT.md` edits on their behalf. Report those edits and any failures explicitly.
