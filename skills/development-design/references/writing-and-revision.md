# Writing and revising a Design

## Normalize the design

A discussion summary preserves the discussion's course; a Design records its currently valid result.

Keep document status in metadata and execution results in the completion report.

## Build the reading order

Order the needed content from the intended result through required behavior and consequential design decisions to open choices. Use sections where distinct contracts or choices need separate explanation.

For existing systems, identify files and symbols/sections from inspected code where needed to locate the change or explain responsibilities and affected contracts. Include current roles only where they explain the intended change. Mark new locations as proposed and unresolved locations as open choices.

## State the contract locally

Add concrete inputs, conditions, expected observations, or interaction boundaries where needed to distinguish correct behavior from plausible wrong results, referencing the governing behavior rule. Retain user/project verification obligations with their source and applicability; leave other verification methods open.

Required behavior remains interpretable independently of proposed structure and optional implementation details.

Where locally correct steps may combine into a wrong result, include a concrete input/state and final observations, including unaffected data.

## Choose the expression

For diagrams, use fenced Mermaid: `flowchart`, `sequenceDiagram`, or `stateDiagram-v2`.
