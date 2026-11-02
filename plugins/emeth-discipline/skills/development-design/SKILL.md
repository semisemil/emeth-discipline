---
name: development-design
when_to_use: "An explicit user request for design work or a workflow call to this skill."
description: "Use only when the user explicitly requests design work or a workflow calls this skill. Create or revise development Designs, supporting documents, or Design status."
---

# Development Design

For status-only requests, use [references/document-status.md](references/document-status.md).

Apply [../rules/references/design-discussion.md](../rules/references/design-discussion.md) while developing a Design and [references/document-form.md](references/document-form.md) when writing it.
Develop the Design through the Ground and Sketch phases in [../start-implementation/references/blueprint.md](../start-implementation/references/blueprint.md).
Its selected design forms the Design's implementation contract.
Continue the named Design or one with the same goal; otherwise create one.
Find existing Designs with `node <plugin-root>/writers/document-writer.js list --project-root <absolute-project-root>`.
Use `DESIGN.md` for purpose, scope, and an overview of the change.
Move a necessary subject into a detailed Markdown document in the same directory when it would make the overview harder to understand or use, and link it from `DESIGN.md`.
Deliver the complete document set with valid links.
Keep readiness in metadata only, as defined in [references/document-status.md](references/document-status.md).
Save through [references/document-operations.md](references/document-operations.md) or [references/document-editing.md](references/document-editing.md).
Capture durable project context in project architecture documents through [Architecture Memory](../architecture-memory/SKILL.md).
Use `--memory off` when recording in those documents is prohibited.
For registration access failures, use [../dashboard-server/references/sandbox-setup.md](../dashboard-server/references/sandbox-setup.md).

Report the overview link (`absolute_path` when returned), readiness, and material open matters in the conversation, distinguishing save failures from registration or architecture document recording failures after a successful save.
