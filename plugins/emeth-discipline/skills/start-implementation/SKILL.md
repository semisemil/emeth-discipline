---
name: start-implementation
when_to_use: "Explicit request or figure-it-out: implement a ready Design with pstack playbooks."
description: Execute the pstack implementation playbook for a reviewed Design.
disable-model-invocation: true
argument-hint: "<DESIGN-ID>"
---

# Start Implementation

Use the original task and accepted user directives as scope, with the reviewed Design as the implementation contract. For a Design ID, resolve its overview and detailed documents with:

```text
node <plugin-root>/dashboard/records/development-contracts.js --project-root <project> --id <DESIGN-ID> --format paths
```

## Implementation workflow

The calling conversation owns design selection, coupled code, integration and final verification.
After grounding the affected paths, select verification ownership from the behavioral change before design exploration.
Use Continuous owner when the change introduces or changes any of these:

- The interaction between processing stages or policies, including their input dependencies, applicability or required ordering.
- Allowed state transitions, required execution ordering, or effects carried across calls or actors through shared state.
- Compatibility rules across representations or integration boundaries, where new and existing behavior must coexist.

Otherwise, use Integrated owner when requirements and baseline behavior establish the required result and the behavior to preserve.
Fill material evidence gaps before selecting.
Assess the changed relationships and contracts; an existing pipeline or stateful component alone does not select Continuous owner.
Detailed requirements and specified interfaces do not remove these verification conditions.
Keep the selection for the same work contract; reconsider it when new behavioral evidence or accepted requirements change that classification.
Select design candidates separately through [blueprint](references/blueprint.md#phase-b-sketch).
Candidate use leaves the selected workflow's review and test roles in place.

| Workflow | Selection | Independent work |
| --- | --- | --- |
| Integrated owner | The change does not meet a Continuous owner condition, and its required and preserved behavior are grounded | The calling conversation selects the design, implements and verifies it; one independent judge reviews the completed result |
| Continuous owner | The change meets any Continuous owner condition above | One independent judge reviews the selected design before implementation; a fresh test author works alongside the calling conversation's implementation |

Use the selected workflow throughout the task's playbook, retaining its reproduction, behavior-preservation and delivery checks.
Reuse a reviewed Design, candidate artifacts and verification while their contracts and source evidence remain valid.

For Continuous owner, assign independent public-contract tests through the [implementation delegate prompt](../../references/pstack/implementation-prompt.md).
Supply requirement and baseline source paths, test conventions and distinct owned test paths under that role's input contract.
Implement in parallel, then integrate the tests and resolve failures against their contract basis.

Use the [independent review contract](../ensemble/SKILL.md#independent-review) at the selected workflow's review boundary, including when no design candidates were used.
For Integrated owner, supply the completed implementation, original requirements, source baseline, any candidate artifacts and verification evidence.
Resolve material findings and obtain that judge's review of the affected corrections before delivery.
Both workflows finish with verification of the complete public result on the real artifact.

## Principles

Read the leaf guidance document in full for any principle you apply. Each entry names when it applies.

**Core**

- [Laziness Protocol.](../../references/pstack/guidance/laziness-protocol.md) Refactoring, sizing a diff, or tempted to add abstractions, layers, or signal threading. Bias to deletion and the smallest change that solves the problem.
- [Foundational Thinking.](../../references/pstack/guidance/foundational-thinking.md) Before writing logic: core types and data structures, scaffold-vs-feature sequencing, what concurrent actors share.
- [Redesign from First Principles.](../../references/pstack/guidance/redesign-from-first-principles.md) Integrating a new requirement into an existing design. Redesign as if it had been foundational from day one.
- [Subtract Before You Add.](../../references/pstack/guidance/subtract-before-you-add.md) Sequencing an addition, refactor, or rewrite. Remove dead weight first, then build on the simpler base.
- [Minimize Reader Load.](../../references/pstack/guidance/minimize-reader-load.md) Reviewing or shaping code that's hard to trace. Count layers and hidden state, collapse one-caller wrappers, shrink mutable scope.
- [Outcome-Oriented Execution.](../../references/pstack/guidance/outcome-oriented-execution.md) Planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture, don't preserve throwaway compatibility states.
- [Exhaust the Design Space.](../../references/pstack/guidance/exhaust-the-design-space.md) A novel interaction or architectural decision with no precedent. Build 2-3 competing prototypes and compare before committing.
- [Build the Lever.](../../references/pstack/guidance/build-the-lever.md) Any non-trivial work. Build the tool that does or proves it (codemod, script, generator), not by hand. The tool is the artifact a reviewer reruns.

**Architecture**

- [Model the Domain.](../../references/pstack/guidance/model-the-domain.md) Writing stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure (state machine, typed model, table or registry, reducer, boundary, the right collection) instead of scattered conditionals.
- [Boundary Discipline.](../../references/pstack/guidance/boundary-discipline.md) Wiring validation, error handling, or framework adapters. Guards at system boundaries, trust internal types, keep business logic pure.
- [Make Operations Idempotent.](../../references/pstack/guidance/make-operations-idempotent.md) Designing commands, lifecycle steps, or loops that run amid crashes and retries. Converge to the same end state.
- [Migrate Callers Then Delete Legacy APIs.](../../references/pstack/guidance/migrate-callers-then-delete-legacy-apis.md) Introducing a new internal API while old callers exist. Migrate and delete in one wave.
- [Separate Before Serializing Shared State.](../../references/pstack/guidance/separate-before-serializing-shared-state.md) Concurrent actors might write the same file, branch, key, or object. Eliminate the sharing first.

**Verification**

- [Prove It Works.](../../references/pstack/guidance/prove-it-works.md) After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles".
- [Fix Root Causes.](../../references/pstack/guidance/fix-root-causes.md) Debugging. Trace each symptom back to the first place the system went wrong and fix it there. A guard is a fix only when the state it handles is legitimate.
- [Sequence Work into Verifiable Units](../../references/pstack/guidance/sequence-verifiable-units.md) (**principle-sequence-verifiable-units**). Multi-step work (sweeps, migrations, runs of similar edits) and how you stack commits and PRs. Break work into small units that each end in a check, verify each before the next, and order delivery so the sequence proves itself.

**Delegation**

- [Guard the Context Window.](../../references/pstack/guidance/guard-the-context-window.md) Context fills up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents, keep summaries in the main thread.
- [Never Block on the Human.](../../references/pstack/guidance/never-block-on-the-human.md) Tempted to ask "should I do X?" on reversible work. Proceed, present the result, let the human course-correct.

**Meta**

- [Encode Lessons in Structure.](../../references/pstack/guidance/encode-lessons-in-structure.md) You catch yourself writing the same instruction a second time. Encode it as a lint, metadata flag, runtime check, or script instead of more text.

## Subagents

Use the [implementation delegate prompt](../../references/pstack/implementation-prompt.md) for separable implementation or verification artifacts inside a playbook step.
The calling conversation runs the playbook and retains coupled implementation and integration.
Routed workflows keep their own roles and role prompts.

**Defaults for every subagent call.** Pass the role prompt and [delegated-work contract](../../references/delegated-work.md) by path, with the assignment's source and owned artifact paths.
Use background execution and keep connected tools available when the role needs them.

**Model selection.** Explicit user settings take precedence over workflow settings and role defaults.
For settings left unspecified by the user or owning workflow, run:

```text
node "<plugin-root>/lib/model-routing.js"
```

Apply the returned guidance through the host's supported model and reasoning arguments, within the user's usage limits.
Report unsupported explicit requirements instead of substituting them.

Review a delegated artifact against its assigned contract and resolve material findings with affected verification.
For ensemble and challenge seats, a second opinion uses the same prompt in an independent context.
Attribute agreement to the independent reviewers.

**Independent assignments use fresh contexts.** Continue an assignment with its owner when correcting its artifact or reviewing affected corrections.
Pass changed contracts, source paths and stopping conditions with the follow-up.
Start a fresh assignment for new work and carry still-valid decisions by path.

## Harness

`Read`, `Grep` and `Glob` mean the host's file-reading, content-search and path-search tools. Read-only parameters express the role's write restrictions; when Codex has no such argument, keep that restriction in the assignment prompt.

pstack was written for Cursor. In another harness (Claude Code, Codex, Pi, OpenCode, and others), read Cursor-specific instructions in this skill, its playbooks, and the routed skills through these mappings. If you can't tell which harness you are, check which of the paths below exist.

- **Subagents.** `Task` means your subagent tool: `Agent` in Claude Code (`subagent_type: general-purpose`), `task` in OpenCode (`subagent_type: general`), `spawn_agent` in Codex. For a fresh Codex assignment, use `fork_turns: "none"` with the prescribed role prompt and paths to its task, grounding, and output artifacts. Drop parameters your tool doesn't have. `environment: "cloud"` means a Cursor cloud agent. Elsewhere, run that agent locally in its own worktree. If your harness has no subagent tool, as in Pi without an extension, do each delegated step yourself, one after another.
- **Implementation delegates.** Where the source names `poteto-agent`, use a general subagent with the [implementation delegate prompt](../../references/pstack/implementation-prompt.md).
- **Transcripts.** Read only the active workspace's sessions, never other projects'. Cursor: the `agent-transcripts/` directory the system prompt names. Claude Code: `~/.claude/projects/<slug>/*.jsonl`, where `<slug>` is the workspace path with every character that isn't a letter or digit turned into "-". Pi: `~/.pi/agent/sessions/--<slug>--/*.jsonl`, where `<slug>` is the workspace path with the leading slash dropped and each "/" turned into "-". Codex: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, keeping files whose first line has `payload.cwd` equal to the workspace path. OpenCode: `~/.local/share/opencode/storage/`.
- **Skill folders.** Project: `.cursor/skills/` (Cursor), `.claude/skills/` (Claude Code), `.pi/skills/` (Pi), `.agents/skills/` (Codex, OpenCode, and others). User: `~/.cursor/skills/`, `~/.claude/skills/`, `~/.pi/agent/skills/`, `~/.codex/skills/`, `~/.agents/skills/`.
- **Questions.** `AskQuestion` means the host's structured-question tool, such as `request_user_input_async` in Codex. Without one, ask in chat with numbered options.
- **Tools pstack doesn't ship.** `create-skill` is Cursor's built-in skill-authoring skill. Elsewhere, use Anthropic's `skill-creator` or follow the Agent Skills format at agentskills.io. `deslop`, `control-cli`, and `control-ui` come from Cursor's `cursor-team-kit` plugin. Without `deslop`, reread the diff before commit and cut AI slop yourself. Without the control skills, drive the app with the automation you have: Playwright or a CDP browser for web and Electron, tmux or a PTY for CLIs and TUIs. `/loop` is built into Cursor and Claude Code. For delegated work, use the host's completion mechanism. In Codex, follow the [subagent completion rules](../rules/codex.md#subagent-completion).

## Comments

Comments follow the same rule as the reply. Write them clean as you go. Keep a comment only for a non-obvious *why* the code can't show. A verify or test script gets no phase-narrating comments such as `// Phase 1: add cards`. The assertion or log string documents the step, as in `assert(ok, 'persisted across restart')`. This applies to every file you produce, including the delegate's diff.

## Playbooks

Select the playbook for the requested behavior and read its steps.
Track the current stage, remaining dependencies and completion evidence in the host's task plan.

A large or cross-cutting effort (a migration across many call sites, an ambitious multi-part change), or work the user steps away from to trust later, routes to the [large-change procedure](references/large-change.md) even when a narrower playbook like Feature fits. Use the [large-change procedure](references/large-change.md) whenever no bundled playbook fits. It designs a bespoke, rigorous playbook for the task.

- [Bug fix](references/playbooks/bug-fix.md). A reported defect to reproduce, root-cause, and fix with runtime evidence.
- [Feature](references/playbooks/feature.md). New or changed behavior, built from a named data shape.
- [Refactoring](references/playbooks/refactoring.md). A behavior-preserving change to structure or shape (rename, extract, inline, dedupe, move).

User-facing output follows the user's language.

## Handoff and work context

Before fan-out, retain the original task and accepted directives by source path; save their exact text when they exist only in the conversation. Pass those paths and the shared grounding with each role's prescribed prompt. Extend the grounding with source ranges needed to answer a new question; reuse the evidence while its sources and conditions remain unchanged.

Use the [delegated-work return contract](../../references/delegated-work.md) without replacing a role's required prompt, artifact, findings or verification. Reuse delivered context and unchanged evidence. Keep stage, accepted decisions and artifact versions through the [work-context helper](#work-context).

### Work context

Reuse a read or decision while its artifact version and relevant conditions remain unchanged.
For a new question or missing context after compaction, retrieve the needed range again.

When the host offers versioned artifact reads and workflow state, use them.
The read response identifies the artifact version, returns its first content, and then returns changes or an unchanged result.
Request a full refresh when the previous content is no longer sufficient.

For other hosts, the packaged helper provides the same read behavior:

```text
node <plugin-root>/lib/work-context.js read --state <temporary-state-file> --path <file> [--from <line> --to <line>] [--refresh]
```

At a completed work boundary, retain the stage, accepted decisions, remaining issues, and artifact versions in the host's workflow state.
Recover that state after compaction before deciding which evidence is missing.
The helper also supports `checkpoint --state <file> --stage <stage> --decision <decision> --pending <issue>` and `status --state <file>`.

Use line-based search with bounded context for a local question.
Batch independent reads and return the selected ranges, rather than filtering a whole-file string.

## Internal references

The playbooks and their called procedures own the invocation conditions and order.

- [blueprint](references/blueprint.md).
- [impact-analysis](references/impact-analysis.md).
- [regression-test](references/regression-test.md).
- [challenge](references/challenge.md).
