# Create a Design

Send only the UTF-8 Markdown body on stdin:

```text
node <plugin-root>/writers/document-writer.js create --project-root <absolute-project-root> --title <title> --slug <lowercase-hyphenated-name> --kind <kind> --status <status> --language <document-language>
```

Kinds: `feature | bug | refactor | exact_port | maintenance` (default `feature`). Status defaults to `draft`; choose readiness under the skill's criteria.

The command allocates the next ID, creates `.proofline/designs/<ID>-<slug>/DESIGN.md`, and generates metadata with revision 1 and empty links. Supply `--id DESIGN-NNNN` only when a specific unused ID is required. For explicit issue targets, apply [work links](../../issue-ledger/references/work-link.md).
