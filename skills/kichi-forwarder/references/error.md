# Install Error Handling

If `openclaw plugins install @yahaha-studio/kichi-forwarder` fails, read the error output carefully. Common causes and fixes:

- Permission or access error (`EACCES`): re-run the command with appropriate user-level permissions for the current OS.
- Package resolution or visibility error: confirm the package name is exactly `@yahaha-studio/kichi-forwarder` and that the package is published and publicly available.
- Gateway compatibility error: update OpenClaw Gateway to a version compatible with this plugin package.
- ClawHub rate limit (`429`): treat this as a temporary registry error, not a broken plugin. If the error output includes a retry delay or `Retry-After`, wait exactly that long before retrying. Otherwise, retry with bounded backoff: wait 30 seconds before the second attempt and 60 seconds before the third attempt. Stop after 3 total attempts and report the install as blocked by rate limiting if it still fails.
- File conflict (`EEXIST`): re-run the install command with `--force`.
- Network or registry error: check internet connectivity and retry.

After applying the fix, re-run `openclaw plugins install @yahaha-studio/kichi-forwarder`.
