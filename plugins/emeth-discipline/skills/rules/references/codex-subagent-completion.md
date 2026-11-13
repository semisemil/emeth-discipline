# Collect results from a separate Codex chat

The worker returns the result, artifact paths, or blocker in its final response.
Retain the ready `threadId` and `hostId` from `create_thread` and continue independent work while the assignment runs.
When the result is needed, call `wait_threads` with those IDs and carry its latest cursor into the next bounded wait if the chat is still running.
Use the assigned turn's final response from the wait.
If that response is missing or insufficient, call `read_thread` for the assigned turn.
If the chat needs user input or approval, surface that need and continue available independent work.
If the chat fails or its result is unavailable, report the affected chat and the blocker.

Use `send_message_to_thread` for a separate notification only with explicit user authorization to message the destination chat.
Omit `model` and `thinking` for that notification to preserve the destination's settings.
