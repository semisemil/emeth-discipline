# Workflow commands and recovery

Run the installed `skills/architecture-memory/scripts/workflow.js` with Node. Every command needs `--project-root <absolute-project-root>`. For a custom root, add `--root docs/<name>` until initialization writes the project binding.

| Command | Output / purpose |
| --- | --- |
| `init [--root docs/name] [--language ko]` | Start/resume baseline draft; complete existing collections need only connection refresh |
| `update` / `status` | Start/resume reconciliation / inspect its compact state |
| `inventory [--prefix dir/] [--offset N] [--limit N]` | Directory counts, or paged captured paths |
| `changes [--prefix dir/] [--offset N] [--limit N]` | Pending change page and directory counts |
| `source --path file [--diff] [--offset N] [--limit N]` | Captured source or diff; zero-based continuation offset |
| `classify --path file\|--prefix dir/ --effect none\|architecture --reason "..."` | Persist one conclusion for matched changed paths; return counts |
| `apply` | Validate draft, publish, checkpoint and finish |

Paths are literal repository-relative paths; prefixes denote directories with a trailing `/`. Follow `next_offset` for needed continuation. Oversized single lines require a suitable extractor against that exact captured source.

## Recover the pending operation

For `draft`, correct the reported draft problem and rerun `apply`.

For `applying`, rerun `apply`; retrieval remains unavailable until completion. Preserve recovery files until the operation returns `applied`.

On an external-edit conflict, reconcile the reported file with the pending draft before resuming.

For init without a committed source, a changed observed file requires `source --path <path> --refresh` and reconciliation of that file's claims. Added/deleted files require `inventory --refresh` and review of the affected responsibilities. These commands apply only to uncommitted draft evidence. A committed operation stays pinned; a later update covers later commits.

An occupied unregistered architecture root requires a separately scoped integration or an empty custom root. Ambiguous/invalid registrations require reconciliation before proceeding.

## Connection

The connection root is stored in `.proofline/architecture.json`. Keep this binding and published documents in version control, excluding `<root>/.architecture-memory/work/` recovery data. Hosts without the connection hook require explicit skill use.
