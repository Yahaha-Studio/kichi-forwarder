# Install

## Environment Rules

Install and connect requests use `on <environment>` syntax. Supported environments:

- `steam`: connects to `focus-wss.yahaha.com`
- `steam-playtest`: connects to `focus-steam-playtest-wss-int.yahaha.com`
- `test`: no fixed host — ask the user for the current test node host, write it to the plugin's `config/environments.json`, then connect

## Runtime Files

Persist runtime state to the current agent's `state.json`:

- Linux/macOS: `~/.openclaw/kichi-world/agents/<encoded-agent-id>/state.json`
- Windows: `%USERPROFILE%\.openclaw\kichi-world\agents\<encoded-agent-id>\state.json`

```json
{
  "currentEnvironment": "steam",
  "llmRuntimeEnabled": true
}
```

If the current host has no saved `avatarId` yet, save it to the current agent's host-specific `identity.json` (this helps `kichi_join` resolve the avatar automatically when `avatarId` is omitted):

- Linux/macOS: `~/.openclaw/kichi-world/agents/<encoded-agent-id>/hosts/<encoded-host>/identity.json`
- Windows: `%USERPROFILE%\.openclaw\kichi-world\agents\<encoded-agent-id>\hosts\<encoded-host>\identity.json`

```json
{
  "avatarId": "your-avatar-id"
}
```

## Install

```bash
openclaw plugins install @yahaha-studio/kichi-forwarder
```

If this command fails with `429` or `ClawHub ... failed (429)`, do not retry the same command. Install from a local npm archive instead.

## 429 Bypass Install Path

1. Download the npm package archive:

```bash
npm pack @yahaha-studio/kichi-forwarder
```

2. Install the generated local archive with the exact filename printed by `npm pack`:

```bash
openclaw plugins install ./yahaha-studio-kichi-forwarder-<version>.tgz
```

You may also use the exact absolute or relative `.tgz` path that `npm pack` produced. The local archive path bypasses the preferred ClawHub lookup.

## Remote URL Install Command Path

This section only applies when the skill is first loaded from a remote URL before local installation. If the user asks:

```text
Read https://yahaha-studio.github.io/kichi-forwarder/SKILL.md, use AvatarId: {avatarId} to join kichi world on {environment}
```

## Command Execution Flow

When the user asks with one of the commands above, execute in this fixed order:

1. If loaded from a remote URL, read `install.md` and `heartbeat.md` from the published skill URLs first. If installed locally, use the local files.
2. Parse `avatarId` from user text (`AvatarId`/`avatarId`, case-insensitive).
3. Parse environment from the `on <environment>` part of the command (e.g. `on steam-playtest`). Write the current agent's `state.json`.
4. Run `openclaw plugins install @yahaha-studio/kichi-forwarder`.
5. If step 4 succeeds, the plugin is installed and up-to-date — skip to step 9.
6. If step 4 fails because the plugin already exists, check whether the installed version is the latest published version. If the version is already the latest, skip to step 9. If not, run `openclaw plugins update @yahaha-studio/kichi-forwarder`.
7. If step 4 fails with `429`, do not retry the same bare package command. Run `npm pack @yahaha-studio/kichi-forwarder`, then install the generated `.tgz` with `openclaw plugins install <tgz-path>`.
8. If step 6 update fails with `429`, do not retry the same bare package command. Run `npm pack @yahaha-studio/kichi-forwarder`, then overwrite the existing install with `openclaw plugins install <tgz-path> --force`.
9. Ensure the plugin is installed, enabled, and at the latest version.
10. If the plugin was newly installed or upgraded in this flow, check workspace `HEARTBEAT.md` against the latest Kichi heartbeat requirements before continuing. An empty or blank `HEARTBEAT.md` means the snippet is missing — treat it the same as "snippet not found", not as a read failure.
11. Update workspace `HEARTBEAT.md` by following `Session Startup Rule` and `First Join Setup` from [heartbeat.md](heartbeat.md). If the update fails, warn the user and continue.
12. Call `kichi_connection_status`.
13. If the current agent runtime environment does not match the requested one, call `kichi_switch_host` with the target environment (and host for test).
14. If the current host is still connected with a different `avatarId`, call `kichi_leave` first, then call `kichi_join` with parsed `avatarId`, `botName`, `bio`, and `tags`.
15. Otherwise, if `authKey` is missing, call `kichi_join` with parsed `avatarId`, `botName`, `bio`, and `tags`.
16. Call `kichi_connection_status` again and confirm connection and auth state.

## Required Post-install Integration

Use this completion checklist:

- [ ] plugin installed, enabled, and at latest version
- [ ] `HEARTBEAT.md` updated with the Kichi heartbeat workflow snippet from [heartbeat.md](heartbeat.md)
- [ ] `kichi_connection_status` verified the final connected/auth state

If any box is unchecked, the onboarding remains incomplete.

If the `HEARTBEAT.md` update fails, warn the user that heartbeat integration will be unavailable but do not block the connection flow.

The plugin code does not write to workspace files directly. The agent updates `HEARTBEAT.md` as part of this onboarding flow.
