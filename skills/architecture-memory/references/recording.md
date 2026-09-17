# Record durable context

Memory body content describes project conditions, architecture, decisions, or evidence needed to assess them. Authoring directions govern the work; session activity belongs in the completion report. Organize current-state records by architectural subject rather than conversation or investigation order.

Reuse the canonical section or search the concept before adding one. Keep each independently useful item's reasons and limits together. Detailed contracts remain in their Design; link them rather than copying their requirements.

Use the manifest language and omit empty conditional sections or rows. Template placeholders specify content, not sentence form; labeled phrases are valid.

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

Section fields: `title`, Markdown `body`, `confidence` (`confirmed`, `inferred`, `proposed`, `unknown`), and `lifecycle` (`current`, `planned`, `historical`). Optional `paths` are repository-relative scopes, `terms` are search aliases, `links` are required section IDs, and `always: true` marks a shared prerequisite. Use level-3 or deeper body headings; the writer supplies the level-2 heading and metadata.

To revise a section, use `author.js read` for its current target, then supply `id` and its `receipt` as `expected`. `title` and routing fields may be omitted to preserve them. `current` uses these update fields without `document`, and describes the complete revised current effect with `current` or `planned` lifecycle. On conflict, reread and reconcile before retrying.

```json
{"document":"context","title":"Offline operation","body":"Requests remain available during network outages.","confidence":"confirmed","lifecycle":"planned","paths":["src/terminal"]}
```

Load [base templates](base-templates.md) for a structural survey, [component guidance](component-templates.md) when L3 is needed, or [decision guidance](decision-templates.md) for ADR content. For section retirement or exact lifecycle/metadata edits, use [low-level patches](patching.md).
