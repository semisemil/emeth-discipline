# Start implementation in Claude Code

Run the implementation in a separate subagent context of this session, in the current project folder.

## Select the model

Use the model the user or owning workflow specified; map it to the Agent tool's model values (`sonnet`, `opus`, `haiku`, `fable`).
Leave it unspecified to inherit this session's model. Do not use Codex model names or [Codex model routing](../assets/model-routing.md).
The Agent tool cannot set reasoning effort per dispatch; the subagent inherits this session's effort. When the user requires a different effort or a setting the tool cannot apply, report the difference and options before dispatch instead of substituting.

## Validate and dispatch

Resolve the contract, validate readiness, and build the Agent arguments in one call:

```text
node <plugin-root>/skills/start-implementation/scripts/prepare-launch.js --host claude --cwd <current-folder> --design <DESIGN-ID> [--model <model>]
```

Use `--spec <SPEC-ID>` instead of `--design` for legacy input. On failure, report the error and stop.

Pass the returned `subagent_type`, `description`, `prompt`, and `model` when present to the Agent tool once, unchanged. The prompt directs the subagent to read [implement.md](../implement.md) by its absolute path and implement the contract ID; it needs no conversation history or duplicate handoff document. Because the subagent cannot ask the user, the prompt also makes it stop and report when the contract needs a Design revision or a user decision, or an Emeth command fails.

The subagent owns implementation and verification; do not edit the contract's files in this session while it runs.
If the dispatch result is uncertain, check the running agents before anything else and never dispatch a second implementation for the same contract.

## Report

When the subagent returns, relay its implementation result, verification, completion status, and unresolved failures to the user. Its report is not visible to the user until relayed.
When it returns a blocker, resolve it with the user in this session, revising the Design through [development-design](../../development-design/SKILL.md) when needed. Dispatching again after the blocker is resolved is not a duplicate dispatch.
