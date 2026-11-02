# Create or reopen work

Use this only when Issue tracking is authorized and selection requires a new Issue or reopening terminal work.
Run from the project root: `<issue>` = `node "<plugin-root>/skills/issue-ledger/scripts/issue-ledger.js"`.

For new simple work, pipe JSON to `<issue> create --input-format brief --input -`:

```json
{"type":"bug","title":"...","risk":"low","origin":{"kind":"request","summary":"..."},"next_action":"...","problem":{"claims":["..."],"impact":"..."},"criteria":["..."]}
```

For non-bug/research work use `objective:{summary,constraints:[]}` instead of problem.
Optional `origin.refs`, `relations` and `current_summary` retain known context.
Use `--if-empty` for a supplied absent/empty snapshot; after `issue-store-changed`, refresh selection.
In Codex, create with `--output-format json` to receive `id`, `state`, `criteria` and `claims`.
`--data` accepts `encodeURIComponent(JSON.stringify(brief)).replaceAll("'","%27")`, instead of file/stdin input.
For prepared code work, execute registration, edits, verification and save sequentially in one `functions.exec`.
Use the complete batch in the supplied Record API example when available.
If registration fails, stop before applying edits.
For reopening, pipe `{current_summary,status:"doing",next_action}` to `<issue> update <ID> --input-format brief --operation -`.
Reuse generated state and P/C IDs, and check success before edits.
