# Revise

Apply this revision workflow when requested, required by an invoked workflow, or project automatic work records are enabled.
Existing related documents alone do not enable automatic maintenance.

Reuse the Design connection, candidate list, and current source already established by the request, handoff, or discovery.
Confirm related goals and affected contracts; a matching title or code path alone does not establish the connection.
Use the successor for a superseded Design and preserve a cancelled Design's stopped scope.
If the connection is ambiguous, ask while continuing independent work.
With no related Design, continue under the existing creation conditions.

## Find related Designs

For uncovered affected code or topics, search current sources:

```text
node <plugin-root>/writers/document-writer.js search --project-root <project> --query "<specific code identifier>" --limit 10
```

Terms match case-insensitive literal substrings in IDs, titles, overviews, and registered details; any term matches.
Start with a specific identifier; use topic terms when identifiers do not establish coverage.
For a bounded set whose source is needed next, add `--include-source overview` or `--include-source documents` to return the exact selected/full read result under each page candidate's `source`.
Reuse those sources; retain selected reads for missing documents or sections of large sources.
Each `term_matches` count covers the catalog, not just the page; refine broad terms before paging because adding generic terms expands the union.
Use `--path <code-path>` for slash-normalized path references, alone or together with terms as a union.
Results retain stopped and replaced Designs so the governing scope can be assessed.
Use the candidate's source hits to select needed documents and sections; inspect linked contracts and acceptance conditions, not only matching lines.
Continue `has_more` pages with `--offset <next-offset> --expected-revision <source_revision>` under the same query.
`--limit` accepts 1 to 100, default 10; `search --help` describes the query and paging contract.
Restart at offset 0 after `design-search-changed`.
Resolve `complete: false` diagnostics and expand terms or paths when affected scope remains uncovered; a known connection or one empty query does not establish absence.

## Read the affected source

Retrieve only missing source:

```text
node <plugin-root>/writers/document-writer.js read --project-root <absolute-project-root> --id <DESIGN-ID> --document DESIGN.md
```

Start with the overview; read needed detailed paths relative to its Design directory, such as `--document contracts/request.md`.
Add `--section "<heading text>"` to return that heading and its subsections, ending before the next heading of the same or higher level.
Without `--document`, `--section` selects from the overview.
ATX (`#`) and Setext headings are matched by exact heading text, including inline Markdown; absent or duplicate titles fail.
Partial reads return `id`, `path`, and source `text`, retaining line endings and validating the entire document set.
With no selection, `read` returns the complete set; use that when the change needs it.

Patch with UTF-8 JSON on stdin:

```text
node <plugin-root>/writers/document-writer.js patch --project-root <absolute-project-root> --id <DESIGN-ID>
```

```json
{"edits":[{"old":"<overview span>","new":"<replacement>"}],"documents":[
  {"path":"<existing>.md","edits":[{"old":"<span>","new":"<replacement>"}]},
  {"path":"<new>.md","source":"<absolute path to the completed artifact>"},
  {"path":"<retired>.md","remove":true}]}
```

Omit unused operations.
Each `old` must match exactly once in its file; edits apply in order.
Replace changed fragments within sentences, extending `old` only as needed for one match.
`source` adds an existing UTF-8 artifact unchanged; use `body` for new text.
Keep its relative links valid at the destination path.
`remove` retires a document.

## Revision boundary

The revision identifies an agreed Design contract, not a save operation.
Use the default `edit` for draft development, wording and explanation fixes, and subsequent saves within the same design change.
It preserves the revision and creates no snapshot, including when changing detailed documents or membership.

When changing agreed scope, behavior, contracts, or acceptance conditions, use `--change-kind major` on the first save of that change.
It increments the revision once and snapshots the previous document set.
Continue that change with `edit` across saves and conversation turns; use `major` again when a later change revises the resulting agreed contract.
Both `write` and `patch` accept these change kinds; `write` requires the matching revision in its metadata, while `patch` sets it automatically.

Use `operational` only for metadata or work links, preserving content and membership.

## Keep the contract current

Integrate approved requirements and choices made within delegation into affected contracts, examples, diagrams, and open matters.
For a bounded change completed in this conversation, save the final contract, work links, and verified status together at completion.
Save earlier when review, dependent work, material progress, or handoff needs the record.
Keep names and links to the implementation and decision basis current.
An implementation difference requires a fix or an authorized contract change; retain unresolved differences when the governing agreement is unknown.
Reuse unchanged documents and evidence.
Existing Design maintenance preserves the Architecture Memory connection; an unconnected project stays unconnected.

Before completion, reconcile final requirements, documents, delivered behavior, and verification.
Assess the final set's readiness using [document-status.md](document-status.md); prior completion does not verify changed conditions.
Report remaining differences or failed saves as unfinished work.
For a handoff, retain Issue IDs, Design ID and revision, accepted changes, and unresolved matters in the existing handoff.
Use [../../issue-ledger/references/work-link.md](../../issue-ledger/references/work-link.md) for related issues.
