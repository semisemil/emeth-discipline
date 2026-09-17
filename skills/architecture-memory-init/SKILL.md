---
name: architecture-memory-init
description: Initialize human-readable architecture memory from an existing codebase.
---

Explicit requests only. Initialization includes enabling conversation maintenance and the local project connection.

Resolve `<plugin-root>` from this file. Before code or template reads, run:

```text
node <plugin-root>/skills/architecture-memory/scripts/workflow.js init --project-root <project> --language <BCP-47-tag>
```

For `applying` or `connection_only: true`, proceed to `apply`. For `draft`, follow [initialization](references/initialization.md), reusing its existing draft and evidence. Edit only the returned draft directory.

```text
node <plugin-root>/skills/architecture-memory/scripts/workflow.js apply --project-root <project>
```

Completion requires `applied`; `apply` checks structure, not factual accuracy. For custom roots, conflicts or interrupted work, use [workflow recovery](../architecture-memory/references/workflow.md).

After successful initialization, register the project:

```text
node <plugin-root>/dashboard/register-project.js register --project-root <project>
```

Accept registration `registered` or `no-op` as complete. For a registration failure reporting `EPERM` or `EACCES`, follow [dashboard sandbox recovery](../dashboard-server/references/sandbox-setup.md). Report the memory root and connection status in the user's language. Registration failure is separate: keep the memory and report that failure.
