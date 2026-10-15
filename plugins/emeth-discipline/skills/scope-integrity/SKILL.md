---
name: scope-integrity
when_to_use: "Preserve multiple requirements and completion criteria across paths or implementation stages."
description: Use for large, risky, or multi-stage work where requirements could be dropped along the way, such as many requirements satisfied together, requested behavior applied across multiple execution paths, or changes implemented in stages. Preserve the user's requirements, constraints, and completion criteria so they are not omitted or arbitrarily reduced during the work.
---

# Scope Integrity

Preserve the user's goal, required outcomes, constraints, and completion criteria throughout the task. Apply each requested behavior wherever its own stated conditions hold, including existing execution paths; keep exceptions local to that behavior. Distinguish explicit user-approved changes from implementation choices; an execution plan, assistant summary, or partial result does not replace the user's requirements.

The conversation and authoritative task sources define the scope; this skill requires no additional task record, contract document, or status file.

Resolve failures within authorized scope. If a requirement cannot be met, explain the affected outcome and blocker, continue independent authorized work, and obtain user approval before changing scope or completion criteria. Never silently omit, weaken, or substitute a requirement to make the task appear complete.

Claim completion only when every required outcome is satisfied. State unmet requirements and unverified checks with their effect on completion; keep optional improvements separate.
