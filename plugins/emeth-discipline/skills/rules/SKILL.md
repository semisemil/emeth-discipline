---
name: rules
disable-model-invocation: true
user-invocable: false
description: "Apply Emeth's shared baseline rules for scope, authorization, evidence, language, compression, and code."
---

# Rules

Do not use middle dots.

Apply the rules for the host running this conversation: [Codex](codex.md) or [Claude Code](claude-code.md).

## Document writing and revision

Before drafting or revising a document, read `references/writing-and-revision.md` for normalization, organization, expression, and revision consistency.

## Tests

When writing tests:

- Choose cases from requested observable outcomes or concrete defects, rather than enumerating parameters, branches, or combinations.
- Derive expected results independently of the implementation from requirements, contracts, or worked examples.
- Assert the required result or effect so that incorrect behavior fails the test.
- Exercise behavior through public interfaces, independent of private structure or incidental calls. Mock external boundaries only where the behavior or integration under test remains in real code.

## UI design

Before designing, implementing, or reviewing UI, read `references/ui-design.md` for information structure, visual presentation, whitespace, accessibility, and UI copy.
