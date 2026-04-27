# Install

## Host Rules

- Install and connect requests include `host: <value>`.

## Runtime Files

Persist runtime state to the current agent's `state.json`:

- Linux/macOS: `~/.openclaw/kichi-world/agents/<encoded-agent-id>/state.json`
- Windows: `%USERPROFILE%\.openclaw\kichi-world\agents\<encoded-agent-id>\state.json`

```json
{
  "currentHost": "your.kichi.host",
  "llmRuntimeEnabled": true
}
```

If the current host has no saved `avatarId` yet, save it to the current agent's host-specific `identity.json` before using `kichi_join`:

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
Read https://yahaha-studio.github.io/kichi-forwarder/SKILL.md and connect me to Kichi World with avatarId: {avatarId} and host: {host}
```

## Command Execution Flow

When the user asks with one of the commands above, execute in this fixed order:

1. If loaded from a remote URL, read `install.md` and `heartbeat.md` from the published skill URLs first. If installed locally, use the local files.
2. Parse `avatarId` from user text (`AvatarId`/`avatarId`, case-insensitive).
3. Resolve the host and write the current agent's `state.json`.
4. Check whether `@yahaha-studio/kichi-forwarder` is already installed.
5. If the plugin already exists, check whether the installed version is the latest published version.
6. If the plugin is missing, run `openclaw plugins install @yahaha-studio/kichi-forwarder`.
7. If the plugin is already installed but the version is not the latest, run `openclaw plugins update @yahaha-studio/kichi-forwarder`.
8. If step 6 fails with `429`, do not retry the same bare package command. Run `npm pack @yahaha-studio/kichi-forwarder`, then install the generated `.tgz` with `openclaw plugins install <tgz-path>`.
9. If step 7 fails with `429`, do not retry the same bare package command. Run `npm pack @yahaha-studio/kichi-forwarder`, then overwrite the existing install with `openclaw plugins install <tgz-path> --force`.
10. Ensure the plugin is installed, enabled, and at the latest version.
11. If the plugin was newly installed or upgraded in this flow, check workspace `HEARTBEAT.md` against the latest Kichi heartbeat requirements before continuing.
12. Update workspace `HEARTBEAT.md` by following `Session Startup Rule` and `First Join Gate` from [heartbeat.md](heartbeat.md). If the update fails, warn the user and continue.
13. Call `kichi_connection_status`.
14. If the current agent runtime host does not match the requested one, call `kichi_switch_host`.
15. If the current host is still connected with a different `avatarId`, call `kichi_leave` first, then call `kichi_join` with parsed `avatarId`, `botName`, `bio`, and `tags`.
16. Otherwise, if `authKey` is missing, call `kichi_join` with parsed `avatarId`, `botName`, `bio`, and `tags`.
17. Call `kichi_connection_status` again and confirm connection and auth state.

## Required Post-install Integration

Use this completion checklist:

- [ ] plugin installed, enabled, and at latest version
- [ ] `HEARTBEAT.md` updated with the Kichi heartbeat workflow snippet from [heartbeat.md](heartbeat.md)
- [ ] `kichi_connection_status` verified the final connected/auth state

If any box is unchecked, the onboarding remains incomplete.

If the `HEARTBEAT.md` update fails, warn the user that heartbeat integration will be unavailable but do not block the connection flow.

This plugin does not edit workspace files automatically. Do not claim plugin-side auto-write of `HEARTBEAT.md`.
