# Delegation and host tools

## Subagents

Use the [implementation role prompt](../../../references/pstack/implementation-prompt.md) for separable implementation or verification artifacts inside a playbook step.
The calling conversation runs the playbook and retains coupled implementation and integration.
Routed workflows keep their own roles and role prompts.

**Defaults for every subagent call.** Pass the role prompt and [delegated-work contract](../../../references/delegated-work.md) by path, with the assignment's source and owned artifact paths.
Use background execution and keep connected tools available when the role needs them.

**Model selection.** Explicit user settings take precedence over workflow settings and role defaults.
For settings left unspecified by the user or owning workflow, run:

```text
node "<plugin-root>/lib/model-routing.js"
```

Apply the returned guidance through the host's supported model and reasoning arguments, within the user's usage limits.
Report unsupported explicit requirements instead of substituting them.

Review a delegated artifact against its assigned contract and resolve material findings with affected verification.
For ensemble and challenge seats, a second opinion uses the same prompt in an independent context.
Attribute agreement to the independent reviewers.

Keep work in the same session when its parts must coordinate decisions with each other as they progress.
Use a fresh agent context when delegating independent reviews, bulk research, or self-contained parallel work.
Continue an assignment with its owner when correcting its artifact or reviewing affected corrections.
Pass changed contracts, source paths and stopping conditions with the follow-up.

## Harness

`Read`, `Grep` and `Glob` mean the host's file-reading, content-search and path-search tools. Read-only parameters express the role's write restrictions; when Codex has no such argument, keep that restriction in the assignment prompt.

- **Subagents.** Use the host subagent tool: `Agent` in Claude Code (`subagent_type: general-purpose`) or `spawn_agent` in Codex. For a fresh Codex assignment, use `fork_turns: "none"` with the prescribed role prompt and paths to its task, grounding, and output artifacts. Drop parameters your tool doesn't have. If your harness has no subagent tool, do each delegated step yourself, one after another.
- **Questions.** Use the host's structured-question tool, such as `request_user_input_async` in Codex. Without one, ask in chat with numbered options.
- **Completion.** For delegated work, use the host completion mechanism. In Codex, follow the [delegated work completion rules](../../rules/codex.md#delegated-work-completion).

