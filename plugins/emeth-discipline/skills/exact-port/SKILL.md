---
name: exact-port
description: Use when the user asks to port, migrate, copy, or transplant an implementation while preserving behavior exactly or forbidding a rewrite. Keep the source authoritative and require approval for every deviation.
---

# Exact Port

Reuse existing plans and evidence records. When a separate document is useful, use `assets/templates/exact-port-plan.md` for a plan or `assets/templates/exact-port-report.md` for a report; fill applicable sections.

## Before

The source is authoritative. Do not simplify, rewrite, omit, rename, or change behavior unless the user approved it.

If an unapproved deviation is needed, stop before editing and ask approval or report blocked.

Track source-target mapping and every approved deviation with reason, approval, and evidence.

## Complete

Treat equivalence as a gated claim.

Count a command-based check as passed only when current-task tool evidence shows that it completed with exit code `0`.

```text
if observed_comparison_failure or observed_nonzero_exit_code:
    report("failed")
elif declined or blocked or interrupted or not_run or exit_code_unknown:
    report("not verified")
```

Record the execution state and reason; command failure alone does not establish a behavior mismatch. A planned command, expected output, reasoning, or unrecorded run is not observed evidence and must not be reported as `PASS` or counted as passed.

Behavior evidence must independently exercise or compare the authoritative source and the actual target artifact. Defining both implementations from the same copied logic in a temporary check does not verify the port. User-provided comparison results support only the cases they explicitly cover. If either artifact cannot be inspected or a required comparison cannot run, report equivalence as not verified.

Do not claim equivalence while a required check is failed or not verified, or while an unapproved deviation remains.

Record confirmed equivalent parts and each check's coverage, observed status, exit code, and result with the equivalence evidence. In the final response, summarize overall equivalence status, deviations, and unverified parts; refer to the existing record for mappings and detailed results.

Evidence can include independently run same-input/output tests, fixture/API/snapshot comparison, search for missing source parts, and typecheck/build/test results.
