# Design document form

Organize the selected design so its readers can understand the system or change as a whole, then find the detail needed to assess, implement and verify it.

## Design structure

Before drafting, integrate the selected design into a system decomposition: its boundaries, components, responsibilities, connections, owned data and state, interfaces and runtime transitions.
Connect requirements to the choices that satisfy them, and unresolved choices to the parts they affect.
Derive the document hierarchy from this integrated design and the reader's task, with section depth suited to the design's complexity.
Introduce the whole and its relationships before the details that depend on them.
Nest component-specific behavior and state under the component they describe.
Use relevant arc42 views to explain the design.
Runtime views use those same components and contracts to explain each important path from its trigger through state changes to success or recovery.
Place each contract with its owning component or shared interface and reference it from the flows that use it.
Use existing task and architecture documents for contracts they already establish.

Keep the reasons needed to understand the selected architecture in the design, beside the affected choice or in its rationale section.
Record significant architectural decisions through [Architecture Memory ADR guidance](../../architecture-memory/references/decision-templates.md).
Keep candidate selection history, investigation records and review reports in supporting documents.
The design body describes the selected architecture and the parts affected by remaining decisions.

## Explain the design

Use diagrams to explain the overall structure and important runtime or state relationships, and tables for parallel contracts or properties.
Choose each view for what it helps the reader understand, and place it beside the explanation it supports.
Use C4 for context and structural views, and sequence or state diagrams for behavior.
Use Mermaid in Markdown documents that support it, unless the user specifies another documentation format.
Apply technology constraints to their stated target: a product renderer restriction governs the product, while the document's rendering support governs its diagrams.
Identify element roles and label directed relationships.
C4 views distinguish system boundaries and external actors (context), applications and data stores (containers), and internal responsibilities within one container (components).
For new or changed operation contracts, specify inputs, successful outputs, and failure conditions.
For structured data changes, specify affected fields, their types and meanings, and validity conditions.
Specify new or changed database schemas, keys, constraints, and indexes.
Express acceptance criteria as scenarios with conditions and expected results.
Use prose to establish purpose and explain relationships or material tradeoffs not apparent from the diagrams and tables.

Delete filler, generic benefits, and conclusions that add no concrete information about the change.
State behavior and conditions directly, using established project terms.
Keep sentences readable and preserve conditions, exceptions, and causal relationships when shortening them.

## Check the complete document

Assess whether the reader can move from the system overview to its parts and their detailed behavior, then follow important scenarios without reconstructing scattered rules.
Headings express that hierarchy rather than the order in which topics were investigated.
Responsibilities and ownership agree, transitions honor operation and data contracts, and decisions appear in the structure and behavior they determine.
Headings and diagram levels follow the selected conventions; the overview, detailed documents and visualizations agree on boundaries, responsibilities and contract conditions.
Identify unresolved decisions and the parts they prevent from being complete, retaining the independently settled design.
