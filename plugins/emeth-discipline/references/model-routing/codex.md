# Codex model settings

| Role | Default settings |
|---|---|
| Ensemble candidates and cross-judge, including blueprint exploration | `gpt-6.1-sol`, medium by default; high for a specific unresolved interaction |
| Challenge reviewers | `gpt-6.1-sol`, reasoning effort suited to the review |
| Implementation delegates | Use the implementation selection criteria below |
| Explorers, explainers, investigators and synthesizers | Inherit the parent model |

If a default model is unavailable or not permitted, inherit the parent model.
If a default reasoning effort is unsupported by the selected model, use that model's default effort.
Set the selected model and reasoning effort explicitly when supported.

## Implementation delegates

Prefer Sol `high` for general implementation.
Prefer Luna `xhigh` when the change method and scope are settled and clear tests or comparison can verify the result.
Select Astra and its reasoning effort based on the complexity of the remaining judgment.
These defaults are selection criteria, not an empirical ranking of model/effort combinations.

| Preferred model | Reasoning | Selection criterion |
| --- | --- | --- |
| `gpt-6-luna` | `xhigh` | The change method and scope are settled and clear tests or comparison can verify the result |
| `gpt-6.1-sol` | `high` | Default for general implementation, code review, and debugging; understanding existing code or choosing an implementation method alone does not require higher effort |
| `gpt-6-astra` | `medium` | Multiple cause hypotheses or implementation alternatives need comparison, and the choice affects behavior or contracts across multiple components |
| `gpt-6-astra` | `high` | Deep tracing of interacting hypotheses, states, or execution orders, or consequential judgment that is difficult to verify |

Judge the actual changed behavior.
An existing pattern alone does not establish Luna suitability; the concrete change method must already be settled.
File count, repository breadth, security-related terminology, an ordinary test failure, or failure impact alone does not select the model or effort.
Difficult reasoning can justify Astra `high` even when failure impact is small.
Terra and Spark are not initial routing candidates.

Record the task characteristic and reason for the selected model and effort in one sentence.
Continue that assignment while the evidence still supports it.
During execution, consider higher effort when available evidence does not let the agent narrow the hypotheses or find a solution satisfying interacting constraints; an ordinary test failure or an incorrect first attempt alone does not justify escalation.
Gather missing information before treating an information gap as reasoning difficulty.
Judge a cheaper choice for the next independent task rather than switching down during execution.
Keep context within 256K or the smaller actual supported limit, without context-extension settings.
Use focused source context rather than copying the full conversation.
Do not introduce benchmark-based success probabilities, fixed allocation ratios, or price tables.
