---
name: architecture-memory-maintain
when_to_use: "Reorganize connected architecture documents when maintenance is requested or partial retrieval carries excessive unrelated content."
description: Split, consolidate and shorten connected architecture documents while preserving their meaning, evidence and retrieval prerequisites.
---

# Architecture Memory Maintenance

Maintain the documents connected through `.emeth/architecture.json` within the requested topics.
Use this skill for accumulated content and retrieval structure.
Factual reconciliation with code belongs to [architecture-memory-update](../architecture-memory-update/SKILL.md).
Keep the Git checkpoint and document verification fields unchanged.
For a read-only request, deliver findings and a concrete reorganization proposal.

## Locate the retrieval problem

Run `node <plugin-root>/skills/architecture-memory/scripts/memory.js inspect --project-root <project>` for bounded section sizes, required retrieval sizes and incoming required links.
Repeat `--id` or `--path` to narrow the scope; continue `next_offset` with `--offset` and the returned `--revision` when the affected topics need further coverage.
Read relevant candidates through [retrieval](../architecture-memory/references/retrieval.md), including their preambles and prerequisites.
Sizes identify candidates; independent topics, repeated meaning and unnecessary dependencies determine the changes.

Before changing a topic, retain representative questions, the domain terms and paths used to find it, and the facts needed to answer those questions.
Include scope, conditions, exceptions, evidence and decision reasons in that baseline.

## Reorganize the knowledge

| Finding | Change |
|---|---|
| Independently useful topics share one section | Split into separately routed level-2 sections. |
| Equivalent claims have the same scope and state | Consolidate into one authoritative section. |
| Repeated wording adds no meaning | Shorten while preserving the baseline facts. |
| A preamble or required link brings unrelated content | Keep the necessary shared premise and place topic-specific context with its owner. |

Preserve attributed facts, unresolved differences, confidence, lifecycle and accepted ADR bodies.
Keep a section's ID when it continues to own the same topic; allocate IDs for new topics through the writer.
Retain the original domain vocabulary and path coverage where those concepts now live.
Evaluate each incoming required link by the caller's meaning; select its actual prerequisite sections.
Use ordinary Markdown links for optional navigation.
Preserve existing Markdown destinations when changing headings, or update their affected references within scope.

Apply related changes together through `author.js reorganize` under [batch reorganization](../architecture-memory/references/recording.md#batch-reorganization).
It uses the ordinary recording and recovery path, including any pending init/update draft.
Consolidated IDs remain readable as historical location records; current prerequisites point directly to their destinations.

## Verify search and partial reads

Repeat the baseline searches with the same terms, paths, result limits and read budgets, using fresh revisions and no reused receipts in both comparisons.
Use `author.js read` while working in a draft, then verify `memory.js search` and `read` after its owning workflow publishes it.
Consume required pages through completion; compare retrieved preambles and sections, not only the first response.
Every baseline answer must retain its necessary meaning, evidence and status.
Confirm old IDs still reach their content and run `memory.js check` for structural validity.
Structural validity alone does not establish meaning preservation.

Complete when the selected retrieval problem is resolved and the representative answers remain supported.
Report changed topics and the comparable retrieval sizes or remaining problems.
Distinguish text size from tokens and an isolated example from a general performance claim.
