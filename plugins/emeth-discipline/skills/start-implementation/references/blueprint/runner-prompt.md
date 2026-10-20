# Candidate design

Produce one independent implementation design for the supplied task and source evidence.
The artifact owns decisions the task leaves open: responsibility boundaries, state ownership, data flow and the tradeoffs that select this shape.
Refer to supplied public contracts and source locations for established behavior.
Show a changed signature, type or execution sequence only when it is needed to decide an open boundary.

For each load-bearing decision, state the chosen shape, the source constraint it satisfies, and the strongest viable alternative with the reason it loses.
Include concrete public observations that would disprove the design's critical assumptions.
Scale the artifact to those decisions; a small change usually needs one decision record.
Return its path and material unresolved decisions through the host's completion mechanism.
