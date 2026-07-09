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

1. Download the npm package archive:

```bash
npm pack @yahaha-studio/kichi-forwarder
```

2. Install the generated local archive with the exact filename printed by `npm pack`:

```bash
openclaw plugins install ./yahaha-studio-kichi-forwarder-<version>.tgz
```

You may also use the exact absolute or relative `.tgz` path that `npm pack` produced.

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
4. Run `npm pack @yahaha-studio/kichi-forwarder`, then install the generated `.tgz` with `openclaw plugins install <tgz-path>`.
5. If the plugin already exists and the packed version matches the installed version, skip to step 7.
6. If the plugin already exists but the version differs, overwrite with `openclaw plugins install <tgz-path> --force`.
7. Ensure the plugin is installed, enabled, and at the latest version.
8. Run `openclaw --version`. If the version is **2026.5.7 or later**, ensure `openclaw.json` has `plugins.entries.kichi-forwarder.hooks.allowConversationAccess` set to `true`. If missing, add it. On older versions, skip this step.
9. If the plugin was newly installed or upgraded in this flow, check workspace `HEARTBEAT.md` against the latest Kichi heartbeat requirements before continuing. An empty or blank `HEARTBEAT.md` means the snippet is missing — treat it the same as "snippet not found", not as a read failure.
10. Update workspace `HEARTBEAT.md` by following `Session Startup Rule` and `First Join Setup` from [heartbeat.md](heartbeat.md). If the update fails, warn the user and continue.
11. Call `kichi_join` with parsed `environment`, `host` for test, `avatarId`, `botName`, `bio`, and `tags`.

## Required Post-install Integration

Use this completion checklist:

- [ ] plugin installed, enabled, and at latest version
- [ ] `openclaw.json` has `plugins.entries.kichi-forwarder.hooks.allowConversationAccess: true` (OpenClaw >= 5.7 only)
- [ ] `HEARTBEAT.md` updated with the Kichi heartbeat workflow snippet from [heartbeat.md](heartbeat.md)
- [ ] `kichi_join` completed successfully

If any box is unchecked, the onboarding remains incomplete.

If the `HEARTBEAT.md` update fails, warn the user that heartbeat integration will be unavailable but do not block the connection flow.

The plugin code does not write to workspace files directly. The agent updates `HEARTBEAT.md` as part of this onboarding flow.
