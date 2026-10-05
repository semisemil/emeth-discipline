# Implement

Read the requested Design:

```text
node <plugin-root>/dashboard/records/development-contracts.js --project-root <project> --id <DESIGN-ID>
```

Focus on implementation and debugging.

Correct design errors through [development-design](../development-design/SKILL.md), then resume implementation once the revised contract is ready.

When connected and recording is permitted, update [Architecture Memory](../architecture-memory/SKILL.md) with new durable findings.

Commit only changes made for this implementation, preserving unrelated work, including staged changes.

## Review handoff

Give a fresh reviewer context only the absolute path to [review.md](review.md), the Design ID, and the implementation commit ID, without conversation history.

In Codex, dispatch the reviewer as a subagent and relay its final result. In Claude Code, return the two IDs to the calling session for reviewer dispatch.
