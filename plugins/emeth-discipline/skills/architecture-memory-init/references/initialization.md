# Initialization evidence and content

Run commands through `<plugin-root>/skills/architecture-memory/scripts/workflow.js` with `--project-root <project>`.

## Evidence pass

Use `inventory` for directory counts, then `inventory --prefix <directory/>` or `--offset 0` for relevant paths. Trace entrypoints, runtime/storage units, integrations and deployment boundaries through representative code and existing documentation. Retrieve evidence with `source --path <path>`; it reads the captured commit even if the working tree or HEAD changes. `next_offset` exposes remaining lines; request only the continuation needed for the claim. Commands and recovery details are in [workflow](../../architecture-memory/references/workflow.md).

With no committed HEAD, use observed working files; the checkpoint stays null until a later `architecture-memory-update` establishes a committed baseline. Keep uncommitted implementation claims outside a committed baseline.

Identify purpose, scope/non-goals, physical and organizational operating conditions, actors, external systems, responsibility and data boundaries, deployment, quality tradeoffs, consequential risks and unknowns.

## Baseline

Run `author.js scaffold` under [recording](../../architecture-memory/references/recording.md), then author the baseline using [base templates](../../architecture-memory/references/base-templates.md): system context (C4 L1), containers (L2), and current project context. The scaffold includes their indexes. Tables/prose are authoritative; add Mermaid only for evidenced relationships.

Use [component guidance](../../architecture-memory/references/component-templates.md) where L2 cannot explain a material responsibility or risk boundary, or [decision guidance](../../architecture-memory/references/decision-templates.md) for an established consequential choice with rationale.

Use C4 IDs for referenced `PER`, `SYS`, `EXT`, `CNT` and `CMP` nodes; retain existing IDs and never reuse retired IDs or ADR numbers.

Whole-document evidence review may set `verified_at` and `source_revision`; partial edits retain them. Leave registration to the authoring commands and checkpoint fields to `apply`.

Initialization may establish a baseline with important unknowns beside affected claims.
