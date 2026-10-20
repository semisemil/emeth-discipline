---
name: ensemble
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /ensemble, 'ensemble this', 'throw it in the ensemble', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Ensemble

Open a todolist with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Start with two independent runners on GPT-6.1 Sol (`gpt-6.1-sol`). Spawn more runners when the ensemble covers multiple design directions. Pick each runner's reasoning effort for the job, per [execution](../start-implementation/SKILL.md#subagents).
4. Give each candidate its own output location (a git worktree where possible, otherwise `<temporary-directory>/ensemble-<slug>/candidate-<n>/`), per the [separate-before-serializing-shared-state](../../references/pstack/guidance/separate-before-serializing-shared-state.md) principle skill.

## Phase B: Fan out

Spawn all N subagents in one message with `run_in_background: true`, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After every Phase B candidate has delivered its completed artifact at the declared path or returned a recorded dropout, spawn one readonly judge subagent on GPT-6.1 Sol (`gpt-6.1-sol`), with reasoning effort selected per [execution](../start-implementation/SKILL.md#subagents). It sees the rubric and the completed candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the [redesign-from-first-principles](../../references/pstack/guidance/redesign-from-first-principles.md) principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the [prove-it-works](../../references/pstack/guidance/prove-it-works.md) principle skill. If verification finds a problem the ensemble missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
