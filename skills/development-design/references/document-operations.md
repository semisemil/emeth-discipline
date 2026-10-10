# Create

Send UTF-8 JSON on stdin:

```text
node <plugin-root>/writers/document-writer.js create --project-root <absolute-project-root> --title <title> --slug <lowercase-hyphenated-name> --kind <kind> --status <status> --language <document-language> --input-format documents
```

```json
{"body":"<DESIGN.md overview with relative links>","documents":[{"path":"<topic>.md","body":"<detailed design>"}]}
```

Detailed paths are relative to `.emeth/designs/<ID>-<slug>/`; overview links must reach all members.

Kinds are `feature | bug | refactor | exact_port | maintenance`.
Supply `--id DESIGN-NNNN` only when a particular unused ID is required.
For explicit issue targets, apply [work links](../../issue-ledger/references/work-link.md).
