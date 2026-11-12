### Refactoring

**You own the contract. The structure changes. The behavior does not.** Distinct from Feature, which adds behavior, and Bug fix, which corrects it.

Use the selected [../../SKILL.md: Implementation workflow](../../SKILL.md#implementation-workflow) while retaining the behavior pin and equivalence proof below.

If the cleanup reveals a missing feature or a real bug, split it out and ship the structural change first against the pinned contract. A redesign is allowed, but name it and route to Feature. Large or cross-cutting structural work belongs to the workflow in [../large-change.md](../large-change.md). This playbook is the focused-to-medium change.

1. Pin the behavior contract first.
   Reuse valid behavior evidence and use [../../../code-exploration/references/how.md](../../../code-exploration/references/how.md) to fill gaps in the contract.
   Write a characterization test, snapshot, or equivalence harness that captures current behavior before any structure moves.
   If the area has no coverage, write the pin before touching structure.
   Type check and lint are not a pin.
2. Name the structure the code is missing per [../../../../references/pstack/guidance/model-the-domain.md](../../../../references/pstack/guidance/model-the-domain.md). Boring code stays when the shape is already clear and local. The reshape must delete branches or invalid states, not add indirection.
3. Name the target shape. State what the module layout, types, and call graph should be if built today ([../../../../references/pstack/guidance/foundational-thinking.md](../../../../references/pstack/guidance/foundational-thinking.md), [../../../../references/pstack/guidance/redesign-from-first-principles.md](../../../../references/pstack/guidance/redesign-from-first-principles.md)). If the target crosses a function boundary, run the workflow in [../blueprint.md](../blueprint.md) for parallel design exploration of the shape before the move.
4. Subtract before you add. Delete dead code, collapse one-caller wrappers, drop redundant validators, and remove orphan references before introducing the new shape ([../../../../references/pstack/guidance/subtract-before-you-add.md](../../../../references/pstack/guidance/subtract-before-you-add.md)). The smallest change that reaches the target shape ships ([../../../../references/pstack/guidance/laziness-protocol.md](../../../../references/pstack/guidance/laziness-protocol.md)). A speculative cleanup that "might help" gets reverted.
5. Move in small behavior-preserving steps, each keeping the pin green. For API reshapes, migrate every caller and delete the old API in the same wave ([../../../../references/pstack/guidance/migrate-callers-then-delete-legacy-apis.md](../../../../references/pstack/guidance/migrate-callers-then-delete-legacy-apis.md)). No compatibility shims, no parallel old-and-new paths. Spot-check every rename against the actual files. Renames silently miss usages in strings, prose, and back-references. Retain coupled edits and complete the selected workflow's independent work against the pinned behavior.
6. Prove behavior is unchanged on the real artifact, not "it compiles" ([../../../../references/pstack/guidance/prove-it-works.md](../../../../references/pstack/guidance/prove-it-works.md)). For larger reshapes, run an equivalence check: a script that diffs old-vs-new outputs, a recorded baseline replayed against the new code, or a smoke run on the matching surface via the relevant control skill.
7. Confirm the change is worth keeping. The success measure is reduced reader load ([../../../../references/pstack/guidance/minimize-reader-load.md](../../../../references/pstack/guidance/minimize-reader-load.md)). If the diff does not lower reader load somewhere, revert it.
8. When commit delivery is in scope, order small commits: subtraction, then the reshape, then any follow-on cleanup.
   Use [../../../../references/pstack/guidance/sequence-verifiable-units.md](../../../../references/pstack/guidance/sequence-verifiable-units.md) for that delivery and any requested history reorganization, so each behavior-preserving slice stays green before the next.

**Reply:** the structure that changed, the pin you held it against, the equivalence proof, the reader-load delta, what shipped and what got reverted. No new behavior.
