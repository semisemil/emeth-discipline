---
name: figure-it-out-lite
when_to_use: "Explicit request only: use the experimental lightweight Figure It Out workflow."
disable-model-invocation: true
description: Complete the requested workflow with selective delegation and concise handoffs.
---

Group tool work up to the next decision and return its needed evidence. For outcomes other than implementation, use [Figure It Out outcome routing](../figure-it-out/SKILL.md).

For implementation, get the current decision criteria with `node "<skill-dir>/scripts/guide.js" <stage>`:

- `route` at entry to ground the request and select the implementation workflow. Pair it with the first relevant project reads.
- `sketch` when selecting or reusing the internal design.
- `design` when preparing the selected Design.
- `review` when assigning independent review.
- `implement` when entering start-implementation and selecting the playbook.

Read linked references when a decision or operation needs their detail. Follow the Design, review and verification required for the requested outcome.

The calling conversation owns selection, coupled implementation, integration and final verification.
Run the selected workflow's required independent assignments. When Sketch calls for candidate comparison, dispatch both design candidates. Give the independent test author and the independent judge their own agents, separate from the design candidates. Delegate additional work when it resolves a material uncertainty.

The coordinator aims for 8,000 generated tokens across the task, including tool arguments and artifacts. Reuse completed work by reference and edit only what changes. Scope each tool query to the next decision. Filter results inside the tool batch. Return selected matches or excerpts for reads, and exit status with actionable failures for checks. Aim for 1,000 input tokens per batch. Fetch more when needed to resolve a material question or verify the result.

For Lite assignments, use the following context choice in place of the playbook's fresh-session default.
When a delegate needs context already gathered by the parent, prefer a host-supported fork that can reuse the shared prefix.
On Codex, use `fork_turns: "all"` when the inherited settings suit the role.
Give the fork only its assignment and the decision its result must support. Before forking, read only what is needed to select the workflow and give candidates and independent test authors a shared factual baseline. Dispatch them once they can start from that baseline. Read role-specific evidence and later-stage references in the session that needs them. Read reporting references when preparing the response they govern.
Use a fresh session with the necessary source evidence when the role must reach an independent conclusion and the parent history would reveal excluded work.
For Separate implementation and tests, dispatch the independent test author from the shared factual baseline before collecting design candidate results. On Codex name that assignment `lite_test_author` so the role can receive its output budget notice. Supply the accepted public interface when the author needs it to run the checks.

Give each delegate a target of 1,000 generated tokens for its assignment, including tool arguments and artifact contents. Use more when the required deliverable needs it. Reuse available evidence and generate only the missing parts.

Keep the selected workflow's roles and assignments. Give each delegate the output contract for its role, including in fresh-session handoffs:

- Design candidate: one entry per open decision with the proposed mechanism, decisive tradeoff and any unresolved constraint. Reference shared requirements by location.
- Independent reviewer: return one line of clearance, or one entry per material finding with its location, counterexample and expected result. On re-review report only changed findings and remaining blockers.
- Test author: write one compact executable scenario through the public entry point that distinguishes the required behavior from a plausible implementation error. Derive its inputs and expected observations independently from the original task and baseline. Add another scenario when a required independent observation cannot be exercised by the first. Use the project's established test configuration and fixture patterns, and reuse existing checks. Fix test setup failures within the assignment and rerun the affected check before handing back the result. Return the path, run command, covered outcomes, and result or prerequisite.

Return intermediate work directly when the next decision can use the reply. When a file is needed, write it once and pass its path and outcome. Use the selected artifact as the starting copy and generate only the changes. Keep recurring checks executable so the next role or revision can invoke them by name.
Return one result through the host's completion mechanism; contact the parent earlier only for a blocking decision. When a check is running and no independent work remains, use the host's bounded wait. Return to model judgment when a result, actionable failure, or required input becomes available.

Use the selected Design as the implementation memo. Link source requirements, record the decisions and checks needed for the next stage, and pass the memo by path. For a single-file Design, pipe the Markdown body directly to the bundled writer's `create --input-format markdown` command. For linked detail documents, use the [document-set input](../development-design/references/document-operations.md#create). Use the saved path and update affected passages by patch.

Use the review target selected in the implementation workflow. Give the judge that target and the original requirements. Resolve related findings together and carry the approved target and revision forward in the memo.

For Separate implementation and tests, close the judge's Design assignment at clearance. Verify implementation through the independent executable tests and coordinator checks. Resume the judge when the approved Design contract or its supporting evidence changes, with the affected Design passages and relevant evidence as the review target. For Combined implementation and tests, review the completed implementation where required. Apply any additional review requested by the user at its specified boundary.

Run the independent suite and the project's required checks on the integrated result. Use the handoff and successful checks as the evidence for their covered outcomes. For a coverage gap, choose the smallest existing check or direct observation that can resolve it. If lasting coverage is needed, extend the relevant suite for that gap. Reopen the test assignment when a new outcome requires independent derivation.
Proceed from that reply or report. Ask for a specific missing fact first; inspect the relevant session excerpt only if conflicting or missing evidence still prevents a decision.
