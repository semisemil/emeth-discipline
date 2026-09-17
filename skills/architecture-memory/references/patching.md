# Exact record patches

For ordinary creation and section edits, use [authoring](recording.md). This interface remains available for exact replacements, section retirement and allowed ADR lifecycle edits.

For existing sections, use the `receipt` from `memory.js read` as `expected`; new sections use `null`. Send UTF-8 JSON on stdin:

```text
node <skill-root>/scripts/record.js patch --project-root <project> --document <document-ID>
```

```json
{"edits":[{"id":"AM-example","expected":"<receipt>","text":"<complete routed section>"}]}
```

Use [record format](record-format.md) for serialized sections. `text: null` retires a resolved temporary section only when its reasons need not remain.

An `intro` edit uses `{"before":"<exact trimmed preamble>","after":"<replacement preamble>"}`. Set `edits: []` for introduction-only changes; preserve [accepted ADR history](decision-templates.md).

For related documents, omit `--document` and send `{"documents":[{"document":"context","edits":[...]},{"document":"adr-001","intro":{"before":"...","after":"..."},"edits":[]}]}`. New documents additionally need `path` and `kind`.

On conflict, reread and reconcile the affected section. Resume interrupted publication with `record.js ensure --project-root <project>`. During init/update, this low-level interface is unavailable; use authoring commands or edit the returned draft directly, then workflow `apply`.
