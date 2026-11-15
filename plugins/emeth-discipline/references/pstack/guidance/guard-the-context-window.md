---
name: principle-guard-the-context-window
description: "Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents; keep summaries in the main thread, not raw payloads."
disable-model-invocation: true
---

# Guard the Context Window

- **Route bulk to subagents.** For large outputs, long files, repeated reads or fan-out, keep summaries in the main thread rather than raw payloads.
- **Size phases and cap scope.** Limit files per phase, set turn budgets, account for mechanism costs.
