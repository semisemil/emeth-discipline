---
name: dashboard-server
description: Add the current Emeth Discipline project, or open, inspect, or stop the running Emeth Discipline dashboard server.
---

# Dashboard Server

Accept exactly one action: `add`, `open`, `status`, or `stop`.

Resolve `<plugin-root>` from this SKILL.md; do not substitute a project-local script.

- `add`: Treat the current working directory as the project root. If it contains neither a `.emeth` nor a legacy `.proofline` directory, report that it is not an initialized Emeth Discipline project and stop without creating state. Otherwise run `node <plugin-root>/dashboard/register-project.js register --project-root <absolute-current-working-directory>`; the helper automatically migrates legacy project storage to `.emeth` and initializes dashboard storage as needed. Accept `registered` or `no-op` as complete and report the JSON result. For a registration failure reporting `EPERM` or `EACCES`, follow [sandbox recovery](references/sandbox-setup.md). Do not search parent, child, sibling, or other filesystem paths.
- `open`: Open the verified running server with the current plugin version in `expected_version`. If stopped, report `stopped`; do not start it.
- `status`: Report the verified running URL and identity, or the stopped reason.
- `stop`: Stop only the process whose PID and health `instance_id` match the current server state.

For `open`, `status`, and `stop`, run `node <plugin-root>/dashboard/control.js <action>` and report its JSON result.

Never remove or discover projects. Apart from the automatic legacy storage migration, never create or modify project `.emeth` state. `add` may change the global project registry and the dashboard write-access configuration described in sandbox setup. Only the SessionStart hook may call the internal `start` action.
