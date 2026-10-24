---
name: how
description: "Use for \"how does X work\", code evidence for design, code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture and runtime flow, or returns findings for design. Use why for motivation."
disable-model-invocation: true
---

# How

Explore the codebase to explain how it works or return findings for design.
For user-facing explanations, build a working mental model for a senior engineer onboarding onto a subsystem.
The calling conversation owns the explanation or design evidence and checks the decisive source locations.

Every spawn is a general subagent with read-only access. Select the explorer and explainer models and reasoning effort through [execution](../../start-implementation/SKILL.md#subagents) and use the host mapping in [Harness](../../start-implementation/SKILL.md#harness).

## 1. Assess complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): explore and answer in the calling conversation. Go to step 4.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): go to step 2.

When in doubt, take the simple path.

## 2. Explore (complex only)

Keep tightly coupled questions in the calling conversation.
Delegate independent investigation slices when parallel research or a separate context window helps.
Give each explorer `<plugin-root>/skills/code-exploration/references/how/explorer-prompt.md` and its question.

## 3. Synthesize (complex only)

Synthesize the available findings in the calling conversation.
Resolve material conflicts against the code and carry the decisive source locations into the result.

## 4. Deliver

For a user-facing explanation, answer from the checked findings and the user's conversation context.
For design work, return the synthesized findings, evidence locations and unresolved limits to the calling workflow.

## Output format

Use the output contract in `<plugin-root>/skills/code-exploration/references/how/explainer-prompt.md` for the requested output purpose.
