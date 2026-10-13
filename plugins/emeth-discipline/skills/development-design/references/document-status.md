# Status

Assess the entire document set:

| Status | Condition |
| --- | --- |
| `draft` | Material facts or decisions unresolved, or requested |
| `ready` | Selected form, complete and consistent documents and links, established scope, behavior, contracts, and acceptance conditions; material choices accepted or resolved within delegation |
| `blocked` | External prerequisite prevents progress |
| `completed` | Verification establishes every required condition of the final set revision |

For status-only changes:

```text
node <plugin-root>/writers/document-writer.js status --project-root <absolute-project-root> --id <DESIGN-ID> --status <state>
```

Status-only requests do not authorize implementation or verification.
Cancel only when requested.
For replacement, put the previous ID in the new Design's `supersedes`.
