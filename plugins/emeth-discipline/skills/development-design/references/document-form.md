# Design document form

Choose sections and detail needed to implement and verify the change, using established software design conventions.

Organize design documents using arc42 views relevant to the change: goals and constraints, context, building blocks, runtime and deployment, crosscutting concepts, decisions, quality scenarios, risks, and terminology.
Use existing task and design artifacts for contracts they already establish, and reference existing architecture for unchanged parts.

Choose prose, tables, or diagrams suited to the information being specified.
When using diagrams, use C4 for context and structural views, sequence diagrams for interactions, and state diagrams for lifecycles; identify element roles and label directed relationships.
C4 views distinguish system boundaries and external actors (context), applications and data stores (containers), and internal responsibilities within one container (components).
For new or changed operation contracts, specify inputs, successful outputs, and failure conditions.
For structured data changes, specify affected fields, their types and meanings, and validity conditions.
Specify new or changed database schemas, keys, constraints, and indexes.
Express acceptance criteria as scenarios with conditions and expected results.
Use prose to establish purpose and explain relationships or material tradeoffs not apparent from the diagrams and tables.

Divide detailed documents by subject and responsibility.
Each contract has one owning section or document, referenced elsewhere.
Headings and diagram levels follow the selected conventions; all views agree on boundaries, responsibilities, and contract conditions.
Keep choices local to a Design with their contracts; record significant architectural decisions through [Architecture Memory ADR guidance](../../architecture-memory/references/decision-templates.md).
Open implementation choices preserve the specified behavior and structure.

Delete filler, generic benefits, and conclusions that add no concrete information about the change.
State behavior and conditions directly, using established project terms.
Keep sentences readable and preserve conditions, exceptions, and causal relationships when shortening them.
