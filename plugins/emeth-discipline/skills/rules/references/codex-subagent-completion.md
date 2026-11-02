## Subagent completion

Use the completion helper to resume the parent after delegated work, instead of `wait_agent`.
Each dispatch or follow-up is a new assignment, including corrections owned by the same worker.
Capture the receiving parent's session UUID from `CODEX_THREAD_ID` and run `node "<plugin-root>/lib/subagent-completion.js" allocate --parent <parent-session-uuid> --task <assignment-label>`.
Pass the returned parent UUID and completion ID with that assignment.
Use the allocated ID for its notification and acknowledgment.
After completing or failing its assignment, the worker runs `node "<plugin-root>/lib/subagent-completion.js" notify --parent <parent-session-uuid> --task <completion-id> --message "<completion report>"`, then returns its result.
If notify returns `native-followup-required`, call the native `followup_task` tool with the returned `target` and `message` to resume the subagent parent.
The report identifies the outcome and the result or artifact paths needed to continue.
When the parent processes that completion through the built-in result or a queued message, it runs `node "<plugin-root>/lib/subagent-completion.js" ack --parent <parent-session-uuid> --task <completion-id>` before ending its turn.
The helper cancels that assignment's pending wake-up and preserves other queued messages.
Use the host's permission flow when the helper needs access to session state.

Workers own their assigned artifacts until a completed handoff.
Each assignment has a designated completion recipient, including work dispatched through another worker.
Consume completed handoffs and finish available independent work.
When the next action needs an unfinished assignment, end the turn and resume from its completion notification; timed sleeps and repeated output checks are not a completion mechanism.
A worker blocked on input outside its coordination returns that missing input through its completion handoff; its coordinator resumes the role when ready.
