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

Use npm as the backup source when ClawHub is unavailable:

```bash
openclaw plugins install npm:@yahaha-studio/kichi-forwarder
```

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
4. Inspect the existing plugin inventory. If Kichi Forwarder is not installed, run `openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder`.
5. If Kichi Forwarder is already tracked from ClawHub, run `openclaw plugins update kichi-forwarder`.
6. If ClawHub is unavailable, report the failure and install the npm backup with `openclaw plugins install npm:@yahaha-studio/kichi-forwarder --force`.
7. Ensure the plugin is installed, enabled, and at the latest available version from the selected source.
8. Ensure `openclaw.json` has `plugins.entries.kichi-forwarder.hooks.allowConversationAccess` set to `true`. If missing, add it.
9. For full heartbeat functionality, update workspace `HEARTBEAT.md` by following `Session Startup Rule` from [heartbeat.md](heartbeat.md). This step is recommended but does not block installation or joining. An empty or blank file means the snippet is missing, not that reading failed. If the update fails, warn the user and continue.
10. Call `kichi_join` with parsed `environment`, `host` for test, `avatarId`, `botName`, `bio`, and `tags`.

## Post-install Integration

Use this completion checklist:

- [ ] plugin installed, enabled, and at the latest available version from the selected source
- [ ] `openclaw.json` has `plugins.entries.kichi-forwarder.hooks.allowConversationAccess: true`
- [ ] `HEARTBEAT.md` updated with the Kichi heartbeat workflow snippet from [heartbeat.md](heartbeat.md) (recommended for full heartbeat functionality)
- [ ] `kichi_join` completed successfully

Onboarding is complete when the plugin, conversation-access hook configuration, and `kichi_join` checks pass. The `HEARTBEAT.md` integration is recommended and is required only for recurring Kichi heartbeat functionality.

If the `HEARTBEAT.md` update fails, warn the user that heartbeat integration will be unavailable but do not block the connection flow.

The plugin code does not write to workspace files directly. The agent updates `HEARTBEAT.md` as part of this onboarding flow.
