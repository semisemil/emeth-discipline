# Writing and revising a Design

## Normalize the design

Normalize design information from conversation and source material into the currently valid system design. A discussion summary preserves the course of discussion; normalization resolves it into current decisions, unresolved choices, reasons, and constraints, preserving their meaning and scope. Express past events through their current effects on the design.

Separate directions to the author from information about the system. Apply directions to the work; every body statement specifies the system, a design decision, or actual evidence needed to assess that decision. Let headings identify section roles, and begin each section with its design content. State acceptance criteria as conditions paired with observable system results. Keep measurement conditions and limits beside the actual findings they qualify. Document status belongs in metadata; authoring and execution results belong in the completion report.

## Build the reading order

Use this default progression, with headings in the project's terminology:

- Definition: what the feature or change is.
- Behavior: supported actions, observable results, and their conditions.
- Change design: where and how the system changes, with responsibilities, data flow, affected contracts, and the reasons for the chosen structure.
- Open decisions: unresolved choices, candidates, consequences, and what is needed to decide.

Make these relationships visible through the document's hierarchy. Give purpose and scope their own named subsections. A broader heading can group subjects only when each has a visible subheading; paragraph breaks alone do not distinguish them. Keep simple properties under descriptive labels. Place detailed investigation and lengthy comparisons after the design they support. Scale the depth to the change.

Anchor changes to existing systems in inspected code: identify each affected file and symbol or section, its current role, and the intended change. Mark new locations as proposals and unresolved locations as open choices.

## State the contract locally

Keep each behavior's actor, applicability, action, final result, defaults, exceptions, and preserved state together. Introduce terms where used. A shared mechanism may be explained elsewhere, but the premise and branch result needed to interpret a local rule belong beside it.

Give each rule or decision one full explanation. Elsewhere, retain necessary local qualifications, consequences, or differences and link to fuller context. Shared conditions must have clear scope; distinct obligations and exceptions stay distinct.

Distinguish required behavior, proposed structure, and implementation choices. Keep decisive reasons, qualifying assumptions, meaningful alternatives, accepted costs, and conditions for revisiting a choice beside that choice. Required rules remain understandable independently of optional implementation discussion.

For interactions whose final result can differ from locally correct steps, use a concrete input/state and expected final observations, including unaffected data. Derive expectations independently of the candidate implementation. Preserve requested examples; additional examples should clarify a distinct boundary or likely misinterpretation.

## Choose the expression

Apply Focus at the level of each content block. Use labeled noun phrases for definitions, attributes, scope items, and named states. Use sentences for explanations or relationships that phrases would obscure, preserving actors, conditions, exceptions, and obligation strength.

In prose, put each sentence on its own line using an ordinary newline. Use blank lines between paragraphs, with related sentences kept in the same paragraph. Keep each rule's conditions and exceptions together. Prioritize readable grouping and spacing over fewer lines or tokens.

Use **bold** for a decision-critical rule or outcome and *italics* for a brief secondary nuance. Emphasize the shortest meaningful phrase, keeping surrounding text plain; wording must carry meaning, status, and obligation without relying on styling.

Make comparisons and flows visible in the forms below. Use prose for context, reasons, and relationships that these forms would obscure:

| Relationship | Form |
|---|---|
| Peer items | Concise bullets, one point per item. |
| Comparable cases or change sites | A table with a named subject and shared comparison dimensions. |
| Execution order or branching | Numbered steps for a simple sequence; a flowchart with conditions and final outcomes for alternate or repeated paths. |
| Cross-component calls or data flow | A flowchart or sequence diagram connecting the existing entry point, handoffs, and final effects, with roles and direction labels. Mark unresolved connections at their actual position in the flow. |
| State transitions | A state diagram showing states, triggering events, and transition conditions. |
| Precise ordered logic | Short pseudocode, identifying mandatory behavior versus an illustrative implementation. |

Use the chosen form as the explanation itself, carrying the relevant conditions and outcomes. Add prose for information it does not convey. Write Markdown diagrams in fenced Mermaid blocks, using flowchart, sequenceDiagram, or stateDiagram-v2 for the corresponding relationships.

## Complete the revision

Changed terms, scope, and decisions apply consistently to every affected rule, example, and diagram. Superseded statements are replaced by the normalized contract, with references pointing to actual sections or links.

The normalized design preserves the system's requested outcomes at their original strength and scope, including exact identifiers, fields, paths, commands, quantities, examples, and verification obligations. All representations agree. Preserve each actual claim's status as proposed, agreed, authorized, expected, or observed.

A first read establishes what is being designed, what it does, where and how it changes the system, and what remains unresolved. Local rules are interpretable without assembling scattered qualifications. Each retained block belongs to the normalized design; repeated meanings are consolidated without losing distinct conditions or decision states.
