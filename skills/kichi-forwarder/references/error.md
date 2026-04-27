# Install Error Handling

If `openclaw plugins install @yahaha-studio/kichi-forwarder` fails, read the error output carefully. Common causes and fixes:

- Permission or access error (`EACCES`): re-run the command with appropriate user-level permissions for the current OS.
- Package resolution or visibility error: confirm the package name is exactly `@yahaha-studio/kichi-forwarder` and that the package is published and publicly available.
- Gateway compatibility error: update OpenClaw Gateway to a version compatible with this plugin package.
- ClawHub rate limit (`429`): do not retry the same bare package command. `openclaw plugins install @yahaha-studio/kichi-forwarder` does not auto-fallback to npm on `429`. Switch to the local archive path:

```bash
npm pack @yahaha-studio/kichi-forwarder
openclaw plugins install ./yahaha-studio-kichi-forwarder-<version>.tgz
```

Use the exact `.tgz` filename printed by `npm pack`.
- File conflict (`EEXIST`): re-run the install command with `--force`.
- Network or registry error: check internet connectivity and retry.

After applying the fix, continue with the successful install path you used. For `429`, that means the local `.tgz` archive install, not the original bare package command.
