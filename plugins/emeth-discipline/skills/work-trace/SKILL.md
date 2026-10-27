---
name: work-trace
description: Show a graph of observed exploration, verification and conclusions when the user requests a work trace for a task.
---

# Work Trace

Show how the requested task's findings and verification support its result.
The trace applies to the task the user asked to visualize, including its follow-up turns until completion or the user's request to stop tracing.

## Build the trace

Use the conversation, inspected sources, actions and observed results already available for that task.
Summarize the goal, decisive observations, actions, verification and conclusions that actually occurred.
Keep hypotheses and unresolved questions distinguishable from established findings.

Connect events in execution order and label evidence relationships where they explain a conclusion.
Preserve branches, failed attempts and retries that affected the result; merge routine steps that add no explanatory value.
Use the actual course of the work rather than forcing every task through a fixed sequence of node types.
Put supporting detail and source references in nodes so the graph remains easy to follow.

Build from public findings and concise decision summaries; session-log mining or extra investigation solely to reconstruct a trace is outside this workflow.
Verification nodes state the checks actually run, their results and material limits.

## Show and update

Present the first trace immediately before the final response using [graph presentation](../../references/graph-presentation.md).
On later turns, update it at that point only when new findings, consequential actions or branches, verification results, or changed conclusions materially change the trace.
Use the last trace already in context to judge the change; an unchanged trace needs no graph read or publish call and no repeated Mermaid output.
Reuse the same graph across those turns and preserve the identity of retained events.
For user-requested live updates, apply the same meaningful-change condition during the work.

Complete when the graph explains the observed path to the current result, including consequential branches and unresolved verification.
