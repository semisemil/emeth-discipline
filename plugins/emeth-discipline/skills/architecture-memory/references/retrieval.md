# Retrieval details

Run `skills/architecture-memory/scripts/memory.js` with Node. Every command needs `--project-root <project>`. Retrieval is local and read-only.

## Selection

`search --query "<domain terms>" [--path <path>]` uses lexical matches, so use the project's vocabulary. Repeat `--path` for multiple owners; paths are literal prefixes, not globs. Follow `next_offset` when the current candidates do not cover an affected responsibility. History requires `--history`; a required historical link can still accompany a current record.

`read --id <ID> [--id <ID>] --revision <search-revision>` returns whole level-2 sections with document preambles, `always` records and required links. A stale revision requires a fresh search.

With no candidates, `read --id @global` reads shared constraints. Make one grounded reformulation if needed, then resolve remaining task-critical facts from code or the user.

## Reuse and bounds

For `complete: false`, continue with the same IDs and original `--seen` set plus `--cursor <next_cursor>`; do not accumulate receipts for pages of one read. Keep preceding pages in context until completion. The cursor is valid only for the same corpus and selection.

`--max-chars` sets the per-response limit. For a single larger section, inspect its exact source range with shared preamble and prerequisites. If the section and its prerequisites exceed the working context, leave the affected decision unresolved.

## Legacy and failures

Unannotated sections use temporary `document-id@line` IDs. Add stable routing under [record format](record-format.md) only when maintaining them.

`check` validates registration and section structure, excluding ordinary Markdown links and factual accuracy. Treat invalid registration as a retrieval failure. If the helper is unavailable, inspect the manifest and relevant source sections with their shared preambles and prerequisites.
