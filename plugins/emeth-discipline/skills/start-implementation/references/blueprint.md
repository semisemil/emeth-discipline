---
name: blueprint
description: "Explore design possibilities through independent candidates and synthesize the selected contract."
disable-model-invocation: true
---

# Blueprint

## Phase A: Ground the problem

Establish the design goal, accepted constraints and relevant evidence.
Carry evidence locations and decisive observations into design.
Reuse valid evidence and fill the gaps needed for open decisions.
Use [../../code-exploration/references/how.md](../../code-exploration/references/how.md) to fill evidence gaps about affected behavior, ownership or runtime flow that matter to a design decision, or for a requested architectural explanation.
Use [../../code-exploration/references/why.md](../../code-exploration/references/why.md) when the decision depends on historical reasons that current evidence does not establish.

Before completing Ground, the calling conversation reports how and why separately as run, reuse or omit, with a brief reason for each.
For how, identify the current-behavior evidence the design needs and whether it is established.
For why, state whether an open decision depends on historical rationale.
For reused results, name their source and explain why they remain valid.

## Phase B: Sketch

When selecting a new or changed internal design, run [ensemble](../../ensemble/SKILL.md) to develop and compare two independent candidates before choosing the design.
Use the common task, relevant evidence and [blueprint/runner-prompt.md](blueprint/runner-prompt.md), applying [../../../references/design-exploration.md](../../../references/design-exploration.md).
Supplied interfaces, types and required behavior constrain the candidates; explore how the internal structure satisfies them.
For work that applies an already selected concrete design or mechanically follows an established shape, reuse that design while its contract and evidence remain valid.
Cite the source, any completed candidate comparison and how they settle the affected responsibility, state ownership and data-flow decisions.
At the start of Sketch, report whether you will generate candidates or reuse an existing design, naming the open internal decisions or the reuse evidence.
Candidate selection does not change verification ownership or independent roles defined in [../SKILL.md: Implementation workflow](../SKILL.md#implementation-workflow).
Synthesize the selected design using [../../development-design/references/document-form.md](../../development-design/references/document-form.md) before review.
Apply [../../ensemble/SKILL.md: Independent review](../../ensemble/SKILL.md#independent-review) at its owning boundary whether or not candidates were used, including for a design-only request or requested design checkpoint.
Select the design before dependent implementation.
The selected artifact records the boundaries, decisions and verification criteria.
Keep supplied types, APIs and examples authoritative at their source.
Screen proposed boundaries against [blueprint/design-red-flags.md](blueprint/design-red-flags.md) when they introduce new ownership or layering.
For a requested full design rationale, use [blueprint/rationale-template.md](blueprint/rationale-template.md).
Reuse the resulting design as the Design contract.

Proceed to implementation when the user's request or accepted follow-ups authorize it and the selected workflow's required design checks are complete.
For a requested design checkpoint, present the selected design, its material effects and tradeoffs, and wait for explicit approval to implement.
Resolve required user decisions through [../../rules/references/design-discussion.md](../../rules/references/design-discussion.md).
Use [challenge.md](challenge.md) when the contract remains contested.

## Phase D: Implement and revise

Implement against the accepted boundaries under the selected workflow's ownership and verification roles.
A necessary contract change returns to the affected design decision.
A repeated workaround across unrelated code or incompatible state ownership is evidence to reconsider the shape.
Reopen only the decisions invalidated by that evidence, retaining the selected workflow's independent review.
