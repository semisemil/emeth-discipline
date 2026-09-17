---
name: implementation-slice
description: "Explicit-only planning of useful independent parallel work for a ready Design, without implementation or dispatch."
---

# Design Slice

Plan only. This optional step identifies independent work that benefits from parallel execution; a ready Design can proceed directly to implementation.

## Inspect

Resolve the target Design's identity, revision, requirements, and `ready` status. Preserve the Design's authorized outcomes without renaming its identifiers, output fields, paths, commands, or quantities.

## Plan

Split only when each task owns a coherent Design result with a clear goal, change scope, and interface and can proceed independently while the main session implements another part. Dependent sequential work stays with the main implementer. File count and desired agent count do not justify splitting.

When parallel work is useful, write one `PARALLEL.md` beside `DESIGN.md`, using [the parallel plan template](assets/templates/parallel.md). Identify the Design and revision once. For the main task and each delegated task, record the goal, Design evidence, change boundaries, necessary original context and interfaces, and completion conditions without adding acceptance requirements.

Keep the plan as flat assignments, preserving the Design's contract. Do not generate Node or Gate files or parent/child execution states. Implementation tests remain selectable as the change develops, subject to Design and user-required verification.

If no useful independent work exists, report direct implementation and create no parallel plan. Preserve existing documents and records; resuming or converting a legacy execution is outside this operation.

## Validate and report

Check that every planned task traces to the ready Design, its inputs and interfaces are available, its scope stays authorized, and concurrent writes do not overlap. Resolve a dependent or conflicting assignment by keeping it sequential or revising the split; retain other independent work.

Report the Design path and revision, the optional `PARALLEL.md` path, and the reason for parallel or direct implementation. Planning ends before implementation, project verification, review, or agent dispatch.
