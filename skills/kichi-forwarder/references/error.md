# Install Error Handling

If `openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder` fails, read the error output carefully. Common causes and fixes:

- Permission or access error (`EACCES`): re-run the command with appropriate user-level permissions for the current OS.
- Package resolution or visibility error: confirm the package name is exactly `@yahaha-studio/kichi-forwarder` and that the package is published and publicly available on ClawHub.
- Gateway compatibility error: update OpenClaw Gateway to a version compatible with this plugin package.
- File conflict (`EEXIST`): re-run the install command with `--force`.
- Network or registry error: check internet connectivity and retry.

After applying the fix, re-run `openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder`.
