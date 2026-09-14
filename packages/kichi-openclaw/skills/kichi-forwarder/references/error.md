# Install Error Handling

If a plugin install or update fails, read the error output carefully. Common causes and fixes:

- Permission or access error (`EACCES`): re-run the command with appropriate user-level permissions for the current OS.
- ClawHub package not found: confirm the package name is exactly `@yahaha-studio/kichi-forwarder` and inspect its ClawHub listing or release status.
- npm package not found: confirm that `@yahaha-studio/kichi-forwarder` is published and publicly available on npm.
- Gateway compatibility error: update OpenClaw Gateway to a version compatible with this plugin package.
- Existing plugin or source conflict: use `openclaw plugins update kichi-forwarder` when the existing install is tracked from ClawHub. Use `--force` when replacing an existing install from another source.
- Network or registry error: check internet connectivity and retry.

ClawHub is the primary source:

```bash
openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder
```

If ClawHub is unavailable, report the failure and use the npm backup:

```bash
openclaw plugins install npm:@yahaha-studio/kichi-forwarder --force
```
