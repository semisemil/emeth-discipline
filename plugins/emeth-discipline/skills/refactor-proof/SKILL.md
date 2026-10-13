---
name: refactor-proof
description: Use for structural refactors involving responsibility ownership, call paths, dependencies, or state/data flow. Verify that the intended structure is actually used.
---

# Refactor Proof

## Before

Map each requested structural change to its current and intended responsibility owner, call path, dependency direction, or state/data flow; select the relationships needed to judge that change.

Reuse existing goals, plans, and evidence records. When a separate document is useful, use `assets/templates/refactor-proof-plan.md` for a plan or `assets/templates/refactor-proof-report.md` for a report; fill applicable sections.

Apply behavior changes authorized by the request; preserve other observable behavior, including input handling and error outcomes.

## Complete

Complete when every requested structural outcome is implemented and evidenced and required checks pass: intended owners, paths, and dependencies are active in the affected code, and coupling targeted for removal or reduction is removed or reduced as planned.

Verify structural outcomes and preserved behavior with relevant checks; link each result to its known coverage. Record unavailable checks as unverified.

When work remains, report the current owner or coupling, intended owner or path, required change, and next proof check.
