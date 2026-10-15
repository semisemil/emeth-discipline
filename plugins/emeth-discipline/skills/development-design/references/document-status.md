# Status

Assess the entire document set:

| Status | Condition |
| --- | --- |
| `draft` | Material facts or decisions are unresolved, or the user asked to keep it as a draft |
| `ready` | Selected form, complete and consistent documents and links, established scope, behavior, contracts, and acceptance conditions; material choices accepted or resolved within delegation |
| `blocked` | External prerequisite prevents progress |
| `completed` | Verification establishes every required condition of the final set revision |
| `cancelled` | The user requested stopping the work |

For status-only changes:

```text
node <plugin-root>/writers/document-writer.js status --project-root <absolute-project-root> --id <DESIGN-ID> --status <state>
```

Status-only requests do not authorize implementation or verification.
Replacement is declared by the new Design through [creation](document-operations.md) `--supersedes`, not by a status change.
