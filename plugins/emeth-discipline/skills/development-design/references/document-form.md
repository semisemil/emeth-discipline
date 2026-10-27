# Design document form

Organize the selected design so its readers can understand the system or change as a whole, then find the detail needed to assess, implement and verify it.

## Select the content

Include the requested outcome and retain a passage only when removing it would leave a concrete decision, implementation step or verification outcome unclear or incorrect for the intended reader.
Judge that loss against the reader's role and knowledge and what the document or linked sources already establish.
Relevance, factual correctness or possible usefulness alone do not justify inclusion.
Consolidate repeated explanations and omit routine steps that add no choice, contract condition or way to distinguish correct behavior.
Delete content that fails this test rather than moving it to a supporting document.
When an existing workspace rule constrains the change, explain its specific effect and reference its source instead of copying the rule or design workflow instructions into the body.
Include proposals, examples, reported experiments and optional follow-up work only when they pass the content selection criteria, preserving their stated status when included.
Keep the Design's unresolved matters together in one consolidated location so the reader can review its remaining decisions and missing facts, with the affected parts and their impact identified.
Link to that list from affected sections instead of maintaining separate unresolved records there.
Keep candidate selection history, investigation records and review reports in supporting documents when those records are needed.

## Design structure

Explain the affected boundaries, components, responsibilities, connections, owned data and state, interfaces and runtime transitions needed to understand the selected design; these are not mandatory sections.
Connect requirements to the choices that satisfy them, and unresolved choices to the parts they affect.
Derive the document hierarchy from the reader's task and the relationships among affected parts, with section depth suited to the design's complexity.
Group content by a concrete subject or reader task, keeping each section's contents within that purpose.
Place later additions with their subject or reader action, revising the hierarchy when necessary.
Introduce the whole and its relationships before the details that depend on them.
Nest component-specific behavior and state under the component they describe.
Choose architectural views by the content selection criteria, using arc42 where it fits.
Runtime views use those same components and contracts to explain each important path from its trigger through state changes to success or recovery.
Place each contract with its owning component or shared interface and reference it from the flows that use it.
Use existing task and architecture documents for contracts they already establish.

Keep the reasons needed to understand the selected architecture in the design, beside the affected choice or in its rationale section.
Record significant architectural decisions through [Architecture Memory ADR guidance](../../architecture-memory/references/decision-templates.md).
The design body describes the selected architecture and the parts affected by remaining decisions.

## Explain the design

Use diagrams when they clarify structure or important runtime or state relationships, and tables for parallel contracts or properties.
Keep a view only when it passes the content selection criteria, and place it beside the explanation it supports.
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

State behavior and conditions directly, using established project terms.
Keep sentences readable and preserve conditions, exceptions, and causal relationships when shortening them.

## Check the complete document

Apply [content selection](#select-the-content) across the complete document set, then check missing requirements against the user's request and accepted choices.
Assess whether the reader can move from the system overview to its parts and their detailed behavior, then follow important scenarios without reconstructing scattered rules.
Headings follow [design structure](#design-structure), including the placement of later additions.
Responsibilities and ownership agree, transitions honor operation and data contracts, and decisions appear in the structure and behavior they determine.
Headings and diagram levels follow the selected conventions; the overview, detailed documents and visualizations agree on boundaries, responsibilities and contract conditions.
Independently settled parts remain usable while unresolved matters are tracked.
