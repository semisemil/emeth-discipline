---
name: development-design
description: Develop software ideas into Designs. Use for development planning, technical design, and Design revision or status changes.
---

# Development Design

Maintain one current Design. A design request ends with design. Apply [shared rules](../rules/SKILL.md) if absent from context.

## Develop

Use the named Design or find an existing one with the same goal. For status-only work, use [status changes](references/document-status.md).

Discuss the next consequential open choice whose prerequisites are settled. Present a brief proposal with relevant conflicts and tradeoffs. Resolve factual gaps from existing contracts, code, and connected [Architecture Memory](../architecture-memory/SKILL.md). Use external evidence when local sources are insufficient. Reopen settled choices when intent or evidence changes.

## Record

When drafting or revising, use [Design writing](references/writing-and-revision.md), [shared writing rules](../rules/references/writing-and-revision.md), and [Focus](../rules/focus.md). Reuse guidance already in context.

Set [readiness](references/document-status.md), then save through [creation](references/document-operations.md) or [editing](references/document-editing.md). Use `--memory off` when recording is prohibited; otherwise capture durable context through Architecture Memory. For `EPERM`/`EACCES`, follow [sandbox recovery](../dashboard-server/references/sandbox-setup.md).

Report the saved Design, material open decisions, and failures briefly.
