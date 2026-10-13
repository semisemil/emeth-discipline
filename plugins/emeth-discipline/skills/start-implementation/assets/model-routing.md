# Model Routing

Use this policy for new implementation sessions. Preparation and independent Reviewers follow their own settings contracts. Explicit user model, reasoning, and usage limits take precedence; select only unspecified settings. Check support and permission to apply both settings in the execution environment. Report unsupported selections or conflicting limits instead of silently substituting them.

Default to Sol `high`; select Luna with fixed `xhigh` reasoning when the change method and scope are settled and clear tests or comparison can verify the result. Select Astra and its reasoning effort based on the complexity of the remaining judgment. The rows are selection criteria, not an empirical ranking of model/effort combinations.

| Model | Reasoning | Selection criterion |
| --- | --- | --- |
| `gpt-6-luna` | `xhigh` | The change method and scope are settled and clear tests or comparison can verify the result |
| `gpt-6.1-sol` | `high` | Default for general implementation, code review, and debugging; understanding existing code or choosing an implementation method alone does not require higher effort |
| `gpt-6-astra` | `medium` | Multiple cause hypotheses or implementation alternatives need comparison, and the choice affects behavior or contracts across multiple components |
| `gpt-6-astra` | `high` | Deep tracing of interacting hypotheses, states, or execution orders, or consequential judgment that is difficult to verify |

Judge the actual changed behavior. An existing pattern alone does not establish Luna suitability; the concrete change method must already be settled. File count, repository breadth, security-related terminology, an ordinary test failure, or failure impact alone does not select the model or effort. Difficult reasoning can justify Astra `high` even when failure impact is small. Terra and Spark are not initial routing candidates.

Record the task characteristic and reason for the selected model and effort in one sentence. Set both fields at dispatch when permitted. Continue that assignment while the evidence still supports it. During execution, consider higher effort when available evidence does not let the agent narrow the hypotheses or find a solution satisfying interacting constraints; an ordinary test failure or an incorrect first attempt alone does not justify escalation. Gather missing information before treating an information gap as reasoning difficulty. Judge a cheaper choice for the next independent task rather than switching down during execution. Keep context within 256K or the smaller actual supported limit, without context-extension settings. Use focused source context rather than copying the full conversation. Do not introduce benchmark-based success probabilities, fixed allocation ratios, or price tables.
