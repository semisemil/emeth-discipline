# Start implementation in Mixdog

Inspect the live `agent` tool schema and the configured workflow agent IDs and routes through Mixdog's `setup` skill (`status agents`, `status model`, and `status workflow`).
Use the user's selected agent, model, and effort where provided.
Otherwise use an enabled implementation agent with its existing configured route.
If the requested model or effort differs, use the supported route settings procedure before dispatch; do not silently substitute or pass unsupported `model`/`reasoning` arguments to `agent`.
Do not apply the Codex model-routing IDs to a Mixdog provider without checking its live model catalog.

Build the worker request in the current project:

```text
node <plugin-root>/skills/start-implementation/scripts/prepare-launch.js --host mixdog --cwd <current-folder> --design <DESIGN-ID> --agent <configured-workflow-agent-id> [--tag <stable-scope-tag>]
```

Pass the returned JSON unchanged to `agent` once.
Keep its tag for this implementation scope; the same tag is used for follow-ups or recovery.
Report the returned `task_id` and tag, wait for the completion notification, and use `read` or `status` only for recovery.
An uncertain submission is not a reason to spawn another worker.

The request carries the common rules in worker context because Mixdog currently discards the SubagentStart hook's returned context.
The worker returns user decisions to the calling session.
On completion, dispatch a fresh reviewer with the current project `cwd`, a distinct stable review tag, and only the absolute `review.md` path, Design ID, and implementation commit ID as its task brief.
The plugin's PreToolUse hook adds the common baseline to agent spawns without copying conversation history.
Relay the review result and any blockers to the user.
