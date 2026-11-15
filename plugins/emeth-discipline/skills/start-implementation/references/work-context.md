# Work context

Reuse a read or decision while its artifact version and relevant conditions remain unchanged.
For a new question or missing context after compaction, retrieve the needed range again.

When the host offers versioned artifact reads and workflow state, use them.
The read response identifies the artifact version, returns its first content, and then returns changes or an unchanged result.
Request a full refresh when the previous content is no longer sufficient.

For other hosts, the packaged helper provides the same read behavior:

```text
node <plugin-root>/lib/work-context.js read --state <temporary-state-file> --path <file> [--from <line> --to <line>] [--refresh]
```

At a completed work boundary, retain the stage, accepted decisions, remaining issues, and artifact versions in the host's workflow state.
Recover that state after compaction before deciding which evidence is missing.
The helper also supports `checkpoint --state <file> --stage <stage> --decision <decision> --pending <issue>` and `status --state <file>`.

Use line-based search with bounded context for a local question.
Batch independent reads and return the selected ranges, rather than filtering a whole-file string.

