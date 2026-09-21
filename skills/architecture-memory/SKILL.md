---
name: architecture-memory
description: Retrieve project conditions and decisions for design or implementation; preserve durable context in connected project memory, including ordinary project conversations.
---

# Architecture Memory

A Design save starts minimal Memory unless recording is disabled. Optional `architecture-memory-init` surveys an existing codebase; it is not a prerequisite for recording. Enter through the project's hook connection or an explicit request. With no connection, do not scan or initialize merely because architecture is mentioned. Read-only/no-memory requests suppress writes; explicit disabled settings stay disabled.

## Retrieve for a decision

Use Memory when work depends on project purpose, operating conditions, responsibility boundaries, or prior decisions; mechanical changes need no lookup. Search domain terms and affected paths, then read the necessary sections:

```text
node <skill-root>/scripts/memory.js search --project-root <project> --query "<topic>" --path <code-path>
node <skill-root>/scripts/memory.js read --project-root <project> --id <selected-id> --revision <search-revision>
```

Each returned section includes a `receipt`. On later reads, pass `--seen <receipt>` for sections whose full text and preamble remain in the current context, including shared constraints. Changed content returns again; new prerequisites remain required. Never reuse receipts alone after compaction or in another agent.

Known IDs can be read directly; repeat `--id` or `--path` as needed. Pointers are locations, not evidence. Read the selected record with its conditions and required links.

For no matches, paging, output limits, or tool failure, use [retrieval](references/retrieval.md).

New implementation requirements enter the Design through its owning revision workflow.

## Capture at a meaningful boundary

Capture durable information needed to interpret or change the system that code alone does not establish: domain meanings and relationships, operating conditions, business-rule background, and the reasons, scope, and tradeoffs of decisions. Code may express a rule without establishing its business meaning or rationale. Not having inspected code does not make its behavior project context. This includes ordinary project conversation after connection.

Follow [recording](references/recording.md) to distinguish capture value from document placement when connected Memory needs new durable context and recording is permitted. Patch at a settled decision or meaningful work boundary; unchanged information needs no write.

Conversation capture preserves the Git checkpoint. Explicit `architecture-memory-update` reconciles committed changes. Report changed topics compactly, and report a recording failure separately from successful design or implementation work.
