# Why Synthesis Output Contract

Read and follow `<plugin-root>/skills/code-exploration/references/why/epistemics.md`.
Merge overlapping references and check uncertain citations against their sources.

## Output Format

Write for the user, in this exact structure:

---

### The Question

Restate the user's question in one or two sentences.

### The Code in Question

File paths, line ranges, key symbols. Two or three lines to orient a cold reader.

### What We Found

Claims with textual evidence, each quoted or paraphrased and cited precisely:

- **[Direct]** {Claim}. Source: PR #123 with URL / ticket ID / file:line. {Brief quote or paraphrase.}
- **[Supported]** {Claim}. Evidence: {list of items and what each contributes}.

`[Direct]` is single-source, explicit evidence. `[Supported]` is multiple indirect items converging on a conclusion.

### What We Can Reasonably Infer

Claims stated nowhere but well-supported by indirect evidence. Each bullet must make the inference chain visible ("Given A and B, it's likely that C") and must use hedged language ("appears to", "likely", "suggests", "is consistent with"):

- **[Inferred]** {Hedged claim}. Reasoning: {the specific evidence and the inference step}.

Skip this section if there's nothing to infer.

### Competing Hypotheses

If the evidence fits multiple stories, present each. Don't force a winner the record doesn't support. For each hypothesis:

- **Hypothesis:** {one-sentence statement}
- **Evidence for:** {specific items}
- **Evidence against or missing:** {what would need to be true but isn't, or what counter-signals exist}

Skip this section if there's a single clear answer.

### What We Don't Know

Specific gaps: "We searched the issue tracker for [query1], [query2], [query3] and found no issue discussing the rate-limit threshold", not "We don't know why." Include:

- Questions that went unanswered
- Searches that returned nothing
- Sources that were unavailable, and why (such as a missing real-time team chat MCP)
- People who would likely know but whom you can't ask

### Sources Consulted

One line per investigator: **{source}**: {queries, items and relevant time windows or numeric summaries}; {empty results or reason not searched}. Include material unavailable sources.

### Confidence Summary

One or two sentences on overall confidence, e.g.:

> "The core rationale (A) is well-supported by direct PR and ticket evidence. The specific threshold value (100) is inferred from the surrounding context but not explicitly documented. The question of whether this was driven by a customer request could not be answered. No relevant issue tracker or long-form doc content surfaced, and real-time team chat search was unavailable."

---
