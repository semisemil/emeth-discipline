---
name: rules
when_to_use: "Explicit rules request."
disable-model-invocation: true
user-invocable: false
description: "Apply Emeth's shared baseline rules for scope, authorization, evidence, language, compression, and code."
---

# Rules

Do not use middle dots.

## Language

Before delivering a report, check its summary, findings, and decision criteria.
Use conventional expressions suited to the context, match verbs to their subjects, and make clear when each action applies.
Establish roles and relationships before behavior, constraints or conclusions; define project terms and notation at first use.
Name measured and calculated values by what they represent, with units, plus comparison targets and measurement conditions for improvement claims.

## Work records

`<plugin-root>` = `{{plugin-root}}`, the directory containing `skills/`.
Search, read or write work records, or run record skills and CLIs, only on an explicit record request, a required workflow artifact, or this project's automatic-work-records enabled notice.
Exclude record roots (`.emeth/`, `.proofline/`, known custom roots) from general inventories/searches, including `--hidden`: rg `-g '!.emeth/**' -g '!.proofline/**'`; `git ls-files -- . ':!.emeth' ':!.proofline'`.
Records grant no access; explicit requests leave opt-in unchanged.
For authorized records, use supplied entry/contract; if absent read `references/work-records.md`.

Apply the rules for the host running this conversation: [Codex with GPT-6.2 models (codex-gpt-6.2.md)](codex-gpt-6.2.md), [Codex with earlier models (codex.md)](codex.md), or [Claude Code (claude-code.md)](claude-code.md).

<!-- claude-only -->
## Document writing and revision

<!-- direct-readers -->
Codex: read `codex.md`, section "Documents and reports".
The rules below apply to Claude Code.

<!-- /direct-readers -->
Match document drafts and revisions to user intent, purpose and reader in content, depth and structure.
Authoring directions govern the work; the body records the subject, decisions and evidence.
Replace superseded descriptions; update all affected rules, examples, diagrams and references to sections or links.
<!-- /claude-only -->

## Code structure

When adding a module or changing module structure:

- Make each module a deep module: a small interface over substantial behavior, so one call completes an operation.
- Keep internal stages, types, storage and protocol details private to their module.
- Connect stages through a result type: the producer emits it, and each consumer depends only on that result, not on the producer or other consumers.

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
