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
Maintain the selected Design required by this invoked workflow through [../development-design/references/document-editing.md](../development-design/references/document-editing.md).
Maintain other related Designs only when explicitly requested or project automatic work records are enabled.
Use the workflow explicitly selected by the user.
Otherwise, after grounding the affected paths, select verification ownership from the behavioral change before design exploration.
Use Separate implementation and tests when the change introduces or changes any of these:

- The interaction between processing stages or policies, including their input dependencies, applicability or required ordering.
- Allowed state transitions, required execution ordering, or effects carried across calls or actors through shared state.
- Compatibility rules across representations or integration boundaries, where new and existing behavior must coexist.

Otherwise, use Combined implementation and tests when requirements and baseline behavior establish the required result and the behavior to preserve.
Fill material evidence gaps before selecting.
Assess the changed relationships and contracts; an existing pipeline or stateful component alone does not select Separate implementation and tests.
Detailed requirements and specified interfaces do not remove these verification conditions.
Keep the selection for the same work contract; reconsider it when new behavioral evidence or accepted requirements change that classification.
Use [references/blueprint.md: Phase B: Sketch](references/blueprint.md#phase-b-sketch) for design candidate selection; candidates do not replace the selected workflow's review or test roles.

Use the selected workflow throughout the task's playbook, retaining its reproduction, behavior-preservation and delivery checks.
Reuse a reviewed Design, candidate artifacts and verification while their contracts and source evidence remain valid.

When delegating work or mapping workflow tools to the host, read [references/subagents.md](references/subagents.md).

For Separate implementation and tests, obtain independent review of the selected design before implementation through [../ensemble/SKILL.md: Independent review](../ensemble/SKILL.md#independent-review).
Have a fresh test author write independent public-contract tests using [../../references/pstack/implementation-prompt.md](../../references/pstack/implementation-prompt.md).
Supply requirement and baseline source paths, test conventions and distinct owned test paths under that role's input contract.
Implement in parallel, then integrate the tests and resolve failures against their contract basis.

For Combined implementation and tests, implement and test in the calling conversation, then obtain [../ensemble/SKILL.md: Independent review](../ensemble/SKILL.md#independent-review) of the completed implementation, supplying original requirements, source baseline, any candidate artifacts and verification evidence.
Independent review applies even without design candidates, except for a contained change as defined below.
For either workflow, resolve material findings and obtain that judge's review of the affected corrections before delivery.
A contained change in Combined implementation and tests stays inside one component, leaves public contracts unchanged, and has its complete required result verified by existing tests or direct observation; the calling conversation's verification completes its review unless the user or the Design requests an independent review.
Both workflows finish with verification of the complete public result on the real artifact.

### Implementation candidates

Optionally use [../ensemble/SKILL.md](../ensemble/SKILL.md) to compare the smallest useful scope of actual implementation candidates when the comparison can resolve a remaining implementation choice.
Use [../../references/pstack/implementation-prompt.md](../../references/pstack/implementation-prompt.md) for candidate assignments under the accepted Design.
Use an isolated experiment when only an observation is needed to decide; implementation candidates supply code intended for integration.

## Principles

Read the relevant guidance when its trigger applies.

**Core**

- [Laziness protocol](../../references/pstack/guidance/laziness-protocol.md): Refactoring, diff sizing or proposed abstractions.
- [Foundational thinking](../../references/pstack/guidance/foundational-thinking.md): Core data shapes, scaffolding or shared state.
- [Redesign from first principles](../../references/pstack/guidance/redesign-from-first-principles.md): New requirements in an existing design.
- [Subtract before you add](../../references/pstack/guidance/subtract-before-you-add.md): Sequencing an addition, refactor or rewrite.
- [Minimize reader load](../../references/pstack/guidance/minimize-reader-load.md): Code that is hard to trace.
- [Outcome-oriented execution](../../references/pstack/guidance/outcome-oriented-execution.md): Rewrites or migrations with phase boundaries.
- [Exhaust the design space](../../references/pstack/guidance/exhaust-the-design-space.md): Novel interactions or architecture without precedent.
- [Build the lever](../../references/pstack/guidance/build-the-lever.md): Repeated work or a needed rerunnable proof.

**Architecture**

- [Model the domain](../../references/pstack/guidance/model-the-domain.md): Stateful logic, heavy branching or repeated shape assumptions.
- [Boundary discipline](../../references/pstack/guidance/boundary-discipline.md): Validation, error handling or framework adapters.
- [Make operations idempotent](../../references/pstack/guidance/make-operations-idempotent.md): Commands or loops subject to crashes and retries.
- [Migrate callers then delete legacy APIs](../../references/pstack/guidance/migrate-callers-then-delete-legacy-apis.md): New internal APIs with existing callers.
- [Separate before serializing shared state](../../references/pstack/guidance/separate-before-serializing-shared-state.md): Concurrent writers to the same mutable object.

**Verification**

- [Prove it works](../../references/pstack/guidance/prove-it-works.md): Before declaring completion.
- [Fix root causes](../../references/pstack/guidance/fix-root-causes.md): Debugging.
- [Sequence verifiable units](../../references/pstack/guidance/sequence-verifiable-units.md): Multi-step work or stacked commits and PRs.

**Delegation**

- [Guard the context window](../../references/pstack/guidance/guard-the-context-window.md): Large outputs, long files, repeated reads or fan-out.
- [Never block on the human](../../references/pstack/guidance/never-block-on-the-human.md): Approval questions about reversible work.

**Meta**

- [Encode lessons in structure](../../references/pstack/guidance/encode-lessons-in-structure.md): Repeated instructions or recurring corrections.

## Comments

Comments follow the same rule as the reply. Write them clean as you go. Keep a comment only for a non-obvious *why* the code can't show. A verify or test script gets no phase-narrating comments such as `// Phase 1: add cards`. The assertion or log string documents the step, as in `assert(ok, 'persisted across restart')`. This applies to every file you produce, including the delegate's diff.

## Playbooks

Select the playbook for the requested behavior and read its steps.
Track the current stage, remaining dependencies and completion evidence in the host's task plan.

A large or cross-cutting effort (a migration across many call sites, an ambitious multi-part change), or work the user steps away from to trust later, routes to the [references/large-change.md](references/large-change.md) even when a narrower playbook like Feature fits. Use the [references/large-change.md](references/large-change.md) whenever no bundled playbook fits. It designs a bespoke, rigorous playbook for the task.

- [references/playbooks/bug-fix.md](references/playbooks/bug-fix.md). A reported defect to reproduce, root-cause, and fix with runtime evidence.
- [references/playbooks/feature.md](references/playbooks/feature.md). New or changed behavior, built from a named data shape.
- [references/playbooks/refactoring.md](references/playbooks/refactoring.md). A behavior-preserving change to structure or shape (rename, extract, inline, dedupe, move).

User-facing output follows the user's language.

## Handoff and work context

Before fan-out, retain the original task and accepted directives by source path; save their exact text when they exist only in the conversation. Pass those paths and the shared grounding with each role's prescribed prompt. Extend the grounding with source ranges needed to answer a new question; reuse the evidence while its sources and conditions remain unchanged.

Use the [../../references/delegated-work.md](../../references/delegated-work.md) without replacing a role's required prompt, artifact, findings or verification.

For versioned reads, work-boundary checkpoints or recovery after compaction, read [references/work-context.md](references/work-context.md).

## Internal references

The playbooks and their called procedures own sequencing.

- [references/blueprint.md](references/blueprint.md).
- [references/impact-analysis.md](references/impact-analysis.md): Use for requested blast-radius analysis or when a concrete risk outside the changed paths needs investigation before delivery.
- [references/regression-test.md](references/regression-test.md).
- [references/challenge.md](references/challenge.md).
