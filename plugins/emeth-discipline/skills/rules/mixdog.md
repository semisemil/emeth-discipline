# Mixdog

For direct skill use, read [the shared language, authority, and evidence rules](codex.md).
The Mixdog hook already includes those rules before this section.

Emeth's plugin root is `{{plugin-root}}`, the directory containing `skills/`.
When reading this file directly, resolve the root from this file's location.
Load Emeth skills by their unqualified name through `Skill`, for example `Skill({"name":"development-design"})`.
Mixdog lists `when_to_use` triggers and does not enforce Codex's `disable-model-invocation` or Claude's `user-invocable` flags; honor explicit-only boundaries in the skill instructions and triggers.

Use Mixdog's `agent` tool for independent workers with a stable tag, the current project `cwd`, and the configured workflow agent ID.
Use only fields accepted by the live tool schema; model and effort come from that agent's configured route, not unsupported spawn arguments.
If a worker needs a user decision, return the blocker to the calling session.

The plugin restores these rules on each user submission and includes them in `agent` spawn context.
Mixdog currently discards the returned context from SubagentStart and PostCompact hooks.
After an automatic or manual compaction, reload `rules` through `Skill` before continuing if the baseline is absent; the next user submission also restores it.
