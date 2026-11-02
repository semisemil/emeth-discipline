---
name: architecture-memory-init
when_to_use: "Explicit request only: initialize project architecture documents from an existing codebase."
disable-model-invocation: true
description: Initialize human-readable project architecture documents from an existing codebase and connect them through .emeth/architecture.json.
---

Explicit requests only.
Initialization connects project architecture documents through `.emeth/architecture.json` and enables their maintenance during conversation.

Resolve `<plugin-root>` from this file. Before code or template reads, run:

```text
node <plugin-root>/skills/architecture-memory/scripts/workflow.js init --project-root <project> --language <BCP-47-tag>
```

For `applying` or `connection_only: true`, proceed to `apply`. For `draft`, follow [references/initialization.md](references/initialization.md), reusing its existing draft and evidence. Edit only the returned draft directory.

```text
node <plugin-root>/skills/architecture-memory/scripts/workflow.js apply --project-root <project>
```

Completion requires `applied`; `apply` checks structure, not factual accuracy. For custom roots, conflicts or interrupted work, use [../architecture-memory/references/workflow.md](../architecture-memory/references/workflow.md).

After successful initialization, register the project:

```text
node <plugin-root>/dashboard/register-project.js register --project-root <project>
```

Accept registration `registered` or `no-op` as complete.
For a registration failure reporting `EPERM` or `EACCES`, follow [../dashboard-server/references/sandbox-setup.md](../dashboard-server/references/sandbox-setup.md).
Report the architecture document root and connection status in the user's language.
Registration failure is separate: keep the architecture documents and report that failure.
