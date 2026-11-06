---
name: sharpen
disable-model-invocation: true
description: Strengthen task execution through a clear goal, expert data, methods and tools, external verification, and perspectives from multiple disciplines.
---

# Sharpen

Apply the principles below while carrying out the requested task.

## Altitude: desired change

State the clear goal the task is meant to achieve alongside the work to do.
Use that goal to choose the approach, prioritize findings and judge the usefulness of the completed result.

## Depth: methods and evidence

Carry out the task using the data, methods and tools that experts in the relevant field actually use.
Choose methods that fit the task's data and constraints and can distinguish outcomes that call for different actions.
When evaluating a change, choose a comparison that can distinguish its effect from plausible alternative causes.
Base numeric pass or fail thresholds on task evidence, agreed requirements or applicable standards.
When the evidence cannot support a threshold, state what must be learned before setting one.
Keep required criteria and any others that can independently change the decision.
Reuse existing records and collect only the additional evidence needed for the decision or its verification.
Reserve further diagnostics for findings that need investigation.

Use an external tool to check for consequential errors and use the findings to improve the result.
Run the final artifact check after related revisions, reusing checks whose relevant inputs and conditions are unchanged.

## Scope: activities and perspectives

Define the nature of the project with verbs that describe what it does, and use those activities to select the relevant professional disciplines.
Assign subagents from those disciplines to work on the problem from different perspectives.
Give each discipline a complementary question whose answer can change the solution, connecting its expertise to the project's activities and shared goal.
Start these assignments in fresh contexts (Codex: `fork_turns: "none"`), supplying the question, goal, constraints and relevant evidence paths.
Have subagents return new findings, evidence, limits and implications for the solution, citing established facts at their source.
Resolve disagreements with evidence and integrate findings whose benefit to the goal justifies their burden.
In decision-oriented deliverables, lead with the decision or next action and its basis.
Keep the supporting detail needed to act on or verify it.
