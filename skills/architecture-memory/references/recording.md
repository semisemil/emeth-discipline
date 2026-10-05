# Record durable context

For information worth capturing under [Architecture Memory](../SKILL.md), use [shared writing rules](../../rules/references/writing-and-revision.md) for the body. Use the manifest language and omit empty conditional sections or rows. Template placeholders describe content, not sentence form.

## Record placement

Place each passage by its function, including passages that share a topic.

| Content | Home |
|---|---|
| Domain meanings and relationships, operating conditions, and business background or premises that code alone does not establish | `context` |
| System boundaries, external relationships, runtime units, and component responsibilities | The corresponding system-context, container, or component document |
| A significant explicit business or architectural choice whose rationale affects future decisions | ADR; read [decision guidance](decision-templates.md) |
| Detailed behavior, contracts, implementation plans, and choices local to a Design | The authoritative Design |
| Work progress, implementation chronology, and test execution results | Completion or verification report |

`context` explains business meaning and premises, including those behind rules expressed in code. Use the authoritative source for behavior restatements and accepted plans. Link choices, alternatives, and consequences to the decision record or Design that owns them.

Reuse the canonical section or search the concept before adding one. Preserve a task-specific decision's scope when referencing it. Keep evidence supporting a durable premise or decision with that record.

## Author documents and sections

Run commands with UTF-8 JSON on stdin, except `scaffold` and `recover`:

```text
node <skill-root>/scripts/author.js <command> --project-root <project>
```

Use `--root <relative-root>` for an unconnected custom-root draft. Commands target the pending init/update draft, or live Memory otherwise. `target: draft` still needs workflow `apply`.

| Command | Input |
|---|---|
| `scaffold` | Create missing base files and their index; preserve existing content. |
| `document` | `kind` (`context`, `system-context`, `containers`), `title`, optional `sections`. |
| `component` | `title`, existing `container` (`CNT-…`), `reason`, optional `sections`. |
| `section` | `document` (ID or unique kind) and section fields below. |
| `decision` | `title`, `status` (`accepted` or `proposed`), Markdown `body`, `current` section update; optional `date` and `supersedes` ADR ID. |
| `read` | `ids`, with optional `seen`, `cursor`, `maxChars` for paged reads. |
| `recover` | Resume interrupted authoring before retrying. |

The writer allocates document/section IDs and ADR numbers, registers files, and maintains indexes and decision links. Results return created documents and section IDs. A decision's date defaults to `unknown`; supply an established date as `YYYY-MM-DD`.

### Section fields

| Field | Meaning |
|---|---|
| `title`, `body` | Section title and Markdown body. Use level-3 or deeper body headings; the writer supplies the level-2 heading and metadata. |
| `confidence` | `confirmed`, `inferred`, `proposed`, or `unknown`. |
| `lifecycle` | `current`, `planned`, or `historical`. |
| Optional `paths`, `terms` | Repository-relative scopes and search aliases, respectively. |
| Optional `links`, `always` | Required section IDs; `always: true` marks a shared prerequisite. |

### Section revisions

To revise a section, use `author.js read` for its current target, then supply `id` and its `receipt` as `expected`. `title` and routing fields may be omitted to preserve them. `current` uses these update fields without `document`, and describes the complete revised current effect with `current` or `planned` lifecycle. On conflict, reread and reconcile before retrying.

```json
{"document":"context","title":"Operating connectivity","body":"Operators report recurring network outages at remote sites while on-site work continues.","confidence":"confirmed","lifecycle":"current","paths":["src/terminal"]}
```

Load [base templates](base-templates.md) for a structural survey, [component guidance](component-templates.md) when L3 is needed, or [decision guidance](decision-templates.md) for ADR content. For section retirement or exact lifecycle/metadata edits, use [low-level patches](patching.md).
