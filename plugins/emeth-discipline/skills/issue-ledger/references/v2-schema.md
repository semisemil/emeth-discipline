# Issue Ledger v2

This reference defines v2 state, criteria and evidence semantics.
Ordinary brief updates use the supplied work-record contract or CLI help.
Run the CLI from the project root.

## Canonical groups

- `schema_version: 2`
- `identity`: `id`, `aliases`, `type`, `mode`, `title`, `risk`
- `origin`: registration `kind`, short `summary`, and `refs`
- `state`: `status`, `current_summary`, and conditional active-state fields
- `problem`: `bug | research` claims and impact
- `objective`: requested-work goal and constraints
- `criteria`: independently verifiable C-ID conditions
- `milestones`: composite-only M-ID outcomes
- `relations`: directional issue links
- `context`: objects with `kind` and `location` for related files or documents that do not prove a judgment, such as `{"kind":"source","location":"src/report.js"}`
- `artifacts`: objects with `kind`, `location`, and `summary` for external reports, full logs, tables, hashes, and methods
- `evidence`: immutable E-ID observations
- `events`: immutable D-ID decisions and T-ID state transitions
- `created_at`, `updated_at`

Local IDs are unique only inside one issue. Use `PL-0001#E1` for external reference. P/C/D records reference E-IDs; evidence never owns the judgment mapping.

## State invariants

Resolution covers the full tracked outcome and required validation, including work carried forward beyond the current task.

| Status | Required | Forbidden |
| --- | --- | --- |
| `open`, `doing` | `current_summary`, `next_action` | blocker fields |
| `blocked` | `current_summary`, `next_action`, `blocker`, `unblock_condition` | — |
| `resolved` | cause/goal-change-result summary; active evidence for every C-ID | active-state fields |
| `cancelled` | termination summary and decision event | active-state fields |
| `superseded` | termination summary, decision event, `superseded_by` | active-state fields |

Bug and research P-claims use `reported | confirmed | refuted`. Confirmed and refuted claims require current evidence. Requested work uses `objective.summary` and `objective.constraints` instead of claims.

Simple issues omit milestones. Composite issues have 3–7 milestones; required milestones must be `done` before resolution. Composite parents retain coordination and top-level outcome proof only.

Evidence must contain `id`, `kind`, `location`, `observation`, and `observed_at`. Full reproducibility material belongs in an artifact; evidence keeps the judgment-level observation and artifact location. Every evidence item must be referenced by a P-claim, C-criterion, or D-decision.

Decisions may reference earlier D-IDs through `supersedes`. New evidence may reference old E-IDs through `supersedes` or `invalidates`. Current valid decisions are those not superseded by a later decision.

## Full operations

For composite milestones, decisions, blocked/cancelled/superseded states, explicit claim-state mutations or repair, use [v2-operations.md: CLI](v2-operations.md#cli).
