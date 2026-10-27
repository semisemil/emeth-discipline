---
name: architecture-map
description: Show a whole-system graph from connected Architecture Memory documents when the user asks to see the recorded architecture.
---

# Architecture Map

Show the system's overall structure from the project's connected Architecture Memory.
Use [Architecture Memory](../architecture-memory/SKILL.md) to locate and retrieve the documents.
If memory is not connected or is disabled, report that source limitation and leave setup unchanged.

## Build the overview

Start with system context and runtime or storage units, reusing material already read.
Read component, context or decision sections when they resolve a gap in the overview.
Preserve document preambles and required accompanying sections through the memory retrieval workflow.

Represent the system boundary, external actors or systems, major units, their responsibilities and the relationships established in the documents.
Choose the level of detail that makes the whole system understandable; put local rules and implementation detail in node descriptions or source references.
Architecture Memory routing `links` identify required reading, not system dependencies.
Derive graph relationships from the document content.

Keep recorded current, planned and uncertain structure distinguishable.
Describe the graph as the recorded architecture; a code freshness claim needs a separate source comparison.
When an overview is incomplete, distinguish a graph composition problem from missing source structure and identify the affected area.
Document repair follows a separate user request or existing authorization.

## Show the map

Apply [graph presentation](../../references/graph-presentation.md).
Reuse the same graph when revising this overview.
Complete when the overview shows the major responsibilities and relationships supported by the documents, with source references and any material gaps identified.
