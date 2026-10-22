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
Use [how](../../code-exploration/references/how.md) when understanding the existing system informs the design or the user requests an architectural explanation, and [why](../../code-exploration/references/why.md) when historical reasons affect a decision.

## Phase B: Sketch

Run [ensemble](../../ensemble/SKILL.md) with the common task, relevant evidence and [candidate prompt](blueprint/runner-prompt.md).
Apply [design exploration](../../../references/design-exploration.md) to its candidate assignments and synthesis.
For implementation, use the selected [implementation workflow](../SKILL.md#implementation-workflow) to assign the independent review's timing and target.
Select the design before dependent implementation.
The selected artifact records the boundaries, decisions and verification criteria.
Supplied types, APIs and examples remain authoritative at their source; add a sketch only for a decision they leave open.
Screen proposed boundaries against [design red flags](blueprint/design-red-flags.md) when they introduce new ownership or layering.
For a requested full design rationale, use the [rationale template](blueprint/rationale-template.md).
Reuse the synthesis as the Design contract.

Proceed to implementation when the user's request or accepted follow-ups authorize it and the selected workflow's required design checks are complete.
For a requested design checkpoint, present the selected design, its material effects and tradeoffs, and wait for explicit approval to implement.
Resolve required user decisions through [design discussion](../../rules/references/design-discussion.md).
Use [challenge](challenge.md) when the contract remains contested.

## Phase D: Implement and revise

Implement against the accepted boundaries under the selected workflow's ownership and verification roles.
A necessary contract change returns to the affected design decision.
A repeated workaround across unrelated code or incompatible state ownership is evidence to reconsider the shape.
Reopen only the decisions invalidated by that evidence, retaining the selected workflow's independent review.
