### Feature

The calling conversation owns the feature's design, code, integration and final verification.
Carry its source evidence and accepted decisions through the selected [implementation workflow](../../SKILL.md#implementation-workflow).

1. Complete [Ground and Sketch](../blueprint.md), reusing a reviewed Design and its still-valid evidence.
   Select the design before dependent implementation, with independent review at the selected workflow's boundary.
2. Settle blocking contracts and assign distinct paths for artifacts that can progress independently.
   Keep coupled code and integration with the current owner.
3. Implement the selected contract and run the selected workflow's independent work.
   Derive expected test results from the original requirements and affected existing behavior.
4. Integrate the artifacts and resolve material findings against those contracts.
   Trace required interactions through the public interface and verify the real built artifact, including the task's required checks.
   Reuse unaffected verification and rerun checks affected by corrections.
5. Keep the Design consistent with delivered behavior and complete the requested repository delivery.
   Use [challenge](../challenge.md) before shipping when the design remains contested.

Report the delivered change, material decisions, verification evidence and unresolved limits.
