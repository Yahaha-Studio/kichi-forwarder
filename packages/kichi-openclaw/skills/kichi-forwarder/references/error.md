# Install Error Handling

If a plugin install or update fails, read the error output carefully. Common causes and fixes:

- Permission or access error (`EACCES`): re-run the command with appropriate user-level permissions for the current OS.
- ClawHub package not found: confirm the package name is exactly `@yahaha-studio/kichi-forwarder` and inspect its ClawHub listing or release status.
- npm package not found: confirm that `@yahaha-studio/kichi-forwarder` is published and publicly available on npm.
- Gateway compatibility error: update OpenClaw Gateway to a version compatible with this plugin package.
- Existing plugin or source conflict: report the installed source. Use `openclaw plugins update kichi-forwarder` when the existing install is tracked from ClawHub. Replacing an installation from another source requires the user's explicit instruction to change sources.
- Network or registry error: check internet connectivity and retry.

ClawHub is the primary source:

```bash
openclaw plugins install clawhub:@yahaha-studio/kichi-forwarder
```

If ClawHub is unavailable, report the error and stop the installation/update. Do not automatically switch to npm or use `--force`. A user-requested registry change must be explicit and must not be used to bypass a compatibility or security failure.
