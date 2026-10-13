# Issue Ledger v2

Read this reference for normal update operation shapes, schema repair, or tool maintenance. Creation from templates does not require the full reference. Resolve `<skill-dir>` to the directory containing this skill and run the CLI from the project root.

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
- `context`: related files or documents that do not prove a judgment
- `artifacts`: external reports, full logs, tables, hashes, and methods
- `evidence`: immutable E-ID observations
- `events`: immutable D-ID decisions and T-ID state transitions
- `created_at`, `updated_at`

Local IDs are unique only inside one issue. Use `PL-0001#E1` for external reference. P/C/D records reference E-IDs; evidence never owns the judgment mapping.

## State invariants

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

## CLI

```text
node <skill-dir>/scripts/issue-ledger.js list [--root DIR] [--all] [--search TEXT]
node <skill-dir>/scripts/issue-ledger.js show ID [--root DIR] [--evidence E1,E2] [--events]
node <skill-dir>/scripts/issue-ledger.js validate [FILE] [--root DIR]
node <skill-dir>/scripts/issue-ledger.js create --input ISSUE.json [--root DIR]
node <skill-dir>/scripts/issue-ledger.js update ID --operation OPERATION.json [--root DIR]
node <skill-dir>/scripts/issue-ledger.js link-work ID --help
```

Supported update operation types are `batch`, `set_state`, `add_evidence`, `link_evidence`, `add_event`, `set_milestone`, and `add_relation`. Every update requires one top-level `current_summary` confirmation. Use `batch.operations` when evidence, its P/C/D link, a decision, or a terminal-state change must become valid atomically. `add_evidence.targets` can link a new observation to one or more existing P/C/D IDs in one operation. A changed `set_state` automatically appends a T-ID transition, using `transition_summary` when supplied and otherwise the confirmed current summary. The dedicated `link-work` command validates the Design or legacy Plan/Spec backlink, adds one canonical context path, may update active state, is idempotent, and refuses terminal issues. JSON output uses stable top-level key order and two-space indentation.

Minimal operation shapes:

```json
{"type":"set_state","status":"blocked","current_summary":"...","next_action":"...","blocker":"...","unblock_condition":"...","updated_at":"..."}
{"type":"add_evidence","current_summary":"...","evidence":{"id":"E2","kind":"test","location":"...","observation":"...","observed_at":"..."},"targets":["C1"]}
{"type":"link_evidence","current_summary":"...","target":"D1","evidence_id":"E2"}
{"type":"add_event","current_summary":"...","event":{"id":"D2","kind":"decision","at":"...","summary":"...","evidence_refs":[]}}
{"type":"set_milestone","current_summary":"...","milestone_id":"M2","status":"done"}
{"type":"add_relation","current_summary":"...","relation":{"type":"follow_up_to","target":"PL-0001"}}
```

For an atomic change, put the same inner objects without `current_summary` in order under `{"type":"batch","current_summary":"...","updated_at":"...","operations":[...]}`. When a new decision and its new evidence are created together, add the D-event first, then add evidence targeting that D-ID. Omit active-state fields from a terminal `set_state`; include the cancellation or replacement decision in the same batch.
