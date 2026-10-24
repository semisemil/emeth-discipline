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
Choose a coherent scope that delivers the requested reduction, rather than stopping at the first safe edit.
For a substantial reduction, state a task-specific target before editing and measure the complete workload against it.
Small metadata savings are cleanup, not completion of a substantial reduction request.

Before choosing changes, fix a workload that covers the requested topics' independent uses and complete multi-owner tasks, with the terms and paths originally used.
Use existing caller questions or retrieval traces as the baseline when available; derive supplementary uses from the original documents.
Include natural task questions with several terms and broad path scopes alongside short topic names; title-matching examples alone miss body-dependent discovery.
Keep the workload and its weighting fixed throughout the comparison; additional examples supplement its acceptance result.
Record the supported answers with their scope, conditions, exceptions, evidence, decision reasons and causes of prior failures, including adjacent questions affected by routing or prerequisite changes.
Record what the first search hit actually answers through its required closure, including hits that are not the intended owner.
Record the search pages needed to find all answer owners and the complete read cost before choosing a reorganization.
Find the largest marginal costs across these answers: shared prerequisites, repeated responsibility descriptions and routing overhead.
Count a shared prerequisite once per complete answer; removing one edge saves little when another selected owner still requires it.

## Reorganize the knowledge

| Finding | Change |
|---|---|
| Independently useful topics share one section | Split when complete lookups benefit; preserve the boundary when shared questions would cost more. |
| Equivalent claims have the same subject, scope, qualifications and state | Consolidate into one authoritative section. |
| Tables, prose or path lists repeat a responsibility | State its subject, action and conditions once, with its authoritative evidence. |
| A large descriptive prerequisite supplies only a few necessary facts | Keep those exact premises with the dependent claim or in a smaller shared owner, with their source and limits. |
| A shared policy owns a caller's authorization, update or lifecycle conditions | Compact that policy owner or split a smaller coherent policy owner and retarget the required link. |
| Routing repeats discovery information | Retain the smallest owner scopes and aliases that preserve measured discovery, including broad-topic searches. |

Preserve attribution and modality: a possibility, requirement, user belief, settled decision or unresolved choice retains that meaning.
Preserve evidence limits, confidence, lifecycle and accepted ADR bodies.
Preserve information and responsibility ownership, rather than the original sentence count or layout.
Keep a section's ID when it continues to own the same topic; allocate IDs for new topics through the writer.
Keep the original owner current when it still answers a broad use across newly separated topics; a historical location record serves a replaced owner.
Preserve each moved topic's applicable vocabulary and path scopes from its original owner, including discovery through the broader topic rather than only its new title.
After a split, keep cross-topic discovery vocabulary on the broad owner and test mixed searches using the children's vocabulary together.
Use paths and aliases that distinguish the owning topic; their metadata also contributes to retrieval size.
When shortening removes discovery terms from prose, retain the necessary vocabulary in concise routing and verify its search rank; unchanged titles and aliases alone do not preserve discovery.
Evaluate each incoming required link by the caller's meaning; its target should provide the smallest coherent premise needed by that caller.
Before removing a required link, account for every condition and state it supplies to the caller's supported uses, distinguishing when to act from conditions on the action.
Keep required links to shared policy owners; summaries in callers explain the policy without transferring its ownership or replacing the required read.
Separate unrelated responsibilities at the target when they would otherwise accompany every read.
Use ordinary Markdown links for optional navigation.
Preserve existing Markdown destinations when changing headings, or update their affected references within scope.

Apply related changes together through `author.js reorganize` under [batch reorganization](../architecture-memory/references/recording.md#batch-reorganization).
It uses the ordinary recording and recovery path, including any pending init/update draft.
Consolidated IDs remain readable as historical location records; current prerequisites point directly to their destinations.

## Verify search and partial reads

Repeat the baseline searches with the same terms, paths, result limits and read budgets, using fresh revisions and no reused receipts in both comparisons.
Use `author.js read` while working in a draft, then verify `memory.js search` and `read` after its owning workflow publishes it.
Consume required pages through completion; compare retrieved preambles and sections, not only the first response.
A nonadvancing read is a budget failure; use a workable budget for both sides of the comparison.
Account for every shortened or moved claim against its original wording, including evidence limits, decision reasons and causes of prior failures.
Confirm that complete retrieved answers preserve their scope, conditions and exceptions; expected phrases alone do not establish preservation.
Every owner needed for a baseline answer must remain reachable with the original search terms and paths; direct IDs and reformulated queries are supplemental evidence.
Distinguish that reachability from first-result relevance.
A first hit that previously supplied an answer through prerequisites must remain complete for that use, or the appropriate owner must become an equally accessible first hit.
Judge that completeness against the question's supported claims and necessary premises; incidental companion topics remain independently owned and searchable.
Compare the search responses needed to locate all owners plus their complete reads, including routing and repeated metadata.
Report unique answer text and required search/read pages alongside that full lookup footprint.
Confirm old IDs still reach their content and run `memory.js check` for structural validity.
Structural validity alone does not establish meaning preservation.

Adopt a coherent set of changes only when the targeted problem improves and previously supported representative answers retain their meaning and retrieval effort.
After each pass, measure the residual complete-answer costs and continue with compatible reductions until the requested target is met or a specific unresolved limit is demonstrated.
Under the same budgets, extra required search pages or a larger complete lookup are regressions unless the user has prioritized that tradeoff.
Revise the responsible change or retain its original section boundary; leaving that topic unchanged is a valid result.
A formerly unsupported answer may cost more once corrected; report that quality gain separately from size reduction.
Report changed topics, answer support, search reachability, first-result relevance and comparable retrieval sizes.
Explain increases in terms of prose, routing metadata, preambles and required sections.
Distinguish text size from tokens and an isolated example from a general performance claim.
