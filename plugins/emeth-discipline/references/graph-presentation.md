# Graph presentation

Use the user's language for graph labels and descriptions.
Keep the overview in nodes and relationships, with supporting detail and source references beside the relevant item.

## Graph Viewer

When Graph Viewer publish and open tools are available, use them with the current project's absolute path.
Apply the installed `graph-viewer` skill for its format, save, update and open workflow when that skill is available; otherwise use the discovered tool descriptions.
Simple graphs can use Mermaid flowcharts; use Graph JSON when descriptions, status or source references are needed.
Read the installed format reference or tool schema before constructing Graph JSON.

Graph Viewer owns graph storage and presentation.
The calling Emeth skill owns source selection and the meaning of nodes and relationships.
If saving or opening fails, include the Mermaid fallback and briefly report the display failure.

## Mermaid fallback

When Graph Viewer tools are unavailable, include a Mermaid flowchart in the response.
Preserve the same subjects, relationships and uncertainty in either presentation.
Place supporting evidence and detail that Mermaid cannot carry next to the diagram.
