---
name: ensemble
description: "Develop two independent candidates, compare and synthesize them, and obtain one independent review."
disable-model-invocation: true
---

# Ensemble

## Phase A: Frame

Set one common task from the user's requirements and the current source evidence.
State the artifact and open boundary each candidate owns, with distinct output paths.
Use two independent candidates and one independent judge.
Select their settings through [Subagents](../start-implementation/SKILL.md#subagents).

## Phase B: Fan out

Dispatch both candidates from the common factual baseline, before developing a preferred solution.
Give each assignment its prescribed role prompt, source paths, owned output paths and the host's completion contract.
Use the host mapping in [Harness](../start-implementation/SKILL.md#harness).
The candidates develop their solutions independently.

## Compare and synthesize

After dispatch, derive concrete comparison criteria from the task, before reading the answers.
Once both candidates are complete, select a base and incorporate useful differences into one coherent artifact.
For an already supplied interface, synthesize its remaining implementation decisions; established behavior stays at its source.
Record the selected base, accepted differences, material rejected proposals and unresolved limits once, alongside the artifact.

Apply the [independent review](#independent-review) at its owning boundary.

## Independent review

For implementation, the calling [implementation workflow](../start-implementation/SKILL.md#implementation-workflow) assigns the review's timing and target.
For a design-only request or requested design checkpoint, review the selected design before handing it back or implementing it, including when candidates were not used.
A checkpoint's completed review remains valid while its contract and evidence remain unchanged.

Use one independent judge with the settings in [Subagents](../start-implementation/SKILL.md#subagents).
Give it the original requirements, source baseline, review target and verification evidence by path.
Include candidate artifacts and comparison criteria when candidates were used.
Use a fresh context without the owner's preference or prior analysis.
Give the reviewer [tenet-me](../tenet-me/SKILL.md) as its review procedure.
It traces the target against required outcomes and affected existing public behavior, independently of implementation reasoning and test expectations.
When alternatives are supplied, it also compares them.
The target is readonly; the reviewer may write its own report artifact.
Its return contract is the review recommendation, material counterexamples and unresolved evidence limits, with a recommended base and decisive differences when alternatives are supplied.

Resolve material findings through the artifact owner and retain the judge for review of affected corrections.
The calling workflow owns integration, verification and delivery.

## Verify

Verify the synthesized artifact against the original requirements and affected existing contracts.
Reuse unchanged evidence and completed checks.
Resolve material failures before treating the artifact as accepted.
Return the final artifact path, synthesis decision and verification result.
