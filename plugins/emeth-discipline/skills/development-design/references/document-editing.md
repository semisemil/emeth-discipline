# Revise

Read the source needed for the change:

```text
node <plugin-root>/writers/document-writer.js read --project-root <absolute-project-root> --id <DESIGN-ID>
```

With no selection, `read` returns the overview and all detailed documents.
Use `--document DESIGN.md` for the overview or a detailed path relative to its Design directory, such as `--document contracts/request.md`.
Add `--section "<heading text>"` to return that heading and its subsections, ending before the next heading of the same or higher level.
Without `--document`, `--section` selects from the overview.
ATX (`#`) and Setext headings are matched by exact heading text, including inline Markdown; absent or duplicate titles fail.
Partial reads return `id`, `path`, and source `text`, retaining line endings and validating the entire document set.

Patch with UTF-8 JSON on stdin:

```text
node <plugin-root>/writers/document-writer.js patch --project-root <absolute-project-root> --id <DESIGN-ID> --change-kind major
```

```json
{"edits":[{"old":"<overview span>","new":"<replacement>"}],"documents":[
  {"path":"<existing>.md","edits":[{"old":"<span>","new":"<replacement>"}]},
  {"path":"<new>.md","source":"<absolute path to the completed artifact>"},
  {"path":"<retired>.md","remove":true}]}
```

Omit unused operations.
Each `old` must match exactly once in its file; edits apply in order.
`source` adds an existing UTF-8 artifact unchanged; use `body` for new text.
Keep its relative links valid at the destination path.
`remove` retires a document.
Detailed content or membership changes require `major`, even without overview changes.

Use `operational` only for metadata or work links, preserving content and membership.
