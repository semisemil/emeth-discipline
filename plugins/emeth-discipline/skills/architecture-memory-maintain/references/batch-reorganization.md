# Batch reorganization

| Command | Input |
|---|---|
| `reorganize` | Corpus `revision`, related `sections`, optional `redirects` and `introductions`. |

`reorganize` prepares and validates one batch through the ordinary writer.
It preserves the Git checkpoint and document verification fields and targets the pending draft when one exists.
Use the current corpus `revision` and existing sections' `receipt` values from `read`.
An empty batch returns `no-op`.

`sections` uses the normal section fields and a registered `document` ID or unique kind.
Existing sections retain confidence and lifecycle when those fields are omitted; reorganization cannot change their classification.
New sections require both fields.
Optional local `ref` names let `links` and redirect destinations refer to new IDs as `@<ref>` within the same batch.
The writer returns the allocated IDs under `refs`.

```json
{
  "revision": "<current-corpus-revision>",
  "sections": [
    {"document":"context","id":"AM-terminal","expected":"<receipt>","title":"Offline registration","body":"<complete revised scope, conditions, evidence and rationale>","links":["@storage"]},
    {"document":"context","ref":"storage","title":"Durable storage","body":"<storage premise and its evidence>","confidence":"confirmed","lifecycle":"current"}
  ]
}
```

For consolidation, include `redirects: [{"id":"<old-ID>","expected":"<receipt>","to":["@storage"]}]` and update every current section whose required links refer to that old ID.
A redirect retains the old heading and ID, preserves its confidence, sets `historical` lifecycle and points to the destination sections.
It is excluded from default search but remains readable by ID, with its required destinations.
Destinations must be current or planned sections.
The writer rejects self-references, redirect chains within the batch, and current prerequisites still pointing to a redirected ID.
Accepted ADR bodies remain unchanged.

`introductions: [{"document":"context","body":"# Project context\n\n<complete revised preamble>"}]` replaces a preamble in the same batch.
Preserve its source scope and evidence limits with the affected sections.
Keep Markdown destinations valid when renaming headings; the structural check validates routing IDs, not ordinary Markdown links or semantic equivalence.

On a stale revision or receipt, reread and reconcile the batch.
Resume interrupted publication with `author.js recover` instead of allocating new IDs.
