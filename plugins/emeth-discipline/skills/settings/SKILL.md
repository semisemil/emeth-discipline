---
name: settings
when_to_use: "Explicit request only: view or change Emeth settings, or manage the dashboard."
disable-model-invocation: true
description: View or change Emeth settings such as the dashboard inbox and automatic work recording, or register a project and manage the dashboard server.
argument-hint: "[status] | inbox on|off | work-records on|off | language ko|off | dashboard add|open|status|stop"
---

# Settings

Accept one command from the list below.
Resolve `<plugin-root>` from this SKILL.md; do not substitute a project-local script.

## Settings

Settings apply to every registered project of this user across Codex and Claude Code, and each defaults to off.

| Command | Run |
|---|---|
| none or `status` | `node <plugin-root>/skills/settings/scripts/settings.js status` |
| `inbox on` or `inbox off` | `node <plugin-root>/skills/settings/scripts/settings.js inbox <on\|off>` |
| `work-records on` or `work-records off` | `node <plugin-root>/skills/settings/scripts/settings.js work-records <on\|off>` |
| `language ko` or `language off` | `node <plugin-root>/skills/settings/scripts/settings.js language <ko\|off>` |

Report each setting's value, and whether it is the default, from the returned JSON.
Toggle settings return `enabled`; `language` returns `value`, which is `null` when off.

- `inbox`: sessions in registered projects record task results and pending decisions in the dashboard inbox.
- `work-records`: automatic Issue registration and related Design updates.
  A project's `.emeth/work-records.json` takes priority.
- `language`: adds writing rules for that language to the injected rules. `ko` is the only supported value.

Changes to `work-records` and `language` apply at the next session or context rebuild.

## Dashboard

The dashboard listens on `http://127.0.0.1:43127`.

- `dashboard add`: Treat the current working directory as the project root.
  If it contains neither a `.emeth` nor a legacy `.proofline` directory, report that it is not an initialized Emeth Discipline project and stop without creating state.
  Otherwise run `node <plugin-root>/dashboard/register-project.js register --project-root <absolute-current-working-directory>`.
  Accept `registered` or `no-op` as complete and report the JSON result.
  Do not search parent, child, sibling, or other filesystem paths.
- `dashboard open`: Start the server if needed, then open its verified URL with the current plugin version in `expected_version`.
  Report a port conflict if `43127` is occupied.
- `dashboard status`: Report the verified running URL and identity, or the stopped reason.
- `dashboard stop`: Stop only the process whose PID and health `instance_id` match the current server state.

For `open`, `status`, and `stop`, run `node <plugin-root>/dashboard/control.js <action>` and report its JSON result.

## Limits and failures

For a registration, server-start or settings failure reporting `EPERM` or `EACCES`, follow [references/sandbox-setup.md](references/sandbox-setup.md).

Never remove or discover projects.
Apart from the automatic legacy storage migration, never create or modify project `.emeth` state.
Setting commands change only the global settings file; `dashboard add` may change the global project registry.
