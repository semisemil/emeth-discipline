---
name: development-design
description: Create or revise development planning and design documents (Designs) by clarifying software ideas and requirements with the user. Also use for Design status changes.
---

# Development Design

Partner with the user to complete development planning and design documents.
Start from goals and constraints and decide together what to build and how it should behave under different conditions.
Read and apply [shared rules](../rules/SKILL.md) if absent from context.

## Develop Together

Explain your recommendation for the current problem, your reasoning, and how behavior will change.
Discuss important choices with the user and decide details within the established goals and constraints.

Address prerequisite decisions first.
When an issue is settled, proactively present the next issue with a recommendation and any necessary questions.
Lead the discussion until the features and behavior within the requested scope are concrete and documented.

Confirm facts and background as needed from existing contracts, code, documentation, and connected [Architecture Memory](../architecture-memory/SKILL.md).

## Write the Design

Continue working on the named Design or an existing one with the same goal; create one if none exists.
For status-only requests, follow [status changes](references/document-status.md).
Apply [shared writing rules](../rules/references/writing-and-revision.md) when drafting or revising.

Specify what will be built or changed, how it should behave under the relevant conditions, the expected results, and how to check them.
The Design must be understandable without reconstructing the conversation.
Leave implementation details open when changing them would preserve the designed behavior and structure.

Include a concrete case when checking each part separately would miss an incorrect final result or lost state.
Use Mermaid code blocks for diagrams.

## Save and Report

Set [readiness](references/document-status.md), then save through [creation](references/document-operations.md) or [editing](references/document-editing.md).
Use `--memory off` when recording is prohibited; otherwise capture durable project context through Architecture Memory.
If `EPERM` or `EACCES` occurs, follow [sandbox recovery](../dashboard-server/references/sandbox-setup.md).

Briefly report the saved Design, important unresolved points, and any failed work.
