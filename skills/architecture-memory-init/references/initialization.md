# Initialization evidence and content

Run commands through `<plugin-root>/skills/architecture-memory/scripts/workflow.js` with `--project-root <project>`.

## Evidence pass

Use `inventory` for directory counts, then `inventory --prefix <directory/>` or `--offset 0` for relevant paths. Trace entrypoints, runtime/storage units, integrations and deployment boundaries through representative code and existing documentation. Retrieve evidence with `source --path <path>`; it reads the captured commit even if the working tree or HEAD changes. `next_offset` exposes remaining lines; request only the continuation needed for the claim. Commands and recovery details are in [workflow](../../architecture-memory/references/workflow.md).

With no committed HEAD, use observed working files; the checkpoint stays null until a later `architecture-memory-update` establishes a committed baseline. Keep uncommitted implementation claims outside a committed baseline.

Identify purpose, scope/non-goals, physical and organizational operating conditions, actors, external systems, responsibility and data boundaries, deployment, quality tradeoffs, consequential risks and unknowns.

## Baseline

Use [recording](../../architecture-memory/references/recording.md) and [base templates](../../architecture-memory/references/base-templates.md) to fill the five documents already registered in the draft manifest: index, system context (C4 L1), containers (L2), current project context, and decision index. Tables/prose are authoritative; add Mermaid only for evidenced relationships.

Use [component templates](../../architecture-memory/references/component-templates.md) only where L2 cannot explain a material responsibility or risk boundary. Use [decision templates](../../architecture-memory/references/decision-templates.md) only for an established consequential choice with rationale. An empty decision index needs a statement that no supported ADR was found, not fabricated history.

Use C4 IDs for referenced `PER`, `SYS`, `EXT`, `CNT` and `CMP` nodes; retain existing IDs and never reuse retired IDs or ADR numbers.

Keep the generated manifest. To register another document, copy an existing entry and supply a unique stable ID, supported kind and normalized relative `.md` path within the draft; retain the six entry fields. Whole-document evidence review may set `verified_at` and `source_revision`; partial edits retain them. Leave checkpoint fields to `apply`.

Initialization may establish a baseline with important unknowns beside affected claims.
