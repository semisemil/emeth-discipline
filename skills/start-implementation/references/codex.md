# Start implementation in Codex

Use the model and reasoning specified by the user or owning workflow; read [model routing](../assets/model-routing.md) only for unspecified settings.

Resolve the saved project matching the current folder. Check runtime support and authorization for the selected settings. When the creation tool requires an explicit user model choice, obtain it before dispatch.

Build the creation arguments:

```text
node <plugin-root>/skills/start-implementation/scripts/prepare-launch.js --cwd <current-folder> --design <DESIGN-ID> --project-root <matching-project-folder> --project-id <project-id> --model <model> --reasoning <effort>
```

Pass the returned JSON unchanged to `create_thread` once.

Report the created task. Follow runtime-required initial status checks; an uncertain creation result is not a reason to create a duplicate task.
