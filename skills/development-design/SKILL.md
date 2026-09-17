---
name: development-design
description: Develop a software idea or partial design into an implementation-ready Design through explanation, drafts, comparisons, and decisions. Use for development planning, technical design, or Design revision and lifecycle work.
---

# Development Design

Develop the user's current idea into a concrete design. The Design is the single current source for the chosen approach and its implementation contract. A direct design request ends with design; `figure-it-out` may own an authorized implementation workflow.

## Start from the current idea

Resolve an explicit Design ID/path directly; for a new request, inspect plausible same-goal Designs. Clarify ambiguous identity. For lifecycle-only work or legacy Plan/Spec succession, follow [document operations](references/document-operations.md).

Build from settled decisions, inspected evidence, and the user's current thinking. Clarify missing purpose through the intended user and scenario, within the requested scope. Resolve source-answerable gaps from relevant project/domain context, implementation, and connected Architecture Memory. A missing Memory match establishes no absence of constraints.

Source required behavior from the request, confirmed choices, and affected existing contracts. Repository evidence constrains delivery without adding product goals. Research external approaches when a choice needs facts unavailable locally, and cite what influences it.

## Develop the design together

For an unsettled design, start with a concrete provisional proposal grounded in the user's purpose, constraints, and confirmed choices. Sketch the relevant flow and responsibilities even when the idea is incomplete, marking assumptions and unresolved choices. Adapt depth to the feature and the user's understanding.

Select the most consequential unresolved choice whose prerequisites are settled. Surface choices, conflicts, and failure cases needed to achieve the stated purpose, including those the user has not raised.

For that choice, recommend a concrete approach and explain its affected behavior, evidence, benefit, and cost. Compare a plausible alternative when its consequences matter. Use patterns when their fit clarifies the choice; explain why the proposed structure is sufficient under current conditions. Where user input is needed, ask a focused question about the remaining choice and wait for the answer before committing dependent decisions. Continue independent investigation and drafting.

After an answer, incorporate the choice into the design and explain what changes. Update dependent choices and advance to the next issue whose prerequisites are now settled. Reopen settled choices when new evidence or changed user intent affects them.

Resolve choices within existing delegated authority; otherwise the user decides changes to purpose, scope, observable behavior, compatibility, or meaningful cost and operating burden. Reversible details may be drafted with stated assumptions. Keep proposals, agreed decisions, and empirical evidence of demand or feasibility distinct.

Trace interactions through their final consumer, including earlier transformations, reused state, retries, optional behavior, and affected compatibility. Leave result-preserving algorithms and internal representations to implementation. Define acceptance through required behavior and observations; retain explicit user/project verification obligations with their source while leaving other verification methods open.

## Write and revise the Design

Before drafting or revising a Design body, read [Focus](../emeth-discipline/focus.md) and apply it to the document's content blocks. Read [writing and revision](references/writing-and-revision.md) for normalization, information hierarchy, and revision integration. Keep the implementation contract complete in the Design so implementation and review need neither the original conversation nor missing requirements from Memory.

During authorized implementation, revise affected decisions and contracts in the current session. Ask only for material user choices. Continue the owning workflow through verification of affected paths, reusing evidence only where it still establishes the revised contract.

## Set readiness metadata

Set readiness in the frontmatter after the editorial and semantic checks. Use `ready` when the intended result, scope, consequential structure/behavior, affected contracts, and decisive expected observations are established without inventing a material choice. Verify that material choices were accepted by the user or resolved within existing delegated authority; unanswered proposals remain unresolved. Unresolved details are acceptable only when plausible choices preserve the required outcome and material constraints.

Use `draft` when a material decision or fact still prevents readiness, or when the user asks to stop with a draft. In the relevant Design section, identify the specific unresolved choice or fact and what is needed to resolve it. Ask a focused question for missing user decisions while independent work continues. Actual external prerequisites may justify `blocked`. Assess readiness separately from the owning workflow's execution authorization and evidence checks.

## Save and finish

For every save or lifecycle change, follow [document operations](references/document-operations.md) and use its writer. Report the path, revision/status, material open decisions, and separate write/registration/Memory results, including `no-op` when unchanged.

The first Design save starts minimal Memory unless disabled or prohibited. At the settled decision boundary, use [Architecture Memory](../architecture-memory/SKILL.md) for context affecting future decisions, with source, scope, confidence/lifecycle, and a link to the Design's contract. A failed Memory write leaves a successful Design save intact; continue work whose required evidence remains available and report the unresolved recording result.

Return to an owning workflow, or finish with the Design.
