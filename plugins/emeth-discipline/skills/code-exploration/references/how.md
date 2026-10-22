---
name: how
description: "Use for \"how does X work\", code evidence for design, code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture and runtime flow, or returns findings for design. Use why for motivation."
disable-model-invocation: true
---

# How

Explore the codebase to explain how it works or return findings for design.
For user-facing explanations, build a working mental model for a senior engineer onboarding onto a subsystem.
Tell the explainer whether the requested output is an explanation or design evidence.

Every spawn is a general subagent with read-only access. Select the explorer and explainer models and reasoning effort through [execution](../../start-implementation/SKILL.md#subagents) and use the host mapping in [Harness](../../start-implementation/SKILL.md#harness).

## 1. Assess complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): no explorers. Spawn one explainer that explores and produces the requested output in one pass, built from `<plugin-root>/skills/code-exploration/references/how/explainer-prompt.md` without the explorer-findings section. Go to step 4.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): go to step 2.

When in doubt, take the simple path.

## 2. Explore (complex only)

Decompose the question into 2 to 4 angles, each a distinct slice of the subsystem. Spawn all explorers in a single message, each with `<plugin-root>/skills/code-exploration/references/how/explorer-prompt.md` and its angle filled in.

## 3. Synthesize (complex only)

Once all explorers have returned, spawn one explainer with `<plugin-root>/skills/code-exploration/references/how/explainer-prompt.md`, every explorer's findings and the requested output purpose.

## 4. Deliver

For a user-facing explanation, present the explainer's output with light edits for clarity or conversation context.
For design work, return the synthesized findings, evidence locations and unresolved limits to the calling workflow.

## Output format

Use the output contract in `<plugin-root>/skills/code-exploration/references/how/explainer-prompt.md` for the requested output purpose.
