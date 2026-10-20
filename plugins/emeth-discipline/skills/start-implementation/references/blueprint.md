---
name: blueprint
description: "Resolve implementation boundaries with two independent designs and synthesize the selected contract."
disable-model-invocation: true
---

# Blueprint

## Phase A: Ground the problem

Read the affected source and establish the inputs, outputs, state ownership and existing contracts that constrain the change.
Carry source paths and decisive observations into design.
Reuse valid source evidence and fill the gaps needed for open decisions.
Use [how](../../code-exploration/references/how.md) for a requested architectural explanation and [why](../../code-exploration/references/why.md) when historical reasons affect a decision.

## Phase B: Sketch

Run [ensemble](../../ensemble/SKILL.md) with the common task, source evidence and [candidate prompt](blueprint/runner-prompt.md).
For implementation, use the selected [implementation workflow](../SKILL.md#implementation-workflow) to assign the independent review's timing and target.
Select the design before dependent implementation.
The selected artifact records the boundaries, decisions and verification criteria.
Supplied types, APIs and examples remain authoritative at their source; add a sketch only for a decision they leave open.
Screen proposed boundaries against [design red flags](blueprint/design-red-flags.md) when they introduce new ownership or layering.
For a requested full design rationale, use the [rationale template](blueprint/rationale-template.md).
Reuse the synthesis as the Design contract.

Proceed to implementation unless the user requested a design checkpoint or a material decision needs their answer.
Use [challenge](challenge.md) when the contract remains contested.

## Phase D: Implement and revise

Implement against the accepted boundaries under the selected workflow's ownership and verification roles.
A necessary contract change returns to the affected design decision.
A repeated workaround across unrelated code or incompatible state ownership is evidence to reconsider the shape.
Reopen only the decisions invalidated by that evidence, retaining the selected workflow's independent review.
