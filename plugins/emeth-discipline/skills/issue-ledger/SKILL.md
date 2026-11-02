---
name: issue-ledger
when_to_use: "Explicit ledger work, workflow-required records, or enabled tracking without a supplied work-record entry or contract."
description: "Manage project-local PL Issue files in .emeth/issues through the bundled Node CLI on explicit requests or workflow calls. For enabled automatic tracking, use this skill only when no work-record entry or contract is supplied."
---

# Issue Ledger

## Record

Automatic registration is off by default.
Apply this workflow to explicit ledger requests, Issues required by an invoked workflow, or a project's enabled automatic work records.
Reuse supplied Issue context and its save contract.
For missing state, run the bundled CLI from the project:

```text
node "<plugin-root>/writers/document-writer.js" context --records issues --project-root "<project>" --issue-id <known-ID> --code-context 8 --format codex-text
```

In Codex `functions.exec`, run this command in `exec_command` and read its output directly.
The result supplies Issue state, the complete ordinary update contract, a native save example, project inventory, root build files and ancestor AGENTS.md files.
Omit `--issue-id` for selection.
Read the listed sources needed for verification; reuse complete supplied files.
Repeat `--file <path>` for known project source, instruction or configuration files.
For other hosts, paging, or missing scope, use [../rules/references/work-records.md](../rules/references/work-records.md).

Use [references/v2-schema.md](references/v2-schema.md) for composite milestones, decisions, blocked/cancelled/superseded states, explicit claim-state operations or repair.
Direct Issue-file edits require reviewed repair; normal writes use the CLI.
Use [references/work-link.md](references/work-link.md) for legacy Plan/Spec links or an ambiguous or terminal connection.

## Boundaries

Keep one independently verifiable result in a simple Issue.
An iteration, changed verification conditions, or resumed work on the same result stays in that Issue.
Use composite Issues with 3–7 outcome milestones for coordination; separate independent deliverables or materially changed goals rather than append them.
Store one directional relation: child_of, superseded_by, or follow_up_to.
