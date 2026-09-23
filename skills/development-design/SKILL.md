---
name: development-design
description: Develop a software idea or partial design into an implementation-ready Design through explanation, drafts, comparisons, and decisions. Use for development planning, technical design, or Design revision and lifecycle work.
---

# Development Design

Develop the user's idea into the single current Design and implementation contract. A direct design request ends with design. Apply [shared discipline](../rules/SKILL.md), reading it if absent from context.

## Start from the current idea

Resolve an explicit Design ID/path directly; for a new request, inspect plausible same-goal Designs. For lifecycle-only work, follow [status changes](references/document-status.md).

Ground the design in the intended user and scenario, settled decisions, and affected existing contracts. Resolve factual gaps from project/domain context, implementation, and connected Architecture Memory; an absent Memory match does not establish absence of constraints. Research external approaches when local evidence cannot settle a choice, citing what influences it.

## Develop the design together

Start an unsettled design with a concrete provisional proposal: relevant flow, responsibilities, assumptions, and open choices. Scale its depth to the feature and the user's understanding.

Address the most consequential open choice whose prerequisites are settled, including conflicts and failure cases the user has not raised. Recommend an approach with its affected behavior, evidence, benefit, and cost; compare alternatives or explain a pattern's fit when that changes the decision.

Incorporate answers into the proposal and explain their effects on dependent choices. Reopen settled choices when evidence or user intent changes. Reversible details may remain stated assumptions; leave result-preserving algorithms and internal representations to implementation.

Trace interactions to their final consumer, including earlier transformations, reused state, retries, optional behavior, and affected compatibility.

## Write and revise the Design

Before drafting or revising the body, read [Focus](../rules/focus.md) for content-block expression, [shared document writing and revision](../rules/references/writing-and-revision.md), and [Design writing and revision](references/writing-and-revision.md) for the design-specific structure and contract. Keep the implementation contract complete here so implementation and review need neither conversation history nor requirements stored only in Memory.

Reflect design changes in every affected contract.

## Set readiness metadata

Set frontmatter readiness after normalization. Use `ready` when the intended result, scope, consequential structure/behavior, affected contracts, and decisive expected observations are established, with material choices accepted or resolved under delegated authority. Remaining implementation choices must preserve the required outcome and constraints.

Use `draft` for a missing material decision or fact, or a user-requested draft; state the blocker and needed resolution in the relevant section. Actual external prerequisites may justify `blocked`. Readiness does not establish execution authorization or implementation evidence.

## Save and finish

Save through [creation](references/document-operations.md) or [editing](references/document-editing.md), reading only the relevant guide. For `EPERM`/`EACCES`, follow [sandbox recovery](../dashboard-server/references/sandbox-setup.md). Add `--memory off` when recording is prohibited.

When connected and recording is permitted, update [Architecture Memory](../architecture-memory/SKILL.md) with new durable findings.

Report the saved Design, material open decisions, and any failures.
