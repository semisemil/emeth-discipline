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

Reuse existing implementations that meet the requirements.
Use the plainest construct that meets an established need: for behavior, inline code, a function, a class, then an interface or factory; for data, built-in values and collections, a named type, then a class.
Needs come from current code and callers, and in a new program also from stated requirements and agreed designs; expected reuse, extensibility or testability is not a need.
Move up only when:

- function: several places apply one rule that must change together; similar code with separate reasons to change stays separate.
- named type: data crosses a module boundary or is stored, or positional fields become ambiguous.
- class: mutable state persists across calls under an invariant its operations keep.
- interface or factory: two implementations exist, or callers must not depend on the concrete one (published API, plugin point, enforced dependency direction).
- parameter object: several parameters travel together across call sites.

Make a value a parameter, option or generic type only when current callers vary it; constructs the language, framework or an existing API requires are exempt.
In existing code, build on its structure and extension points; for testability, separate logic from I/O before adding mock interfaces.
Follow project idiom for how to write a construct, not whether to add one.
When adding or restructuring modules, give each a small interface where one call completes an operation, and keep internals private.
Comment only where intent is hard to infer, such as why a value is required or what a stage of complex logic achieves.

## Tests

Before writing tests, read `references/tests.md`.

<!-- claude-only -->
## UI design

<!-- direct-readers -->
For Codex, read [references/ui-design-codex.md](references/ui-design-codex.md).
The following UI reference applies to Claude Code.

<!-- /direct-readers -->
Before designing, implementing or reviewing UI, read `references/ui-design.md`.
<!-- /claude-only -->
