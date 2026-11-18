# Record durable context

Apply the host's document rules already in context. Look up a host rule when it is needed to write the record:

- Codex with GPT-6.2 models: [../../rules/codex-gpt-6.2.md: Documents and reports](../../rules/codex-gpt-6.2.md#documents-and-reports).
- Codex with earlier models: [../../rules/codex.md: Documents and reports](../../rules/codex.md#documents-and-reports).
- Claude Code: [../../rules/SKILL.md: Document writing and revision](../../rules/SKILL.md#document-writing-and-revision).

Use the manifest language and omit empty conditional sections or rows.
Template placeholders describe content, not sentence form.

When the new evidence and connected owner are already identified, start from those inputs. Read the supplied evidence in one batch as size permits. Discover additional files or inspect the memory layout only to resolve a specific gap.

## Record placement

Place each passage by its function, including passages that share a topic.

| Content | Home |
|---|---|
| Domain meanings and relationships, operating conditions, and business background or premises that code alone does not establish | `context` |
| System boundaries, external relationships, runtime units, and component responsibilities | The corresponding system-context, container, or component document |
| A significant explicit business or architectural choice whose rationale affects future decisions | ADR; read [decision-templates.md](decision-templates.md) |
| Detailed behavior, contracts, implementation plans, and choices local to a Design | The authoritative Design |
| Work progress, implementation chronology, and test execution results | Completion or verification report |

`context` explains business meaning and premises, including those behind rules expressed in code. Use the authoritative source for behavior restatements and accepted plans. Link choices, alternatives, and consequences to the decision record or Design that owns them.

Reuse the canonical section or search the concept before adding one. Preserve a task-specific decision's scope when referencing it. Keep evidence supporting a durable premise or decision with that record.

For context or decisions whose validity depends on a condition, state what established that condition and what change would warrant reconsideration. Keep this in the owning passage, using required `links` for shared premises. A changed premise calls for reassessment; an existing decision remains recorded until explicitly revised or superseded.

Record the current effect of a satisfied trigger for an accepted conditional decision and keep any implementation claim within its evidence.
Keep an explicit withdrawal as a searchable current note on the owning subject. State its scope and authority, and remove the literal value and aliases for a request to forget it.

## Capture sections

1. Read the new evidence. For existing topics, use `memory.js lookup` to locate the owning sections and get their text and receipts. If the subjects are known, read the new evidence and the existing sections together. Reuse text and receipts already in context.
2. Submit related sections together with `author.js section`. A new section needs only its content and owning document. An existing section also needs its ID and receipt.
3. A successful `updated` result (or `no-op` when the proposed content already matches) confirms publication. The writer validates registration, sections and required links. Reopen the published material only to resolve a specific remaining verification question.

Send UTF-8 JSON on stdin:

```text
node <plugin-root>/skills/architecture-memory/scripts/author.js section --project-root <project>
```

```json
{"sections":[{"document":"context","title":"Operating connectivity","body":"Operators report recurring network outages at remote sites while on-site work continues.","confidence":"confirmed","lifecycle":"current"}]}
```

A single section can also be supplied as a top-level object.
Each entry names its `document` by registered ID or unique kind.
For a revision, set `id` and the read `receipt` as `expected`.
Omit unchanged titles and routing fields. On conflict, reread and reconcile the affected section before retrying.

## Author documents and sections

Run commands with UTF-8 JSON on stdin, except `scaffold` and `recover`:

```text
node <plugin-root>/skills/architecture-memory/scripts/author.js <command> --project-root <project>
```

Use `--root <directory>` for an unconnected custom-root draft.
Commands target the pending init/update draft, or the connected architecture documents otherwise.
`target: draft` still needs workflow `apply`.

| Command | Input |
|---|---|
| `scaffold` | Create missing base files and their index; preserve existing content. |
| `document` | `kind` (`context`, `system-context`, `containers`), `title`, optional `sections`. |
| `component` | `title`, existing `container` (`CNT-…`), `reason`, optional `sections`. |
| `decision` | `title`, `status` (`accepted` or `proposed`), Markdown `body`, `current` section update; optional `date` and `supersedes` ADR ID. |
| `read` | `ids`, with optional `seen`, `cursor`, `maxChars` for paged reads. |
| `recover` | Resume interrupted authoring before retrying. |

The writer allocates IDs, validates the document structure and maintains indexes and decision links. A decision date defaults to `unknown`; supply an established date as `YYYY-MM-DD`.

### Section fields

| Field | Meaning |
|---|---|
| `title`, `body` | Section title and Markdown body. Use level-3 or deeper body headings; the writer supplies the level-2 heading and metadata. |
| `confidence` | `confirmed`, `inferred`, `proposed`, or `unknown`. |
| `lifecycle` | `current`, `planned`, or `historical`. |
| Optional `paths`, `terms` | Repository-relative scopes and search aliases, respectively. |
| Optional `links`, `always` | Required section IDs; `always: true` marks a shared prerequisite. |

`confirmed/current` needs evidence for the wording; a user's reported fact remains attributed. `confirmed/planned` records an accepted target without asserting implementation; once inspected code realizes it, revise the section to `current` with that evidence. If a table mixes states, put each state and evidence beside its claim instead of confirming the whole section.

For a decision's `current` input, use the section revision fields without `document` and describe the complete revised current effect with `current` or `planned` lifecycle.

Load [base-templates.md](base-templates.md) for a structural survey, [component-templates.md](component-templates.md) when L3 is needed, or [decision-templates.md](decision-templates.md) for ADR content. For section retirement or exact lifecycle/metadata edits, use [patching.md](patching.md).

Reorganization is handled by [Architecture Memory Maintenance](../../architecture-memory-maintain/SKILL.md).
