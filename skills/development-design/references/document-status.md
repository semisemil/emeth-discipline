# Change document status

For status changes, pass the document ID and target state directly:

```text
node <plugin-root>/writers/document-writer.js status --project-root <absolute-project-root> --id <DESIGN-ID> --status completed
```

Complete only after verification establishes every required condition of the final revision. A status request does not authorize verification. Cancel only when requested. For replacement, put the previous Design ID in the new Design's `supersedes`.
