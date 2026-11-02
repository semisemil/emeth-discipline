---
name: development-design
when_to_use: "Explicit Design work or workflow artifacts; enabled maintenance without a supplied work-record entry or contract."
description: "Create, revise or explore Designs on an explicit Design request or workflow call. For enabled automatic maintenance, use this skill only when no work-record entry or contract is supplied."
---

# Development Design

For status-only requests, use [references/document-status.md](references/document-status.md).

For authorized changes to an existing Design, use [../rules/references/work-records.md](../rules/references/work-records.md).
Use [references/document-editing.md](references/document-editing.md) for advanced editing contracts.
Automatic related Design updates are off by default; an existing connection alone does not authorize an update.
An explicit Design request or invoked workflow retains its required document scope.
New Design creation or design exploration follows an explicit design request or a workflow call.

## Develop a Design

Apply [../rules/references/design-discussion.md](../rules/references/design-discussion.md) while developing a Design and [references/document-form.md](references/document-form.md) when writing it.
Develop the Design through the Ground and Sketch phases in [../start-implementation/references/blueprint.md](../start-implementation/references/blueprint.md).
Its selected design forms the Design's implementation contract.
Continue the named Design or one with the same goal; otherwise create one.
Find candidates by affected code paths or topics through [references/document-editing.md: Find related Designs](references/document-editing.md#find-related-designs), reusing established discovery coverage.
Use `DESIGN.md` for purpose, scope, and an overview of the change.
Move a necessary subject into a detailed Markdown document in the same directory when it would make the overview harder to understand or use, and link it from `DESIGN.md`.
Deliver the complete document set with valid links.
Keep readiness in metadata only, as defined in [references/document-status.md](references/document-status.md).
Save through [references/document-operations.md](references/document-operations.md) or [references/document-editing.md](references/document-editing.md).
Capture durable project context in project architecture documents through [Architecture Memory](../architecture-memory/SKILL.md).
Use `--memory off` when recording in those documents is prohibited.
For registration access failures, use [../dashboard-server/references/sandbox-setup.md](../dashboard-server/references/sandbox-setup.md).

Report the overview link (`absolute_path` when returned), readiness, and material open matters in the conversation, distinguishing save failures from registration or architecture document recording failures after a successful save.
