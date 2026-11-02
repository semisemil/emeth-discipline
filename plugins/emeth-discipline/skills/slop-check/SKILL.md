---
name: slop-check
when_to_use: "Write code without slop, or audit code for slop: needless steps, parallel implementations, unread data, unreachable guards, speculative complexity, or drift from existing conventions."
description: Use when writing code that should fit an existing codebase, or when asked to find slop, cleanup targets, or AI-written excess in code.
---

# Slop Check

## While writing

Before you add a helper, type, or storage, find the existing path for the same job by name and by operation, and follow the nearest similar code in form and order.
Before you add a guard, field, conversion, wrapper, or branch, name its producer, reader, or caller in this change.

## Fixing

Reuse the existing path and remove steps without a role. Add an abstraction only when no existing one fits.
Include every path that shares the fixed contract in the change and its verification.
When replacing a path, verify that affected callers use the intended path and remove the replaced path unless a keep condition applies.
Align convention drift only on reported or touched lines.

## Audit and findings

Before auditing existing code, judging or re-checking a suspected slop finding, or reporting findings, read [references/audit.md](references/audit.md).
It owns defect/slop kinds, search leads, keep conditions, evidence-based judgments and reporting.
