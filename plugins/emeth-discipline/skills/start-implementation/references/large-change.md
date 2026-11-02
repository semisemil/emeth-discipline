---
name: large-change
description: "Design an auditable playbook when no narrower one fits: a large migration, an ambitious multi-part change, or work a human reviews after stepping away. Scales rigor to the task, runs a hypothesis loop, and logs decisions. Use for /large-change or 'figure it out'."
disable-model-invocation: true
---

# Figure it out

When the task matches no playbook, design one. The deliverable before any code is the workflow itself: a sequence of phases that scales rigor to the task, runs the scientific method, and leaves a decision trail a human can audit after stepping away.

Retain the ownership and independent verification roles of the selected [../SKILL.md: Implementation workflow](../SKILL.md#implementation-workflow) when composing its task-specific phases.

## Start

Open a todolist whose first item is to read the [../SKILL.md: Principles](../SKILL.md#principles). Then add the phases below as todos.

## Phase A: Frame

Ground first, then commit. Don't start the run until you can state:

- The definition of done as a falsifiable predicate (the guidance in [../../../references/pstack/guidance/prove-it-works.md](../../../references/pstack/guidance/prove-it-works.md)).
- Scope, quantified: rough units and effort, plus the blockers grounding surfaced.
- The rigor level, biased high. One-way doors and high blast radius get more. Reversible low-stakes steps get less. Rigor is gates and artifacts, not "try harder".

Present the framing and tradeoffs before committing to a long run. Reversible work proceeds (the guidance in [../../../references/pstack/guidance/never-block-on-the-human.md](../../../references/pstack/guidance/never-block-on-the-human.md)), but a multi-hour run earns one checkpoint.

## Phase B: Design the workflow

Decompose into atomic, independently-landable units. Sequence riskiest-unknown-first. Scaffold and verification come before features (the guidance in [../../../references/pstack/guidance/foundational-thinking.md](../../../references/pstack/guidance/foundational-thinking.md)).

- Build the verification harness before the work, with the baseline captured from the pre-change state, so the check reads as "old value vs new value".
- For one-way-door design decisions, run the workflow in [blueprint.md](blueprint.md) (it runs [ensemble](../../ensemble/SKILL.md)). Skip it for mechanical work whose shape is already concrete. A second ensemble over a settled design is over-engineering (the guidance in [../../../references/pstack/guidance/laziness-protocol.md](../../../references/pstack/guidance/laziness-protocol.md)).
- Decide what fans out. Parallelize only across seams, and give each worker its own worktree or branch (the guidance in [../../../references/pstack/guidance/separate-before-serializing-shared-state.md](../../../references/pstack/guidance/separate-before-serializing-shared-state.md)). Don't over-fan. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the [../SKILL.md: Subagents](../SKILL.md#subagents).
- Write the designed phase list down. That list is what the human reviews.

Then execute the design. Add its steps to the todolist as concrete items between the Phase C and Phase D entries. Run each under the Phase C loop discipline, and weave the Phase D log through them, a row as each step lands, rather than saving the whole trail for the end.

## Phase C: Run the loop

Each unit is an experiment. State the hypothesis, make the smallest change, measure against the predicate on the real artifact, keep it if it advanced, revert it if it didn't. Apply the guidance in [../../../references/pstack/guidance/sequence-verifiable-units.md](../../../references/pstack/guidance/sequence-verifiable-units.md), verifying each unit before starting the next instead of batching checks at the end.

- Verify by inspecting the artifact, never a self-report. When something passes too easily, suspect the observation method before the system.
- Pair delegated work with a judge. If a worker games the gate, reset and harden the contract. If the gate itself is wrong, fix the gate in its own change rather than routing around it.
- A verdict is VERIFIED, NOT VERIFIED, or INCONCLUSIVE. Inconclusive is not a pass. Don't hide a negative.

## Phase D: Keep the audit trail

Log the run via the workflow in [../../../references/pstack/show-me-your-work.md](../../../references/pstack/show-me-your-work.md). This work is usually ambitious enough to commit the trail so the reviewer can read it with the implementation. The trail plus the diff is what lets the human come back and trust the work.

## Phase E: Verify and hand back

Check the whole against the Phase A predicate on the real product, not just the harness. Encode any recurring correction as a gate, a lint rule, a check, or a script (the guidance in [../../../references/pstack/guidance/encode-lessons-in-structure.md](../../../references/pstack/guidance/encode-lessons-in-structure.md)).

**Reply:** the playbook you designed, the rigor level and why, the decision-trail path, what's verified against the predicate, and what's still open.
