---
name: dashboard-server
when_to_use: "Explicit request only: manage the Emeth dashboard or switch inbox recording on or off."
disable-model-invocation: true
description: Register a project, open or manage the dashboard server, or toggle inbox recording.
argument-hint: "add | open | status | stop | on | off"
---

# Dashboard Server

Accept exactly one action from the list below.

Resolve `<plugin-root>` from this SKILL.md; do not substitute a project-local script.
The dashboard listens on `http://127.0.0.1:43127`.

- `on` or `off`: Run `node <plugin-root>/dashboard/inbox.js <action>` and report the returned setting. It applies to this user's registered projects across Codex, Claude Code and Mixdog and defaults to off.
- `add`: Treat the current working directory as the project root.
  If it contains neither a `.emeth` nor a legacy `.proofline` directory, report that it is not an initialized Emeth Discipline project and stop without creating state.
  Otherwise run `node <plugin-root>/dashboard/register-project.js register --project-root <absolute-current-working-directory>`.
  Accept `registered` or `no-op` as complete and report the JSON result.
  Do not search parent, child, sibling, or other filesystem paths.
- `open`: Start the server if needed, then open its verified URL with the current plugin version in `expected_version`.
  Report a port conflict if `43127` is occupied.
- `status`: Report the verified running URL and identity, or the stopped reason.
- `stop`: Stop only the process whose PID and health `instance_id` match the current server state.

For `open`, `status`, and `stop`, run `node <plugin-root>/dashboard/control.js <action>` and report its JSON result.
For a registration or server-start failure reporting `EPERM` or `EACCES`, follow [references/sandbox-setup.md](references/sandbox-setup.md).

Never remove or discover projects.
Apart from the automatic legacy storage migration, never create or modify project `.emeth` state.
`add` may change the global project registry.
`add` and `open` may change the dashboard write-access configuration described in sandbox setup.
