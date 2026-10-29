---
name: code-map
description: Show the code units responsible for behavior and their calls, events, and implementation choices in Graph Viewer. Use when the user wants to understand the current code structure, collaboration, or a feature's execution flow.
---

# Code Map

## Scope

Use the feature or area established in the conversation as the scope.
Connect a feature's flow from the entry point that receives input or an external request to result storage, output, or a screen update.
For an overview, focus on the responsibilities and dependencies of the main code units that perform behavior.

Use documents and earlier graphs as exploration leads, and ground the displayed structure and relationships in the current source.
When visualization is the only request, limit the work to source exploration and map creation.

## Select nodes

Use actual classes or functions that participate in the requested behavior as nodes.

- By default, omit DTOs, enums, and configuration values that only hold data.
  Include models and state objects that perform behavior.
- Show interfaces when needed to explain implementation selection or the direction of references between projects.
  If a separate interface node is unnecessary, connect the implementation classes and put contract names and selection conditions on the edges.
- Include units responsible for external effects, such as database connections or file writes, when needed to explain the end of the flow.
- Show base and derived classes together when needed to explain differences in responsibility.
  Represent inherited behavior through inheritance relationships and distinguish it from calls between separate instances.

Keep the actual code names in node labels so they remain searchable.
Add a short role description when needed.

## Trace relationships

For a feature's flow, focus on calls, events, and callbacks.
Show creation, registration, and inheritance as needed to explain the participants or implementation selection in that flow.

Use the following meanings and directions for edges.

| Relationship | Arrow direction | Edge label |
|---|---|---|
| Call | Caller → call target | Actual method name and execution conditions |
| Event | Event publisher → subscriber | Name of the delivered event |
| Callback | Callback invoker → connected handler | Connected method or behavior |
| Dependency or injection | Dependent → dependency | Contract or injected target for a connection whose call has not been confirmed |
| Creation | Creator → created object | Direct construction or creation responsibility |
| Registration | Configuration code → registered implementation | Registered contract and selection conditions |
| Inheritance or implementation | Derived class → base class or interface | Inherited, implemented, or overridden behavior |

Ground event connections in both publishing and subscription code.
Build active paths from calls that are not commented out and valid registrations.
When a contract has multiple implementations, label each connection with conditions confirmed in registration and selection code.

Show execution order only where confirmed in a method's control flow.
Distinguish connections confirmed in static code from results observed during execution.

## Compose and present the map

Represent projects, packages, or actual responsibility boundaries as groups, with nested groups when needed.
Use node types and colors for roles meaningful in this map, such as ViewModel, Mediator, Processor, or file writing.
Add progress status only when requested.

Arrange the map so its main responsibilities, boundaries, and flow conditions are understandable without opening every detail panel.
Put the information needed to understand each node in its details: responsibilities, entry methods, registration conditions, differences by role, and actual source locations and links.
Place long method lists and supporting explanations in details.

Break down complex areas with collapsible groups or separate detailed graphs for individual features.
Create a new graph for a distinct viewpoint, and update the existing graph when revising the same viewpoint.

Briefly explain the graph title, reading direction, and main node types to the user.
Report unconfirmed relationships or excluded scope when they affect interpretation.
