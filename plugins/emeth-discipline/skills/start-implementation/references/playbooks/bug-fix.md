### Bug fix

The calling conversation owns the fix and its integration under the selected [implementation workflow](../../SKILL.md#implementation-workflow).

Be scientific. Every shipped line traces to runtime evidence. Belt-and-suspenders that "might help" is a hypothesis, not a fix. It does not ship. When evidence refutes a hypothesis, revert what it motivated. The smallest change the evidence justifies ships, nothing more.

1. Reproduce it yourself on the matching surface via the matching control tools in [execution](../../SKILL.md#subagents), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
2. Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with [how](../../../code-exploration/references/how.md) over the affected subsystem and the [why](../../../code-exploration/references/why.md) skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with the host's supported loop or repeated experiments on the real artifact. Confirm the surviving *mechanism* with runtime evidence before the step-3 blueprint/challenge fan-out.
3. Plan the fix. If it crosses a function boundary, [blueprint](../blueprint.md) first. Implement and complete the selected workflow's independent work, preserving the failing-test-first conditions below.
4. Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
5. Stage the commits so the failing repro lands before the fix in git history. See the [regression-test](../regression-test.md) skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear.
   This is the canonical [sequence-verifiable-units](../../../../references/pstack/guidance/sequence-verifiable-units.md) principle skill, the failing test first and the fix on top.

**Reply:** what was broken, root cause, fix, how you verified. Paste failing-then-passing repro output verbatim.
