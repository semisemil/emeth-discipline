---
name: development-design
when_to_use: "Write or revise a development Design, detailed documents, or Design status."
description: Design a specific change to implement with the user, and write or revise its connected Design documents for implementation and review. Also use for Design status changes.
---

# Development Design

For status-only requests, use [status](references/document-status.md).

Apply [design discussion](../rules/references/design-discussion.md) while developing a Design and [document form](references/document-form.md) when writing it.
Continue the named Design or one with the same goal; otherwise create one.
Find existing Designs with `node <plugin-root>/writers/document-writer.js list --project-root <absolute-project-root>`.
Use `DESIGN.md` for purpose, scope, and the architecture overview.
Move a subject into a detailed Markdown document in the same directory when it would crowd the overview, and link it from `DESIGN.md`.
Deliver the complete document set with valid links.
Keep [readiness](references/document-status.md) in metadata only.
Save through [creation](references/document-operations.md) or [revision](references/document-editing.md).
Capture durable project context in project architecture documents through [Architecture Memory](../architecture-memory/SKILL.md).
Use `--memory off` when recording in those documents is prohibited.
For registration access failures, use [setup](../dashboard-server/references/sandbox-setup.md).

Report the overview link (`absolute_path` when returned), readiness, and material open matters in the conversation, distinguishing save failures from registration or architecture document recording failures after a successful save.
