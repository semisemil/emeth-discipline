# Start implementation in Claude Code

Run the implementation in a separate subagent context of this session, in the current project folder.

## Select the model

Use the model the user or owning workflow specified; map it to the Agent tool's model values (`sonnet`, `opus`, `haiku`, `fable`).
Leave it unspecified to inherit this session's model. Do not use Codex model names or [Codex model routing](../assets/model-routing.md).
The Agent tool cannot set reasoning effort per dispatch; the subagent inherits this session's effort. When the user requires a different effort or a setting the tool cannot apply, report the difference and options before dispatch instead of substituting.

## Validate and dispatch

Build the Agent arguments:

```text
node <plugin-root>/skills/start-implementation/scripts/prepare-launch.js --host claude --cwd <current-folder> --design <DESIGN-ID> [--model <model>]
```

On failure, report the error and stop.

Pass the returned `subagent_type`, `description`, `prompt`, and `model` when present to the Agent tool once, unchanged.

Do not edit the contract's files in this session while either subagent runs.
If the dispatch result is uncertain, check the running agents before anything else and never dispatch a second implementation for the same contract.

## Review

After implementation completes, dispatch a `general-purpose` subagent using the selected model and the [review handoff](../implement.md#review-handoff).

## Report

Relay the reviewer's final result to the user.
When either subagent returns a blocker, resolve it with the user in this session, revising the Design through [development-design](../../development-design/SKILL.md) when needed. Resume the affected role once resolved.
