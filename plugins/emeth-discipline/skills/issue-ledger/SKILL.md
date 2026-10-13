---
name: issue-ledger
description: Record and update concrete bugs, tasks, features, research, documentation, and maintenance in a project-local ledger. Use when the user asks to register or update project work, or when durable out-of-scope work should be preserved.
---

# Issue Ledger

## Record

Record durable work with an origin, current state, next action, or completion criterion. An explicit user request and current context are sufficient origin; do not investigate solely to register it. A reported bug remains `reported` until direct evidence confirms or refutes it. Reject vague guesses, preferences, temporary notes, and immediately completed work without future value when registration was not requested.

Store one v2 JSON file per issue under `.emeth/issues/`. Before checking whether storage exists, run `node <skill-dir>/../../lib/storage-migration.js <project-root>` to migrate legacy `.proofline/` storage. If `.emeth/` is still absent after successful migration, copy `assets/state-starter/`.

Resolve bundled paths relative to this SKILL.md. Run the CLI from the project root as `node <skill-dir>/scripts/issue-ledger.js ...` so its default root is the project's `.emeth/issues`. Avoid only obvious title duplicates. Create from `assets/templates/issue-claim.json` for `bug | research` or `issue-objective.json` for other types. Replace every `REPLACE:` value and adapt the ID, type, mode, risk, arrays, and timestamps, then use the CLI `create` command. Infer available fields, but ask when identity or scope cannot be stated accurately. Cite the ID in the final report.

The CLI initializes dashboard storage and registers the project as needed after a successful `create`, `update`, or changed `link-work` write. It does not register after reads, validation, `no-op`, or failed writes. Accept registration `registered` or `no-op` as complete. Report the registration result separately; registration failure does not change or roll back the completed Issue write. For a registration failure reporting `EPERM` or `EACCES`, follow [dashboard sandbox recovery](../dashboard-server/references/sandbox-setup.md). After an approved direct repair write, run `node <plugin-root>/dashboard/register-project.js register --project-root <absolute-project-root>` under the same result-separation rule.

## Read

Read an issue with `node <skill-dir>/scripts/issue-ledger.js show ID` for the default AI brief before opening its file. Use `list` when the target issue needs to be found. The brief contains current state, claims or objective, criteria, milestones, current decisions, and relations; it omits observations and old transitions. Request only the needed proof with `show ID --evidence E1,E2` or audit history with `show ID --events`.

## Keep current

An issue is a current-state record, not a session log or experiment report. Keep `state.current_summary` current. Require `next_action` for `open | doing | blocked`; require `blocker` and `unblock_condition` for `blocked`; forbid them for `resolved | cancelled | superseded`. A resolved summary states cause or goal, change, and result.

For Design or legacy document linkage and progress handoff, apply `references/work-link.md`.

Keep only decisions and state transitions in `events`. Do not log wording, formatting, routine commands, or every work session. Replace the mutable current summary; Git preserves prose history. A meaningful status, next-action, blocker, milestone, decision, or completion change must rewrite or explicitly reconfirm `current_summary`.

Use normal CLI operations for updates. Before an update or repair, read `references/v2-schema.md` for the operation contract and run the CLI validator. Direct issue-file edits are only for reviewed repair.

## Prove

`evidence` is an immutable observation that directly confirms or refutes a P-claim, supports a decision, or proves a C-criterion. Related files, future commands, implementation explanation, and full logs are not evidence; put them in `context`, `next_action`, or `artifacts`. Store each evidence item once and reference its E-ID from P/C/D. Do not leave orphan evidence. Add a new item with `supersedes` or `invalidates` instead of rewriting old evidence.

Set `resolved` only when every completion criterion references current valid evidence. Use `cancelled` for intentionally stopped work and `superseded` with a replacement relation when another issue takes over.

## Boundaries

Use `mode: simple` for one independently verifiable result. Use `mode: composite` with 3–7 outcome milestones for coordination work; keep implementation and experiment detail in child issues or artifacts. Split rather than append when the title no longer describes the work, completion criteria materially change, an independent deliverable appears, or another goal replaces the original. Store one directional relation: `child_of`, `superseded_by`, or `follow_up_to`.
