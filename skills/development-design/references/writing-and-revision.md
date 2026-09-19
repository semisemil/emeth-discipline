# Writing and revising a Design

## Normalize the design

A discussion summary preserves the discussion's course; a Design records its currently valid result.

Keep document status in metadata and execution results in the completion report.

## Build the reading order

Use this default progression, with headings in the project's terminology:

- Definition: the feature or change.
- Behavior: actions, observable results, and conditions.
- Change design: where and how, responsibilities, data flow, affected contracts, and structural reasons.
- Open decisions: choices, candidates, consequences, and needed resolution.

For existing systems, identify each affected file and symbol/section from inspected code, its current role, and intended change. Mark new locations as proposed and unresolved locations as open choices.

## State the contract locally

Verification sections reference behavior rules and add concrete inputs, conditions, expected observations, and interaction boundaries. Retain user/project verification obligations with their source and applicability; leave other verification methods open.

Required behavior remains interpretable independently of proposed structure and optional implementation details.

Where locally correct steps may combine into a wrong result, include a concrete input/state and final observations, including unaffected data.

## Choose the expression

Use newlines after sentences and blank lines between paragraphs. Group related sentences; favor readability over line/token savings.

Use fenced Mermaid diagrams: `flowchart`, `sequenceDiagram`, or `stateDiagram-v2`.
