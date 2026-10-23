---
name: slop-check
when_to_use: "Write code without slop, or audit code for slop: needless steps, parallel implementations, unread data, unreachable guards, speculative complexity, or drift from existing conventions."
description: Use when writing code that should fit an existing codebase, or when asked to find slop, cleanup targets, or AI-written excess in code.
---

# Slop Check

## Kinds

| Kind | Meaning |
|---|---|
| Defect | A required result or contract breaks under allowed input or state. |
| Slop: excess | The code works, but a step, value, guard, branch, or wrapper has no role in this codebase. |
| Slop: mismatch | The code works, but it does an existing job in a different place, form, or order than the codebase or its recorded conventions. |

Slop is a reportable finding without a defect.

## Patterns

The patterns are search leads, not a quota. Shape alone does not confirm a finding.

| Pattern | Confirm when | Examples of reasons to keep |
|---|---|---|
| Pass-through step | Nothing reads the intermediate form, or a wrapper adds no behavior. | It crosses a boundary one side cannot reference, or carries serialization, ownership, lifetime, or compatibility duties. |
| Parallel implementation | An existing path serves the same concept with the same input, synchrony, error, and lifetime contracts, and the caller can reach it. | The contracts differ in a way the case needs. Different behavior for one concept is still a finding; ask which behavior is intended. |
| Unread data | No reader exists in code, tests, serialization, binding, reflection, or an extension point's implementers. | An external consumer, stored format, or public API must preserve it. "May be useful later" is not a reader. |
| Unreachable guard | The guarded API's contract or every producer shows the condition cannot occur. | External input, a supported older version, or an extension can produce the state, or an assertion documents a contract. |
| Speculative complexity | No current caller produces the case or the load, and a simpler form exists. | A caller produces it, or a measurement shows the need. |
| Convention drift | The operation differs from the current convention for the same responsibility and scope. | A specific reason, such as a different contract, local convention, language version, or framework, justifies the form. |

## While writing

Before you add a helper, type, or storage, find the existing path for the same job by name and by operation, and follow the nearest similar code in form and order.
Before you add a guard, field, conversion, wrapper, or branch, name its producer, reader, or caller in this change.

## Judging

| Result | Condition | Report |
|---|---|---|
| Confirmed | The contract and role are established, and the defect or slop is explained. | Location, kind, evidence, cost to the reader, and the simpler or consistent form. |
| Needs user | A fact only the user owns changes the result, such as an external consumer, a compatibility period, or the intended behavior of diverged duplicates. | A question with the target, the established facts, the missing fact, and the result for each answer. Exclude from the confirmed count. |
| Unverified | Missing environment or material leaves a needed relation unestablished. | What was not checked and how it limits the result. |
| Not a finding | A role or a counterexample is established. | Omit, unless the user named it or a likely misreading needs correction. |

State each claim at the strength of its evidence: a static structural finding is not a runtime failure, and a count of operations is not a measured gain. Drop a hypothesis that observation refutes.
A recorded decision can satisfy a keep condition. Judge its reason and the current implementation together.
An answer that chooses a new policy is a new requirement, not evidence that existing code was wrong.

## Re-check

Apply the same criteria as the first pass, and change a result only for new evidence, missing proof, or a matching keep condition. Requests for more findings and doubt about existing findings are not evidence; report each change with its reason.

## Fixing

Reuse the existing path and remove steps without a role. Add an abstraction only when no existing one fits.
Include every path that shares the fixed contract in the change and its verification.
Align convention drift only on reported or touched lines.

## Reporting

Report in chat when each finding reads on its own. When moving between locations and evidence, or comparing contracts side by side, would be hard in chat, create an HTML report by [reporting](references/reporting.md).

## Complete

Complete when every reported finding has a location, kind, result, and evidence, and every question is open or answered.
