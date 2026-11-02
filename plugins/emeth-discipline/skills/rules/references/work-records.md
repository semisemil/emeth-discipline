# Work record entry

Use only the authorized record scope.
For missing related state/sources, run:

```text
node "<plugin-root>/writers/document-writer.js" context --records <issues|designs|both> --project-root <project> --query "<behavior identifier>"
```

The result contains bounded Issue briefs, complete matching Design bodies and the ordinary save contract.
In Codex `functions.exec`, run context with `--format codex-text` and read its output directly.
It contains exact source bodies and an inline save example.
When the task names a code identifier or path, use this command as the initial source and record read.
Every call requires `--records`: `issues`, `designs`, or `both` for the authorized record kinds.
Design discovery requires `--query` or `--path`.
Query terms use literal OR matching; use precise identifiers rather than a task description.
For code work, add `--code-context 8` to receive bounded source excerpts, a project file inventory and root build/instruction files with the records.
Matching source files that fit the shared budget are supplied in full as Project file entries; reuse complete supplied files and guidance.
The same read includes Git source status, excluding record stores.
This also supplies bounded ancestor AGENTS.md files.
Issue-only context accepts `--code-context 8` without a query for inventory and instructions before source selection.
Use normal code tools for missing or truncated context or unavailable search.
If the host truncates a context response, retrieve the missing record text with scoped read/section commands before editing.
Repeat `--file <path>` for known source, instruction or configuration files in the project, so their contents arrive with the records.
Issue filters are independent: `--issue-id <known-ID>` or `--issue-query "<goal>"`.
Continue Issue pages with `--issue-offset`; Design pages with `--offset` and `--expected-revision`.
Resolve diagnostics and remaining pages before treating coverage as complete, and reuse established coverage for the same behavior.
When sufficient state/sources are already supplied, use [work-records-save.md](work-records-save.md) directly.
