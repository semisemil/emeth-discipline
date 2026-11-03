---
name: figure-it-out
when_to_use: "Explicit request only: coordinate the workflows needed to complete the requested outcome."
disable-model-invocation: true
description: Complete the requested investigation, design, verification, implementation, or measurement through the appropriate Emeth workflows and project tools.
---

Choose the workflow from the user's requested outcome and scope.
Read only the workflows needed for that outcome, and combine them when the request spans several outcomes.
The calling conversation coordinates the work and completes the requested deliverable.

| Requested outcome | Workflow and completion |
| --- | --- |
| Investigation or explanation | Use tools suited to the sources; use [code-exploration](../code-exploration/SKILL.md) for code behavior, rationale or teaching. Return evidence-based findings and material unknowns. |
| Architecture design with the user | Use [architecture-coop](../architecture-coop/SKILL.md) to develop the structure and agreed decisions. |
| Design documents | Use [development-design](../development-design/SKILL.md) to deliver the requested Design work. |
| Review | Use [tenet-me](../tenet-me/SKILL.md) to assess the requested design or implementation and return material findings. |
| Test execution, test authoring or behavior verification | Use [references/verification.md](references/verification.md) to deliver the requested checks or tests and their results. |
| Benchmark or measurement | Use [references/measurement.md](references/measurement.md) to report the measured result, conditions and limits. |
| Implementation, bug fix or refactoring | Use the [implementation workflow](#implementation) to deliver the verified change. |

For other outcomes, use the relevant available skill or project procedure and verify the requested artifact.
Carry source evidence, accepted decisions and review findings into dependent work.
Reuse completed work while its sources, artifact versions and conditions remain valid.

## Implementation

Select the [../start-implementation/SKILL.md: Implementation workflow](../start-implementation/SKILL.md#implementation-workflow) before design exploration for an implementation request.
Run these skills in order, starting at the first incomplete stage:

1. [development-design](../development-design/SKILL.md): prepare or revise the Design until it is `ready`.
2. [tenet-me](../tenet-me/SKILL.md): review the Design and return material findings to development-design for revision; after a revision, review only the outcomes it affects. This stage is complete when the current revision has no material finding. A `ready` Design still needs it unless this conversation already reviewed its current revision.
3. [start-implementation](../start-implementation/SKILL.md): implement the reviewed Design through its pstack playbook, unless the user limited the work to an earlier stage.

Match the grounding, synthesized sketch and review findings to the implementation playbook's steps.
