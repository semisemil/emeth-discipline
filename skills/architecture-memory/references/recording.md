# Record durable context

Memory body content describes project conditions, architecture, decisions, or evidence needed to assess them. Authoring directions govern the work; session activity belongs in the completion report. Organize current-state records by architectural subject rather than conversation or investigation order.

Reuse the canonical section or search the concept before adding one. Each independently useful item belongs in a routed level-2 section under [record format](record-format.md). Keep its reasons and limits together. Detailed contracts remain in their Design; link them rather than copying their requirements.

Use the manifest language and omit empty conditional sections or rows. Template placeholders specify content, not sentence form; labeled phrases are valid.

## Patch relevant sections

Use the `receipt` returned by `memory.js read` as the expected value for each existing section. For a new section use `expected: null`. Send only changed sections on stdin:

```text
node <skill-root>/scripts/record.js patch --project-root <project> --document <registered-document-ID>
```

```json
{"edits":[{"id":"AM-example","expected":null,"text":"## Topic\n<!-- am: {\"id\":\"AM-example\"} -->\n\n**confirmed/planned**\n\nAccepted target with its actual source, scope, reasons and conditions.\n"}]}
```

Use `text: null` to retire a resolved temporary section only when its reasons need not remain.

For a new document add `--path <relative-markdown-path> --kind <manifest-kind>` with a unique `--document` ID.

For related changes across documents, omit `--document` and send `{"documents":[{"document":"context","edits":[...]},{"document":"adr-001","path":"decisions/ADR-001-choice.md","kind":"decision","edits":[...]}]}`. A document item may include `"intro":{"before":"<exact trimmed current preamble>","after":"<replacement preamble>"}` for its title or allowed ADR lifecycle fields; use `before: null` for a new document and `edits: []` for an introduction-only change.

On a section conflict, reread and reconcile that section before retrying. Resume interrupted publication with `record.js ensure --project-root <project>` before another patch, retrieval, or init/update.

During init/update, edit the returned operation draft and publish with `apply`. Use this patch helper for ordinary capture.

Load [base templates](base-templates.md) only for a requested structural survey, [component templates](component-templates.md) when a responsibility requires L3, or [decision templates](decision-templates.md) to create or revise an ADR.
