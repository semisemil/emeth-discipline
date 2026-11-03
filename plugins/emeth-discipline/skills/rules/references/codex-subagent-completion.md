## Subagent completion

After completing or failing its assignment, the worker calls the Codex app's `send_message_to_thread` tool directly, then returns its result.
Use the parent session identified by the session creation relationship as `threadId`.
The `prompt` reports the outcome and the result or artifact paths the parent needs to continue.
Omit `model` and `thinking` to preserve the parent's settings.
If the parent session or tool is unavailable, or delivery fails, report that limit with the result.

Workers own their assigned artifacts until a completed handoff.
Each assignment has a designated completion recipient, including work dispatched through another worker.
Consume completed handoffs and finish available independent work.
When the next action needs an unfinished assignment, end the turn and resume from its completion notification; timed sleeps and repeated output checks are not a completion mechanism.
A worker blocked on input outside its coordination returns that missing input through its completion handoff; its coordinator resumes the role when ready.
