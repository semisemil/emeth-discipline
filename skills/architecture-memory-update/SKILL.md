---
name: architecture-memory-update
description: Reconcile connected architecture memory with Git, including a minimal collection started by a Design save.
---

Explicit requests only. Resolve `<workflow>` to `<plugin-root>/skills/architecture-memory/scripts/workflow.js` from this file. Append `--project-root <project>` to each command.

Run `node <workflow> update` before code or document reads. `current` and `ignored` finish without edits; report the unchanged checkpoint. `applying` resumes with `apply`. For `draft`, reuse saved classifications and the returned draft; committed evidence is fixed at `source_revision` even when HEAD or working files change.

Run `changes` for pending paths. Classify each affected responsibility: boundaries, runtime/storage units, selected components, deployment, integrations, quality constraints and decision artifacts. Use `source --path <path> --diff` for relevant hunks and `source --path <path>` for captured context. With a null checkpoint, use the [initialization evidence pass](../architecture-memory-init/references/initialization.md#evidence-pass) on the captured inventory, reconcile current-state documents, and reconstruct no ADR history.

Locate affected memory with [retrieval](../architecture-memory/references/retrieval.md). Read and revise its draft sections through the authoring commands in [recording](../architecture-memory/references/recording.md). Update stable routing paths on renames. Non-ancestor checkpoints describe snapshot differences, not ordered history.

Persist each classification with `classify --path <path> --effect architecture|none --reason "<short evidence-based reason>"`. Use `--prefix <directory/>` for a known homogeneous group, including both sides of renames; a directory name alone does not establish irrelevance. Remaining paths disappear from subsequent `changes` pages only when classified. Keep unresolved scope pending.

Once the draft reflects every affected responsibility, run `apply`, including when classification requires no document edits. Leave checkpoint fields to `apply`; it performs the structural check. Preserve document verification fields on partial edits.

For paging, custom roots and failures, read [workflow](../architecture-memory/references/workflow.md). Publication completes at `applied`. Report changed topics and checkpoint in the user's language.
