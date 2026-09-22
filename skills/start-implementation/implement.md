# Implement

Read the requested contract, then implement it in this session:

```text
node <plugin-root>/dashboard/records/development-contracts.js --project-root <project> --id <ID>
```

Correct design errors through [development-design](../development-design/SKILL.md), then resume implementation once the revised contract is ready.

When connected and recording is permitted, update [Architecture Memory](../architecture-memory/SKILL.md) with new durable findings.

Once every condition of the final revision is verified, mark it completed:

```text
node <plugin-root>/writers/document-writer.js status --project-root <project> --id <ID> --status completed
```

Complete authorized delivery and report results, including unresolved failures.
