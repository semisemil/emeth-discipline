# Revise

Read source when needed:

```text
node <plugin-root>/writers/document-writer.js read --project-root <absolute-project-root> --id <DESIGN-ID>
```

Patch with UTF-8 JSON on stdin:

```text
node <plugin-root>/writers/document-writer.js patch --project-root <absolute-project-root> --id <DESIGN-ID> --change-kind major
```

```json
{"edits":[{"old":"<overview span>","new":"<replacement>"}],"documents":[
  {"path":"<existing>.md","edits":[{"old":"<span>","new":"<replacement>"}]},
  {"path":"<new>.md","body":"<design>"},
  {"path":"<retired>.md","remove":true}]}
```

Omit unused operations.
Each `old` must match exactly once in its file; edits apply in order.
`body` adds a document; `remove` retires one.
Detailed content or membership changes require `major`, even without overview changes.

Use `operational` only for metadata or work links, preserving content and membership.
