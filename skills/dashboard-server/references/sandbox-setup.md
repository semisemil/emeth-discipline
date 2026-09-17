# Dashboard sandbox setup

Apply before first dashboard registration or initialization, when the dashboard directory or registry is missing, or when registration reports `registry-lock-failed` with `EPERM` or `EACCES`. This also applies to writers that register after saving a project document.

## Resolve the required directory

Resolve `<plugin-root>` from this reference and obtain the actual directory with the bundled resolver:

```text
node -e "console.log(require(process.argv[1]).getDashboardConfigDir())" <plugin-root>/dashboard/registry.js
```

The directory contains `projects.json`, lock and temporary files, and server state. Windows uses `%APPDATA%\proofline\dashboard`; other platforms use `$XDG_CONFIG_HOME/proofline/dashboard`, falling back to `~/.config/proofline/dashboard`. Use the resolved absolute directory, including when it does not exist yet.

## Configure write access

1. Check the current sandbox's writable roots and applicable Codex configuration. If they already cover the directory, reuse that access. For `workspace-write`, locate the user configuration at `$CODEX_HOME/config.toml`, falling back to `~/.codex/config.toml`.
2. When access is missing, tell the user that dashboard setup needs to modify that `config.toml` to allow writes to the resolved directory. Merge the directory into `[sandbox_workspace_write].writable_roots`, preserving existing entries and other settings. Use an absolute TOML path, not an environment-variable expression. Add only the dashboard directory; keep the current sandbox mode. Configuration edits must use the environment's permitted edit or approval mechanism. If editing is unavailable or denied, provide the exact path and required addition and report setup as pending.
3. Verify access in the session that performs registration. A saved configuration change alone does not establish access in the current session; if its writable roots remain unchanged, tell the user to start a new Codex session with the updated configuration before retrying. Report registration as complete only when the registration command returns `registered` or `no-op`.

If `default_permissions` selects a permission profile, configure the same directory through that profile's supported filesystem settings; do not combine it with `[sandbox_workspace_write]`. Managed restrictions remain authoritative.

## Recover a failed registration

For `registry-lock-failed` with `EPERM` or `EACCES`, check sandbox access to the resolved directory before retrying. If access already covers it, report the remaining error for filesystem permission or lock diagnosis; the error alone does not prove a sandbox cause. Preserve a completed Issue, Design, or Memory write and retry only `dashboard/register-project.js register --project-root <absolute-project-root>` after access is available. Report the document write and registration outcomes separately.

Configuration reference: [Codex config.toml](https://learn.chatgpt.com/docs/config-file/config-reference#configtoml).
