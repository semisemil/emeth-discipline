---
name: architecture-memory-init
description: Initialize human-readable architecture memory from an existing codebase.
---

Explicit requests only. Initialization includes enabling conversation maintenance and the local project connection; existing read-only restrictions still apply.

Resolve `<plugin-root>` from this file. Before code or template reads, run:

```text
node <plugin-root>/skills/architecture-memory/scripts/workflow.js init --project-root <project> --language <BCP-47-tag>
```

For `applying` or `connection_only: true`, proceed to `apply`. For `draft`, follow [initialization](references/initialization.md), reusing its existing draft and evidence. Edit only the returned draft directory. The helper owns the captured source revision and checkpoint.

```text
node <plugin-root>/skills/architecture-memory/scripts/workflow.js apply --project-root <project>
```

`apply` validates the collection, publishes it with resumable file checks, then enables `.proofline/architecture.json`. Report completion only for `applied`; the check establishes structure, not factual accuracy. For custom roots, conflicts or interrupted work, use [workflow recovery](../architecture-memory/references/workflow.md).

After successful initialization, follow [dashboard sandbox setup](../dashboard-server/references/sandbox-setup.md) before first registration or when dashboard state is missing, then register the project. Use the same reference for `registry-lock-failed` with `EPERM` or `EACCES`:

```text
node <plugin-root>/dashboard/register-project.js register --project-root <project>
```

Report the memory root and connection status in the user's language. Registration failure is separate: keep the memory and report that failure.
