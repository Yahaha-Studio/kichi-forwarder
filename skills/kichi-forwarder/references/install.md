# Install

## Host Rules

- Install and connect requests include `host: <value>`.

## Runtime Files

Persist runtime state to `state.json`:

- Linux/macOS: `~/.openclaw/kichi-world/state.json`
- Windows: `%USERPROFILE%\.openclaw\kichi-world\state.json`

```json
{
  "currentHost": "your.kichi.host",
  "llmRuntimeEnabled": true
}
```

Save `avatarId` to the host-specific `identity.json` before using `kichi_join`:

- Linux/macOS: `~/.openclaw/kichi-world/hosts/<encoded-host>/identity.json`
- Windows: `%USERPROFILE%\.openclaw\kichi-world\hosts\<encoded-host>\identity.json`

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

## Remote URL Install Command Path (Non-skippable)

If the user asks:

```text
Read https://yahaha-studio.github.io/kichi-forwarder/SKILL.md and connect me to Kichi World with avatarId: {avatarId} and host: {host}
```

## Command Execution Flow

When the user asks with one of the commands above, execute in this fixed order:

1. Read `install.md` and `heartbeat.md` from the published skill URLs before any tool call.
2. Parse `avatarId` from user text (`AvatarId`/`avatarId`, case-insensitive).
3. Resolve the host and write `state.json`.
4. Run `openclaw plugins install @yahaha-studio/kichi-forwarder`.
5. If step 4 fails with `429`, do not retry the same bare package command. Run `npm pack @yahaha-studio/kichi-forwarder`, then install the generated `.tgz` with `openclaw plugins install <tgz-path>`.
6. Ensure the plugin is installed and enabled.
7. Update workspace `HEARTBEAT.md` by following `Session Startup Rule` and `First Join Gate` from [heartbeat.md](heartbeat.md).
8. If `HEARTBEAT.md` was not updated successfully, report setup as incomplete and stop immediately. Do not continue to `kichi_status` or `kichi_join`.
9. Call `kichi_status`.
10. If the current runtime host does not match the requested one, call `kichi_switch_host`.
11. If `authKey` is missing, call `kichi_join` with parsed `avatarId`, `botName`, `bio`, and `tags`.
12. Call `kichi_status` again and confirm connection and auth state.

## Required Post-install Integration

Use this completion checklist:

- [ ] plugin installed and enabled
- [ ] `HEARTBEAT.md` updated with the Kichi heartbeat workflow snippet from [heartbeat.md](heartbeat.md)
- [ ] `kichi_status` verified the final connected/auth state

If any box is unchecked, the onboarding remains incomplete.

If writing `HEARTBEAT.md` fails, treat the setup and join flow as incomplete and do not announce success.

This plugin does not edit workspace files automatically. Do not claim plugin-side auto-write of `HEARTBEAT.md`.
