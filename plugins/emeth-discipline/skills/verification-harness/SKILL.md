---
name: verification-harness
description: "Set up or repair a project's user-approved environment for agent-run verification; extend it for features, behavior changes or bug fixes when project instructions name verification-harness."
---

# Verification Harness

The harness is the project's standing verification environment: acceptance tests that encode user-confirmed criteria and judge them end to end. The tests are the record of the criteria. A harness earns trust because the user owns the criteria and every automated test has been seen to go red.

## Project entry

The project's agent instruction file, `AGENTS.md` or `CLAUDE.md` as the project uses, holds this entry in that file's language:

```markdown
## verification-harness
- Acceptance tests: `<path>`
- Quick run: `<command>`
- Full run: `<command>`
```

Write or change the entry after the user approves its wording and file. An existing entry means the harness exists: follow [Extend](#extend).

## Extend

Reuse the existing acceptance tests, setup and commands, and handle only the change:

| Change | Criteria | Red proof |
|---|---|---|
| New feature | Add and confirm criteria for the new behavior. | New tests |
| Behavior change | Change the affected confirmed criteria under [Lock](#lock). | Changed tests |
| Bug fix | Add and confirm the criterion the bug violates. | The unfixed code is the defect: the test goes red before the fix and passes after it. |
| Refactoring | No change. | None |

Survey again only for an entry point or state the harness cannot reach yet. Every change ends with a passing full run.

## Survey

When building the harness, before proposing criteria, establish what the agent can do without the user: build and launch the product, drive each user entry point (CLI command, application window, public API), and read the resulting state (output, exit code, files, UI Automation tree, logs, data stores). Reuse existing tests that already judge a user-visible outcome.

Report each missing capability as a needed seam with its purpose.

Propose the acceptance test location from the project's stack and conventions, such as a separate test project or a test folder, and use the location the user confirms.

## Criteria

Draft criteria from the user's goals and the product's user-visible behavior. Confirm each with the user as a concrete example: the input or action at an entry point and the expected observable result. Derive expected results from the user's statements, requirements or worked examples; record current output only as an observation the user accepts or rejects.

Each criterion becomes one acceptance test whose input and assertions are the confirmed example. Assign each criterion a grade and encode it with the test runner's own mechanisms:

| Grade | Judgment | Test form |
|---|---|---|
| automatic | The test alone decides pass or fail. | Ordinary test |
| assisted | The test records evidence such as screenshots or output; the agent gives a first judgment and the user confirms. | Test tagged `assisted` that saves its evidence |
| manual | The user judges. | Skipped test whose skip reason gives the reproduction steps |

Present criteria in small batches with the proposed grade. A criterion is confirmed only on the user's confirmation.

## Build

- Judge each automatic and assisted criterion end to end through its user entry point. Lower-level tests may speed up diagnosis; they are not evidence for a criterion.
- Product changes for observability or determinism, such as automation identifiers, a data directory override, an injected clock, stubbed external services or a test mode, are proposals. Apply each after the user approves it.
- Accept a test only when repeated runs on unchanged code agree. Control time, culture, console encoding, paths, external services and application data location in shared test setup.
- On failure, a test leaves evidence that locates the cause: expected and actual values, logs, screenshots.
- Tag a quick subset to run after each change; the full run executes every acceptance test.

## Red proof

A test is proven only after it goes red. For each automatic and assisted test, introduce a defect that violates its criterion, observe the test fail for that reason, restore the code, and observe it pass. Confirm the working tree matches its state before the defect.

## Lock

Tests in the acceptance location are the confirmed criteria. They and their expected outputs, including golden files and snapshots, change only with user approval. When a test fails, fix the product. When the criterion itself looks wrong, show the user the criterion, the observed result and the proposed change, then wait. Weakening, skipping or regenerating a test to make it pass is a criterion change.

## Complete

Complete when every confirmed criterion is an acceptance test, automatic and assisted tests pass in the full run and are proven red, manual criteria are skipped tests with reproduction steps, and the project entry is current. Report each criterion with its grade, result and red-proof defect, the assisted evidence awaiting confirmation, criteria left unverified with their missing seams, and seams awaiting approval.
