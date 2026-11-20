---
name: rules
when_to_use: "Explicit rules request."
disable-model-invocation: true
user-invocable: false
description: "Apply Emeth's shared baseline rules for scope, authorization, evidence, language, compression, and code."
---

# Rules

Do not use middle dots.

## Scope and completion

Never silently omit, weaken or substitute a requested outcome, constraint or completion criterion; obtain user approval before changing one.
Claim completion only when every required outcome is satisfied; state unmet requirements and unverified checks with their effect on completion.

<!-- records-only -->
## Work records

`<plugin-root>` = `{{plugin-root}}`.
Only an explicit record request, a required workflow artifact, or this project's automatic-work-records enabled notice authorizes record access or record skills and CLIs; explicit requests leave the automatic-records setting unchanged.
Exclude record roots from general searches and inventories, including `--hidden`: rg `-g '!.emeth/**' -g '!.proofline/**'`, `git ls-files -- . ':!.emeth' ':!.proofline'`, adapted to the working directory and known custom roots.
When authorized, use the supplied entry/contract or, if absent, read `references/work-records.md`.

<!-- /records-only -->
Apply the rules for the host running this conversation: [Codex with GPT-6.2 models (codex-gpt-6.2.md)](codex-gpt-6.2.md), [Codex with earlier models (codex.md)](codex.md), or [Claude Code (claude-code.md)](claude-code.md).

## Code

Reuse existing implementations that meet the requirements and add abstractions only as needed; keep straightforward steps of one operation together.
Extract a helper only when its name and contract clarify the caller or multiple callers share the same rule.
Keep readable calls and declarations on one line when project formatting permits; when wrapping, group related arguments, parameters or comparisons on the same line.
Comment only where intent is hard to infer, such as why a value is required or what a stage of complex logic achieves.
When adding or restructuring modules, make each a deep module with a small interface over substantial behavior so one call completes an operation; keep internal stages, types, storage and protocol details private; connect stages through a result type the producer emits, so each consumer depends only on that result.

## Tests

When writing tests:

- Choose cases by requested observable outcomes or concrete defects, not parameter, branch or combination enumeration.
- Derive expectations from requirements, contracts or worked examples, independently of implementation; assert required results or effects so incorrect behavior fails.
- Exercise behavior through public interfaces, independently of private structure or incidental calls; mock external boundaries only where tested behavior or integration remains in real code.

<!-- claude-only -->
## UI design

<!-- direct-readers -->
For Codex, read [references/ui-design-codex.md](references/ui-design-codex.md).
The following UI reference applies to Claude Code.

<!-- /direct-readers -->
Before designing, implementing or reviewing UI, read `references/ui-design.md`.
<!-- /claude-only -->
