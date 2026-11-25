# Verification

Distinguish running existing checks, adding tests and verifying a real artifact from the requested result.
Use the project's existing commands, fixtures and control tools.
Derive expected results from the requirements and existing public behavior, independently of the implementation being checked.

For test authoring, add tests through the project's existing test interfaces and conventions.
Keep test execution, test authoring and product fixes within the requested scope; route requested product fixes through the [implementation workflow](../SKILL.md#implementation).

Check the real target and resulting effects through the relevant public path.
Report the checks performed, their results and material coverage limits, including checks that could not run.
Retain the requested proof artifacts.

## Project harness

When the project's instructions name an existing harness, reuse its setup and commands, preserve agreed criteria, and include the required full run result in the report. Use [test-harness-builder](../../test-harness-builder/SKILL.md) when missing or unusable infrastructure prevents the requested verification.
