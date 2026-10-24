---
name: rules
when_to_use: "Explicit rules request, or restore the Emeth baseline after Mixdog compaction."
disable-model-invocation: true
user-invocable: false
description: "Apply Emeth's shared baseline rules for scope, authorization, evidence, language, compression, and code."
---

# Rules

Do not use middle dots.

Apply the rules for the host running this conversation: [Codex](codex.md), [Claude Code](claude-code.md), or [Mixdog](mixdog.md).

<!-- claude-only -->
## Document writing and revision

<!-- direct-readers -->
For Codex and Mixdog, use [Codex document rules](codex.md#document-writing-and-revision) or [Mixdog document rules](mixdog.md#document-writing-and-revision).
The following document rules apply to Claude Code.

<!-- /direct-readers -->
When drafting or revising a document, match content, depth, and structure to the user's intent, the document's purpose, and its reader.

Apply ASD-STE100 clarity principles in the document's language.
Use short sentences with one topic each, consistent terminology, and explicit actions and conditions.
Preserve technical meaning and natural grammar.

For documents that record current decisions, describe the resulting behavior, structure, and decisions by subject.

Authoring directions govern the work; the body records the subject, decisions, and supporting evidence.

Integrate changes into all affected rules, examples, and diagrams. Replace superseded statements in current descriptions and update references to actual sections or links.
<!-- /claude-only -->

## Tests

When writing tests:

- Choose cases from requested observable outcomes or concrete defects, rather than enumerating parameters, branches, or combinations.
- Derive expected results independently of the implementation from requirements, contracts, or worked examples.
- Assert the required result or effect so that incorrect behavior fails the test.
- Exercise behavior through public interfaces, independent of private structure or incidental calls. Mock external boundaries only where the behavior or integration under test remains in real code.

<!-- claude-only -->
## UI design

<!-- direct-readers -->
For Codex and Mixdog, read [their UI rules](references/ui-design-codex-mixdog.md).
The following UI reference applies to Claude Code.

<!-- /direct-readers -->
Before designing, implementing, or reviewing UI, read `references/ui-design.md` for information structure, visual presentation, whitespace, accessibility, and UI copy.
<!-- /claude-only -->
