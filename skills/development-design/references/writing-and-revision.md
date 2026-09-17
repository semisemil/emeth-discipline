# Writing and revising a Design

## Normalize the design

Normalize source material into current decisions, open choices, reasons, and constraints. A discussion summary preserves the discussion's course; a Design records its currently valid result. Express past events through their current design effects.

Apply authoring directions to the work; the body records the system, design decisions, and supporting evidence. Pair acceptance conditions with observable results, and findings with their measurement conditions and limits. Keep document status in metadata and execution results in the completion report.

## Build the reading order

Use this default progression, with headings in the project's terminology:

- Definition: the feature or change.
- Behavior: actions, observable results, and conditions.
- Change design: where and how, responsibilities, data flow, affected contracts, and structural reasons.
- Open decisions: choices, candidates, consequences, and needed resolution.

Scale depth to the change. Give each subsection one coherent subject rather than combining distinct topics. Repeat content only where needed for understanding; otherwise reference its primary location. Place detailed investigation and comparisons after the design they support.

For existing systems, identify each affected file and symbol/section from inspected code, its current role, and intended change. Mark new locations as proposed and unresolved locations as open choices.

## State the contract locally

Keep each behavior's actor, conditions, defaults, exceptions, final result, and preserved state together. Define terms where used. Explain shared mechanisms once and link to them, retaining the premises and branch outcomes needed to interpret each local rule.

Verification sections reference behavior rules and add concrete inputs, conditions, expected observations, and interaction boundaries. Retain user/project verification obligations with their source and applicability; leave other verification methods open.

Keep decisive reasons, assumptions, alternatives, accepted costs, and revisit conditions beside each choice. Required behavior remains interpretable independently of proposed structure and optional implementation details.

Where locally correct steps may combine into a wrong result, include a concrete input/state and final observations, including unaffected data. Preserve requested examples; add others for distinct boundaries or likely misinterpretations.

## Choose the expression

Use labeled phrases for definitions, attributes, scope, and states; sentences for explanations or relationships needing them.

Use newlines after sentences and blank lines between paragraphs. Group related sentences; favor readability over line/token savings.

Use **bold** and *italics* for emphasis.

Use each applicable form below, showing its relevant conditions and outcomes:

| Relationship | Form |
|---|---|
| Peer items | Bullets, one point each. |
| Comparable cases/change sites | Table with shared comparison dimensions. |
| Sequence/branching | Numbered steps for simple sequences; flowchart for branches/repetition, with conditions and final outcomes. |
| Calls/data flow | Flowchart or sequence diagram from entry through handoffs to final effects; mark roles, directions, and unresolved connections in place. |
| State transitions | State diagram with triggers and conditions. |
| Ordered logic | Short pseudocode separating required behavior from implementation examples. |

Add prose only for information the form cannot convey. Use fenced Mermaid diagrams: `flowchart`, `sequenceDiagram`, or `stateDiagram-v2`.

## Complete the revision

Integrate changed terms, scope, and decisions into every affected rule, example, and diagram. Replace superseded statements with the current contract and update references to actual sections or links.
