# Ordinary work records

## Save

Reuse returned state, sources, coverage and valid verification within the selected record scope; related links do not expand it.
Resolve diagnostics and remaining pages before treating coverage as complete.
Where tools support sequential execution, complete edits, record and final workspace checks in one call.

## Issues

Track recurring or unresolved user problems, work needing continued tracking and durable out-of-scope findings.
A recurring problem remains tracked after a small or successful fix.
Immediate corrections without a lasting problem need no new Issue unless requested.
Before edits, select the same-goal Issue, including unmet or regressed completed work; create or reopen first when needed.
Reuse an active Issue's current state for selection; save one verified outcome, with earlier saves for material decisions, state changes or handoff.

For checks defined by exit code 0, prepare verification with the code edits.
Attach observed evidence instead when checks are already valid or their output needs interpretation.
Use `current_summary` for the current conclusion, `next_action` for remaining work, and evidence for verification details.
Evidence targets refer to existing P/C/D items; observations record new results and verification limits.
Issue status covers its full tracked outcome.
Use open/doing and `next_action` while required work or verification remains, including carried-forward work beyond the current task.
Resolve without `next_action` only when all criteria have current proof and no required work remains.
Adding evidence alone preserves claim states.
For Issue-only updates, use `designs:[]` and the supplied Issue state.
The supplied API covers criterion proof and ordinary state updates.
For composite milestones, decisions, blocked/cancelled/superseded states, explicit claim-state operations or repair, use [../../issue-ledger/references/v2-schema.md](../../issue-ledger/references/v2-schema.md).

## Designs

Update governing contracts and acceptance conditions, following replacement links and preserving cancelled/unrelated scope.
Replace changed fragments within sentences, with enough surrounding text in `old` for one match.
Unchanged clauses remain in the source.
Use `patch.documents` for registered details.
Changed behavior or acceptance conditions use `change_kind:"major"` once, preserving the previous document set.
Wording corrections and subsequent saves within that same contract change use `edit`.
After partial failure, retry pending patches only and add saved links to `issue.outcome.work:[{kind,id,location}]` when updating an Issue.

## Design-only

Use `node "<plugin-root>/writers/document-writer.js" patch --project-root . --id <ID>` with the returned patch input shape; no Issue outcome.

## Codex

Use the Record API's inline save example with the selected packet.

## CLI

The supplied `record_help` defines ordinary input.
Write its packet to a UTF-8 JSON file and run `node "<plugin-root>/writers/document-writer.js" record --project-root . --input FILE`.

## Other operations

- New Issue or reopening: [work-records-create.md](work-records-create.md).
- Composite milestones, decisions, blocked state, explicit claim-state changes or repair: [../../issue-ledger/references/v2-schema.md](../../issue-ledger/references/v2-schema.md).
- Legacy or terminal work links: [../../issue-ledger/references/work-link.md](../../issue-ledger/references/work-link.md).
- New Design or exploration: [Development Design](../../development-design/SKILL.md).
- Add/remove members or repair ambiguous sections: [../../development-design/references/document-editing.md](../../development-design/references/document-editing.md).
- Registration access failure after saving: [../../dashboard-server/references/sandbox-setup.md](../../dashboard-server/references/sandbox-setup.md).
