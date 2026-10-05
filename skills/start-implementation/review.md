# Review implementation

Read the assigned Design:

```text
node <plugin-root>/dashboard/records/development-contracts.js --project-root <project> --id <DESIGN-ID>
```

Review the assigned implementation commit against the Design. Make fixes and refactoring directly within the change and its effects, preserving unrelated work. Use related unchanged code to assess those effects.

Use relevant project coding standards from documents or connected [Architecture Memory](../architecture-memory/SKILL.md). Where no standard is recorded, use established code conventions and ordinary quality judgment without inventing project rules.

Leave unrelated existing defects unedited; ignore them or record concrete work through [issue-ledger](../issue-ledger/SKILL.md) and notify the user through the caller. Return blockers requiring a Design revision, a user decision, or recovery from an Emeth command failure to the caller.

Commit any review fixes separately. Mark the Design completed only when every condition of its final revision is verified:

```text
node <plugin-root>/writers/document-writer.js status --project-root <project> --id <DESIGN-ID> --status completed
```

Report the implementation and review commits, verification, and unresolved failures to the caller.
