# Decision content and lifecycle

Create an ADR for a significant explicit choice whose rationale will affect later decisions. Use the `decision` command in [recording](recording.md), supplying the historical body and its current architectural effect separately.

The body records decision-time conditions, the choice, consequences, meaningful alternatives actually considered, and evidence. Use level-3 headings where useful; the writer groups the body in one retrievable section. The generated lifecycle keys (`Status`, `Decision date`, `Supersedes`, `Superseded by`, `Current document`) are fixed metadata fields.

Accepted ADR bodies are immutable history except clear typographical corrections. A new accepted direction uses `supersedes`; the writer updates both lifecycle relationships and the decision index while preserving the old body. Other lifecycle-only changes use [exact patches](patching.md).
