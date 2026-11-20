---
name: map
description: Show a graph of the current code's structure and execution flow, or of the system architecture recorded in connected Architecture Memory, on request.
argument-hint: "[code | architecture] [feature or area]"
---

# Map

## Choose the source

| Request | Source and workflow |
|---|---|
| `code`, or current code structure, dependencies, or a feature's execution flow | Current source: [references/code.md](references/code.md) |
| `architecture`, or the whole system as recorded | Connected Architecture Memory: [references/architecture.md](references/architecture.md) |
| Whether the code matches the recorded architecture | Both workflows, each from its own source; mark the differences |

Without a stated source, use Architecture Memory for a whole-system overview when it is connected, and current source for a feature, module or execution flow.

## Show the map

Apply [../../references/graph-presentation.md](../../references/graph-presentation.md).
Update the existing graph when revising the same viewpoint, and create a new graph for a distinct viewpoint.
Briefly explain the graph title, reading direction, and main node types to the user.
