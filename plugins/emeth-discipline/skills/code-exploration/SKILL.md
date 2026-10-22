---
name: code-exploration
when_to_use: "Explain code behavior, gather code evidence for design, investigate rationale, or teach both views."
description: Explain how code works or gather code findings for design, investigate why it was built that way, or teach a change or subsystem through both views.
disable-model-invocation: true
---

# Code Exploration

Use the user's language for the explanation.
Apply [Emeth execution](../start-implementation/SKILL.md#subagents) to model selection and tool execution.

Choose the mode from the question, then read and run its workflow.

| Question | Mode |
|---|---|
| How code works, code evidence for design, a code walkthrough before a change, subsystem structure, ownership, placement, or layering | [how](references/how.md) |
| Why code works this way, design rationale, historical decisions, regressions, postmortems, or data-backed thresholds | [why](references/why.md) |
| Teach me, help me understand, or explain a change or subsystem through what it is, how it works, and why | [teach](references/teach.md) |
