---
name: test-harness-builder
description: "Build missing or repair unusable project test infrastructure, selecting and implementing E2E, property-based and differential tests where useful. Reuse working infrastructure for ordinary test authoring and execution."
---

# Test Harness Builder

Build a runnable verification environment with real tests, setup, fixtures and commands. Choose the strategies the project needs; each included test must give a repeatable verdict and demonstrate that it detects a violated criterion.

## Verification goal

Reuse established requirements and user decisions. When the behavior to verify, its purpose, scope or observable pass/fail criteria are unclear, use [clarify-request](../clarify-request/SKILL.md) to resolve those gaps in a brief scoped to the verification work.

Carry the brief's agreed goals, constraints and completion criteria into test selection and construction below. The brief is input to building the runnable harness.

## Survey and scope

Inspect existing tests, runners, commands and the behavior to verify. Check whether the agent can launch the target, supply inputs and observe the resulting output, errors and state. Reuse working infrastructure. When it already supports the requested verification, use ordinary test authoring or execution; this skill's work is complete without rebuilding it. With partial infrastructure, build only the missing capabilities.

Select strategies by the failures they can expose and the evidence available:

| Strategy | Useful when | Required basis |
|---|---|---|
| E2E | Failures can occur across a user flow or integrated components. | A real entry point, controlled dependencies and observable final effects. |
| Property-based | An input space is broad and a meaningful invariant can be stated. | An input domain, generators and a property derived from the contract. |
| Differential | Compatibility or equivalence with another implementation matters. | A runnable reference with an identified version and a defined comparison scope. |

Strategies may be combined. Explain which are needed, already covered, unnecessary or blocked, with reasons. A missing reference blocks differential testing; it does not create a reason to invent a second implementation.

## Criteria

Derive expected behavior from requirements and user-confirmed examples, independently of the implementation being checked. Current output is an observation until accepted as intended behavior.

Define the input or action, the tested boundary and the observable judgment for each criterion:

- E2E: the user flow and its final output or state. Lower-level tests cannot establish that the whole flow works.
- Property-based: the supported input domain and invariant, including relevant boundary cases. User agreement concerns the property and domain; generated examples exercise that contract.
- Differential: the reference version, shared inputs, compared outputs, errors and state effects, and intentional differences. Normalize only differences outside the contract. Agreement establishes compatibility within this scope; requirements still decide correctness.

Keep criteria requiring human judgment or unavailable capabilities visible as unverified coverage, with the evidence or capability needed to verify them.

## Build

Implement the selected tests against the real target using the project's stack and conventions. Deliver the dependencies, runner configuration, setup and cleanup, fixtures and assertions needed to execute them. Reuse existing commands and add missing ones; the quick run covers a useful subset and the full run executes every included test.

- E2E tests drive the selected entry point and assert the final effects. Make controlled external dependencies explicit so the result's scope is clear.
- Property-based tests use generators constrained to the stated domain and shrink failures. Use fixed seeds and bounded case counts for routine verification; preserve discovered counterexamples as reproducible regression inputs. Fresh random exploration is a separate command, outside the repeatable verification suite.
- Differential tests run the same inputs against isolated target and reference state and compare the agreed effects. Pin the reference so updating it is an explicit change to the comparison basis.

Use isolated test data and restore resources after execution. Product changes needed for observability or determinism, such as automation identifiers, an injected clock or a data directory override, require user approval unless already authorized. Report unavailable capabilities and their purpose as remaining gaps.

Failures leave evidence sufficient to reproduce and locate the violation: inputs, expected and actual effects, relevant logs or screenshots, and seeds or reference versions where applicable.

## Repeatability

Include a test only when repeated runs on unchanged code with the same inputs and supported conditions agree. Control relevant sources of variation in shared setup: time, random seeds, culture, encoding, paths, external services, application data and asynchronous completion.

If pass and fail alternate, stabilize the cause before inclusion; otherwise exclude the test from the verification commands and report the resulting coverage gap. Retrying until green or weakening assertions does not establish repeatability. Variable exploration may discover bugs, but a discovered failure becomes verification evidence through a reproducible test.

## Failure detection

For each added test, observe it fail on a known product defect or a temporary change that violates its criterion, then pass with correct behavior. A setup error does not prove detection. For a bug regression, use the unfixed behavior. Restore temporary changes and confirm the working tree matches its state before the defect.

## Criteria integrity

Preserve agreed expectations, property domains and invariants, reference versions and comparison rules. Changes to the contract require user approval; implementation changes to tests may preserve the contract. When a failure suggests the criterion itself is wrong, show the criterion, observed result and proposed change. Weakening, skipping or regenerating expected results to obtain a pass changes the contract.

## Handoff

Record test locations, setup, quick/full commands and any exploration command in the project's existing verification documentation. Add a pointer in `AGENTS.md` or `CLAUDE.md` only when authorized; a project entry points to reusable infrastructure rather than requiring this skill on every development change.

Complete when the selected automated criteria have executable tests, the full run passes repeatedly, failure detection is demonstrated and another agent can run the documented commands. Report selected and omitted strategies with reasons, test results and detection evidence, and any excluded tests or unverified criteria with their remaining gaps. Partial coverage remains explicit.
