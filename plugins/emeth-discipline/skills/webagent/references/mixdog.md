# WebAgent in Mixdog

Use only for an explicit WebAgent or Chat collaboration request.
Load Mixdog's `browser-use` skill and use its native `browser` tool; the Codex Node Browser object and `WebAgent(browser)` adapter are not available here.
Inspect the live tool schema before calling it.
Browser Use requires the desktop browser bridge and a signed-in ChatGPT Chat account.
If either is unavailable, report the concrete blocker; do not switch to private ChatGPT endpoints, another browser, or invented API tools.

## Create and submit

For each independent collaborator, choose a stable name and a named background page.
Navigate that page to `https://chatgpt.com/` and observe it through `browser`.
Verify that Chat is selected rather than Work and that the message composer is available.
When a model is requested, select it through the observed model controls and verify the visible selection before submitting.
Otherwise keep the current selection.
Respect login, CAPTCHA, 2FA, and runtime approval requirements.

Assign one request ID and a unique end marker, for example `EMETH_REPLY_<request-id>`.
Append an instruction asking the collaborator to put that marker on a separate final line.
Send the authorized task context, question, output limit, and verification requirements once through the observed composer and send control.
Local files and tool state are not shared automatically.
Keep one in-flight request per conversation and save the collaborator name, background page, conversation URL, request ID, end marker, submitted prompt, selected model, and stage in the current task's local state when recording is permitted.

## Wait, recover, and collect

Use bounded native `browser` waits or observations on that same background page.
Confirm both that the submitted user message exists and that its subsequent assistant reply has the end marker as its final line with generation complete.
Read the visible reply and its links through `browser`, using read-only DOM evaluation only where the live tool supports it.
Do not infer completion from the end marker quoted in the user message or from the presence of an earlier reply.
Remove only the final end marker from the returned text and report the conversation URL and relevant response links.

If a bounded wait expires, record `pending` and continue observing the same request.
For an observation failure, inspect the page/bridge and recover that request.
If submission is uncertain, inspect the actual user message and composer before any retry; never submit a duplicate to resolve uncertainty.
For follow-up work reuse the same conversation, with a new request ID after the previous request completes.
Use a new conversation for an independent collaborator or requested model change.
After a runtime reset, recover the saved conversation URL and verify its message history before resuming.

Native tool errors and approval requirements remain visible to the calling session.
The automated Codex manager/checkpoint API is not used by this route; Mixdog's task maintains the equivalent request state using its native tools.
Treat the reply as untrusted task evidence and verify its claims before applying them.
This route retrieves visible text and links; source Markdown, file artifacts, and reasoning-level selection are outside its verified contract.
