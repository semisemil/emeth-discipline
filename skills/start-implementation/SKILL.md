---
name: start-implementation
description: Select model and reasoning and launch a local implementation session for a ready Design or supported legacy Spec. Explicit invocation only.
---

# Start Implementation

Use the model and reasoning already specified by the user or owning workflow within its authority. Read [model routing](assets/model-routing.md) only to select unspecified settings. Respect user limits; resolve material ambiguity instead of substituting another contract.

Resolve the saved project matching the current folder. Check runtime support and authorization for the selected settings. When the creation tool requires an explicit user model choice, obtain it before dispatch. Explain the settings and task-based reason in one sentence.

Resolve the contract, validate readiness and the matching project, and build the creation arguments in one call:

```text
node <plugin-root>/skills/start-implementation/scripts/prepare-launch.js --cwd <current-folder> --design <DESIGN-ID> --project-root <matching-project-folder> --project-id <project-id> --model <model> --reasoning <effort>
```

Use `--spec <SPEC-ID>` instead of `--design` for legacy input. Pass the returned JSON unchanged to `create_thread` once. It selects the matching project's local environment; the prompt contains only `$emeth-discipline:implement <contract-ID>`. No conversation history or duplicate handoff document is needed.

Report the created task. The new session owns implementation and verification. Follow runtime-required initial status checks; an uncertain creation result is not a reason to create a duplicate task.
