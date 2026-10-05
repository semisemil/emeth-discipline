# Writing and revising documents

## Content

Match content, depth, and structure to the user's intent, the document's purpose, and its reader.

Use the reader's task to choose what belongs in the document. Include internal identifiers with enough context to use them when that task needs them.

For documents that record current decisions, organize current requirements, open choices, reasons, and constraints by subject. Incorporate corrections into the resulting requirement. Retain history and exclusions only when needed to explain a current choice or define an active contract.

Authoring directions govern the work; the body records the subject, decisions, and supporting evidence. Pair acceptance conditions with observable results, and findings with their measurement conditions and limits.

## Organization

Give each subsection one coherent subject. Keep each behavior's actor, conditions, defaults, exceptions, final result, and preserved state together. Define terms where used.

Keep beside each choice only the reasons and conditions needed to assess its selection or validity, or decide when to revisit it.

Explain shared mechanisms once and link to their primary location. Retain the premises and branch outcomes needed to interpret each local rule; repeat other content only where needed for understanding.

Follow conclusions with only the investigation detail needed to assess them.

Preserve requested examples; add others for distinct boundaries or likely misinterpretations.

## Expression

Use noun phrases, labels, and short clauses for definitions, attributes, scope, and states. Use sentences where needed to explain relationships or conditions.

Keep introductions, transitions, and explanations that add information about the subject. Omit sentences that only set a mood or announce what follows.

Use **bold** and *italics* for emphasis.

Choose prose or a form below according to which makes the relationship easiest to understand, preserving relevant conditions and outcomes:

| Relationship | Form |
|---|---|
| Peer items | Bullets, one point each. |
| Comparable cases/change sites | Table with shared comparison dimensions. |
| Sequence/branching | Numbered steps for simple sequences; flowchart for branches/repetition, with conditions and final outcomes. |
| Calls/data flow | Flowchart or sequence diagram from entry through handoffs to final effects; mark roles, directions, and unresolved connections in place. |
| State transitions | State diagram with triggers and conditions. |
| Ordered logic | Short pseudocode separating required behavior from implementation examples. |

Add prose alongside a structured form only for information that form cannot convey.

## Revision consistency

Remove passages whose removal leaves the reader equally able to understand, act on, and assess the document.

| Consistency | Required result |
|---|---|
| Current content | Changed terms, scope, requirements, decisions, and established facts are reflected where applicable. Superseded statements in current descriptions are replaced. |
| Related content | Every affected rule, example, and diagram reflects the revision. References point to actual sections or links. |
