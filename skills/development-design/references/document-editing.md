# Edit a Design

Read the Design when its current text is needed:

```text
node <plugin-root>/writers/document-writer.js read --project-root <absolute-project-root> --id DESIGN-0001
```

Send changed spans as UTF-8 JSON on stdin to:

```text
node <plugin-root>/writers/document-writer.js patch --project-root <absolute-project-root> --id DESIGN-0001 --change-kind major
```

```json
{"edits":[{"old":"The request returns an ID.","new":"A successful request returns an ID."}]}
```

Edits apply in order; each `old` must match exactly once. For body/contract changes, use `major` and reassess readiness; the command increments revision automatically. Use `operational` for link/status changes without changing the body. Include any required metadata changes other than revision.

Use [the status command](document-status.md) for status-only changes.
