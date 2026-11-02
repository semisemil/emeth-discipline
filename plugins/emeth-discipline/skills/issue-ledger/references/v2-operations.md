# Issue Ledger v2 operations

Use this reference for full v2 mutations and tool maintenance.
For the state and evidence contract, see [v2-schema.md](v2-schema.md).
Ordinary updates use the context command's save contract and input example.

## CLI

```text
node <plugin-root>/skills/issue-ledger/scripts/issue-ledger.js list [--root DIR] [--all] [--search TEXT] [--details [--limit N] [--offset N]]
node <plugin-root>/skills/issue-ledger/scripts/issue-ledger.js show ID [--root DIR] [--evidence E1,E2] [--events]
node <plugin-root>/skills/issue-ledger/scripts/issue-ledger.js validate [FILE] [--root DIR]
node <plugin-root>/skills/issue-ledger/scripts/issue-ledger.js create --input ISSUE.json|- [--input-format v2|brief] [--if-empty] [--root DIR]
node <plugin-root>/skills/issue-ledger/scripts/issue-ledger.js update ID --operation OPERATION.json|- [--input-format v2|brief] [--output-format json] [--project-root DIR] [--root DIR]
node <plugin-root>/skills/issue-ledger/scripts/issue-ledger.js link-work ID --help
```

Supported update operation types are `batch`, `set_state`, `set_claim_state`, `link_work`, `add_evidence`, `link_evidence`, `add_event`, `set_milestone`, and `add_relation`.
Creation defaults to full v2 input.
Use explicit `--input-format brief` for a simple/open Issue with generated metadata, reported claims and ordered C-IDs; the meaningful input shape is in [../../rules/references/work-records-create.md](../../rules/references/work-records-create.md) or `--help`.
Brief input preserves supplied text and uses the same schema, relation validation and locked publication; unknown fields, mixed representations and unsupported formats fail.
Brief creation returns the saved path followed by the same AI brief as `show`, including generated IDs.
Optional `--if-empty` checks the existing store inside the create lock and fails `issue-store-changed` if populated; refresh discovery after that failure instead of retrying unguarded.
Explicit brief update accepts `current_summary`, optional `work` entries (`kind`, `id`, `location`), `evidence`, `status` and `next_action`.
Evidence accepts `id`, `kind`, `location`, `observation`, `observed_at`, `targets` and `claims` entries (`id`, `state`); absent IDs and timestamps are generated, and claim selections link that evidence explicitly.
It expands to the same ordered batch, preserving prior active `next_action` when omitted, and supports `open`, `doing` or `resolved`.
Unknown keys/shapes, invalid proof, terminal active fields and invalid backlinks reject before saving; terminal relinking still requires the ordered v2 workflow.
Every update requires one top-level `current_summary` confirmation.
Optional `--output-format json` returns the saved path and validated current brief; default output remains the path.
Use `batch.operations` when evidence, its P/C/D link, a decision, or a terminal-state change must become valid atomically.
`set_claim_state` selects an existing P-claim with `claim_id`, sets `state` to `reported | confirmed | refuted`, and adds optional `evidence_refs` to its existing references.
`confirmed` and `refuted` require current valid evidence; the caller judges whether that observation supports the chosen state.
This operation preserves the issue's progress state and other claim content.
`add_evidence.targets` links observations without changing a claim's state; combine it with `set_claim_state` in one batch when needed.
Evidence link targets accept local P/C/D IDs or the current Issue qualifier, such as `PL-0001#C1` or `PL-0001/C1`.
Other Issue qualifiers are rejected.
A changed `set_state` automatically appends a T-ID transition, using `transition_summary` when supplied and otherwise the confirmed current summary.
The dedicated `link-work` command validates the Design or legacy Plan/Spec backlink, adds one canonical context path, may update active state, is idempotent, and refuses terminal issues.
The same `link_work` operation can be included in `update`, with every document backlink validated before saving.
Put links, evidence, and state changes in one batch in the required array order; a failed operation or backlink preserves the original issue bytes.
All CLI writes share the store lock, covering the current Issue read, mutation, validation and publication.
Updates apply to the latest saved Issue; omitted fields remain unchanged and duplicate explicit IDs fail validation.
Publication replaces the Issue only after its complete replacement has been written to a temporary file in the same directory.
A validation, write or replacement failure leaves the previous Issue unchanged and releases the lock.
Unchanged `link-work` requests return `no-op` without writing; lock contention waits up to five seconds before failing.
Use `-` for UTF-8 JSON on stdin instead of a file path.
JSON output uses stable top-level key order and two-space indentation.

Minimal operation shapes:

```json
{"type":"set_state","status":"blocked","current_summary":"...","next_action":"...","blocker":"...","unblock_condition":"...","updated_at":"..."}
{"type":"set_claim_state","claim_id":"P1","state":"confirmed","evidence_refs":["E1"],"current_summary":"..."}
{"type":"link_work","current_summary":"...","work":{"kind":"design","id":"DESIGN-0001","location":".emeth/designs/DESIGN-0001-example/DESIGN.md"}}
{"type":"add_evidence","current_summary":"...","evidence":{"id":"E2","kind":"test","location":"...","observation":"...","observed_at":"..."},"targets":["C1"]}
{"type":"link_evidence","current_summary":"...","target":"D1","evidence_id":"E2"}
{"type":"add_event","current_summary":"...","event":{"id":"D2","kind":"decision","at":"...","summary":"...","evidence_refs":[]}}
{"type":"set_milestone","current_summary":"...","milestone_id":"M2","status":"done"}
{"type":"add_relation","current_summary":"...","relation":{"type":"follow_up_to","target":"PL-0001"}}
```

For an atomic change, put the same inner objects without `current_summary` in order under `{"type":"batch","current_summary":"...","updated_at":"...","operations":[...]}`. When a new decision and its new evidence are created together, add the D-event first, then add evidence targeting that D-ID. Omit active-state fields from a terminal `set_state`; include the cancellation or replacement decision in the same batch.
