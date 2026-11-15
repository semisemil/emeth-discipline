---
name: architecture-memory
when_to_use: "Capture durable context or resolve retrieval problems in connected project architecture documents."
description: Capture durable context in connected project architecture documents or resolve incomplete and ambiguous retrieval. The connection notice provides ordinary read-only lookup.
---

# Architecture Memory

This skill reads and maintains project architecture documents.
Their location is configured by `root` in `.emeth/architecture.json`.
Codex's built-in memory has separate instructions and storage.

Creating a Design creates the initial project architecture documents unless recording is disabled.
Revising an existing Design preserves the connection without initializing unconnected architecture documents.
Optional `architecture-memory-init` surveys an existing codebase; it is not a prerequisite for recording.
With no connection, do not scan or initialize merely because architecture is mentioned.
Read-only requests suppress writes.
Requests to disable recording in project architecture documents suppress writes to those documents.
Explicit disabled settings stay disabled.

## Retrieve for a decision

Choose the evidence that can establish each missing claim before opening another source.
For project meaning, policy and rationale, start with the applicable current records.
For behavior or exact text the records cannot establish, start with its owning source.
Batch independent reads. Read a second source for a claim only after identifying a gap, conflict, freshness question or direct verification requirement that the first source leaves.
A current record with its prerequisites and attribution can support a decision without opening its cited material.

For named domain topics, use one lookup with one `--topic` per subject. It reads the top matching section for each topic and all required links.
Use search when you need to choose among results or route by code path.
Use the initial results to find any material gap before reading more.
Include `--history` when seeking a past decision, alternative or ADR, or when current records leave the needed rationale unresolved.

```text
node <plugin-root>/skills/architecture-memory/scripts/memory.js lookup --project-root <project> --topic "<subject>" --topic "<other subject>"
node <plugin-root>/skills/architecture-memory/scripts/memory.js search --project-root <project> --query "<topic>" --path <code-path>
node <plugin-root>/skills/architecture-memory/scripts/memory.js read --project-root <project> --id <selected-id> --revision <search-revision>
```

Each returned section includes a `receipt`. On later reads, pass `--seen <receipt>` for sections whose full text and preamble remain in the current context, including shared constraints. Changed content returns again; new prerequisites remain required. Never reuse receipts alone after compaction or in another agent.

Read known IDs directly.
Apply a recorded withdrawal within its scope and omit any value the user asked to forget.
For a question about the current decision, give the applicable value. Apply an accepted conditional decision when its recorded trigger is established.
Verify implementation separately when the task depends on what is in use.
Include earlier values when the requested history or a material uncertainty calls for them.

For interpreting history results, no matches, paging, output limits, or tool failure, use [references/retrieval.md](references/retrieval.md).
For maintenance requests, use [architecture-memory-maintain](../architecture-memory-maintain/SKILL.md); when partial retrieval carries excessive unrelated content, suggest it to the user.

New implementation requirements enter the Design through its owning revision workflow when that Design work is requested, required by an invoked workflow, or project automatic work records are enabled.

## Capture at a meaningful boundary

Capture durable information needed to interpret or change the system that code alone does not establish: domain meanings and relationships, operating conditions, business-rule background, and the reasons, scope, and tradeoffs of decisions. Code may express a rule without establishing its business meaning or rationale. Learn what code does from the code itself; its behavior is not project context. This includes ordinary project conversation after connection.

When adding ordinary new subjects to one known document, publish them as one Markdown batch through `author.js append`. Use the registered `context` document for new domain and operating context. Read the supplied evidence together as size permits. Keep exact durable values, applicable conditions, the distinction between an accepted decision and observed implementation, and evidence next to each claim.

```text
node <plugin-root>/skills/architecture-memory/scripts/author.js append --project-root <project> --document context
```

Pass UTF-8 Markdown on stdin. Each new section starts with a level-2 heading and one confidence/lifecycle line. The writer allocates the IDs, validates the batch and rejects existing titles. Use the manifest language.

```markdown
## Operating connectivity

**confirmed/current**

Operators report recurring outages at remote sites while work continues.
```

For revisions, withdrawals, routing metadata, or new structural documents and ADRs, follow [references/recording.md](references/recording.md).
Patch at a settled decision or meaningful work boundary; unchanged information needs no write.

Recording during conversation leaves the Git checkpoint unchanged. `architecture-memory-update` reconciles committed changes. Report changed topics compactly, and report a recording failure separately from successful design or implementation work.
