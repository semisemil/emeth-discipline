# Software design

Choose established software design conventions suited to the work and its readers.

Base the design on goals, constraints, and accepted choices.
Resolve prerequisite decisions first; recommend important choices with their effects and tradeoffs, obtain required user decisions, and resolve delegated details.
After settling a decision, advance to the next unresolved in-scope issue in the same response.
Record unresolved matters with the design they prevent.
Fill gaps in project facts and prior decision reasons from relevant contracts, code, and [Architecture Memory](../../architecture-memory/SKILL.md).

Organize design documents using arc42 views relevant to the change: goals and constraints, context, building blocks, runtime and deployment, crosscutting concepts, decisions, quality scenarios, risks, and terminology.
Reference existing architecture and contracts for unchanged parts.

Use diagrams and tables as the main specifications.
Use C4 for context and structural views, sequence diagrams for interactions, and state diagrams for lifecycles; identify element roles and label directed relationships.
C4 views distinguish system boundaries and external actors (context), applications and data stores (containers), and internal responsibilities within one container (components).
Give each operation a contract table covering inputs, successful outputs, and failure conditions; define structured payloads separately.
Define structured data by field types, meanings, and validity conditions.
Document database tables by schema, keys, constraints, and separate index tables.
Express acceptance criteria as scenarios with conditions and expected results.
Use prose to establish purpose and explain relationships or material tradeoffs not apparent from the diagrams and tables.

Separate the overview from detailed views by subject and responsibility, with links between them.
Each contract has one owning section or document, referenced elsewhere.
Headings and diagram levels follow the selected conventions; all views agree on boundaries, responsibilities, and contract conditions.
Review rendered diagrams and tables for legibility.
Keep choices local to a Design with their contracts; record significant architectural decisions through [Architecture Memory ADR guidance](../../architecture-memory/references/decision-templates.md).
Open implementation choices preserve the specified behavior and structure.

For multi-topic discussions, use [progress navigation](design-navigation.md).
