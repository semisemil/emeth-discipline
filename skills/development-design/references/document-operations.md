# Design document operations

Before a write that first registers the project or when dashboard state is missing, follow [dashboard sandbox setup](../../dashboard-server/references/sandbox-setup.md). Use its recovery procedure for registration failures with `registry-lock-failed` and `EPERM` or `EACCES`.

Use `.proofline/designs/<DESIGN-ID>-<slug>/DESIGN.md`. For a new Design, choose an unused ID following the project convention: `DESIGN-` followed by at least four digits. Use the same ID in the directory name and frontmatter. For an existing Design, preserve its ID and location. Never overwrite an ID collision. The body is free-form. Frontmatter is JSON between Markdown `---` delimiters; replace `<DESIGN-ID>` and `<design-title>` with the document's values:

```json
{
  "schema_version": 2,
  "id": "<DESIGN-ID>",
  "title": "<design-title>",
  "kind": "feature",
  "status": "draft",
  "revision": 1,
  "supersedes": [],
  "superseded_by": null,
  "related_issues": []
}
```

Kinds: `feature | bug | refactor | exact_port | maintenance`. Status: `draft | ready | blocked | completed | cancelled | superseded`. `related_issues` contains explicit `PL-*` targets only; apply [work links](../../issue-ledger/references/work-link.md) for those targets.

For creation, write complete UTF-8 Markdown on stdin to:

```text
node <plugin-root>/writers/document-writer.js write --kind design --project-root <absolute-project-root> --relative-path <project-relative-design-path> --language <document-language>
```

Add `--memory off` when recording is prohibited for this request. Existing disabled project settings remain authoritative. Writer results separate `write`, `registration`, and `memory`; a partial result is not an all-or-nothing failure. An unchanged save may finish an interrupted Memory connection without rewriting the Design.

## Edit an existing Design

Read the text and its SHA-256 together before editing:

```text
node <plugin-root>/writers/document-writer.js read --project-root <absolute-project-root> --id DESIGN-0001
```

Reuse this read while the text remains in context. After a successful patch, use its returned `sha256` with the updated text for further edits. Send only changed spans as UTF-8 JSON on stdin to:

```text
node <plugin-root>/writers/document-writer.js patch --project-root <absolute-project-root> --id DESIGN-0001 --change-kind major
```

```json
{"expected_sha256":"<sha256 from read>","edits":[{"old":"\"revision\": 1","new":"\"revision\": 2"},{"old":"The request returns an ID.","new":"A successful request returns an ID."}]}
```

Edits apply in order in memory. Each `old` must match exactly once, including whitespace; include surrounding text to distinguish repeated passages. Use an empty `new` to delete, or replace an existing anchor to insert text. Include required metadata changes in the same patch. Preserve unchanged text instead of reproducing the document in the tool call. The JSON input and resulting document each have a 2 MiB limit.

The writer checks the hash of the whole source, then validates and saves through the same revision, snapshot, registration, and Memory path as `write`. A stale hash or missing/ambiguous match saves no document changes. Read and reconcile a changed source before retrying; do not merely substitute a fresh hash. The same `--memory off` and `--language` options apply. Full-document `write` remains available for complete replacements and legacy documents.

## Revision and completion

For an existing body/contract change add `--change-kind major`, increment revision once, and reassess readiness. The writer snapshots the old document in `revisions/REV-<revision>.md`. Preserve existing `supersedes` links. Use `operational` for status/link changes, preserving the body and revision. Identical content is a no-op.

For status changes, pass the document ID and target state directly:

```text
node <plugin-root>/writers/document-writer.js status --project-root <absolute-project-root> --id <DESIGN-ID-or-legacy-SPEC-ID> --status completed
```

The command reads the existing metadata, preserves the body and revision, and returns the write, registration, Memory, and resulting document status. It takes no document stdin; the same `--memory off` and `--language` options apply.

Complete only when current verification establishes every required condition for the final revision. Previous checks may be reused for unchanged code and requirements after confirming their applicability; the old revision's completion label alone is insufficient. A status request does not start verification. Cancel only when requested. A replacing Design declares the previous ID in `supersedes`; the shared resolver derives the previous document's effective superseded state without rewriting legacy files.

## Legacy succession

Existing Plans and Specs remain readable. An unsuperseded ready Spec may still be implemented directly; complete it with the status command using its original Spec ID.

For requested new design work on a legacy Plan/Spec, resolve its latest active successor before editing. Create or revise one Design containing the current applicable contract and consequential decisions; put each document it replaces in `supersedes` and link the original for provenance. Replacing a legacy contract changes the active source immediately, even while the new Design is draft. Do not batch-convert or delete unrelated documents, or copy old readiness without evaluating the current requirements.

Readiness and successor checks for execution use:

```text
node <plugin-root>/dashboard/records/development-contracts.js --project-root <project> --id <DESIGN-ID-or-legacy-SPEC-ID>
```

Conflicting successors and cycles require reconciliation, not arbitrary selection. Implementers and the dashboard use the same successor interpretation. Detailed contracts belong in this Design; Architecture Memory keeps only durable context with links.
