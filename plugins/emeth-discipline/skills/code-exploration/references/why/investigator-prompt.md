# Investigator Prompt Template

Fill in the placeholders. Append the one category playbook `sources/<source>.md` for this investigator's evidence category (index: `<plugin-root>/skills/code-exploration/references/why/source-playbook.md`). If the target code looks defensive (null checks, retry logic, timeout handling, rate limiting, feature flags, egress guards, OOM handlers), also append `<plugin-root>/skills/code-exploration/references/why/sources/incident-postmortem.md` so the investigator runs incident-flavored queries inside its own source.

---

You are investigating the historical context and motivation behind a piece of code. Investigate your assigned source only and return evidence for the calling conversation to synthesize. Follow links within that source; record cross-source leads under Additional Leads.

Read and follow `<plugin-root>/skills/code-exploration/references/why/epistemics.md`.

## The Question

> {QUESTION}

## The Code Anchor

**Target files:** {FILES_WITH_LINE_RANGES}

**Key symbols:** {SYMBOLS}

**Initial commits touching this code (most recent first):**
{COMMIT_LIST}

**PR numbers extracted from commit messages:** {PR_NUMBERS}

**Ticket IDs mentioned in commits or PR bodies (if any):** {TICKET_IDS}

## Your Assigned Source

{SOURCE_NAME}

{SOURCE_PLAYBOOK_SECTION}

## Output Format

Return your findings in this structure. The calling conversation uses it for synthesis.

### Source
Which source you investigated (source control, issue / ticket tracker, long-form documents, real-time team chat, infrastructure observability, error / exception tracking, product analytics warehouse, code comments, etc.).

### What I Searched
The queries you ran, items you opened, and places you looked. Be specific. This shows how thorough the search was and what is still unsearched.

### Direct Evidence Found
For each item that explicitly addresses the question:
- **What it says**: verbatim quote or accurate paraphrase
- **Where it's from**: PR #123, ticket ID, doc URL, chat permalink, commit hash, or file:line
- **Author and date** (if available)
- **Relevance**: one sentence on how it bears on the question

### Indirect / Circumstantial Evidence
For each item that bears on the question without answering it:
- **What it is**: brief description
- **Where it's from**: location
- **What it suggests**: what a careful reader might infer, and the inference chain
- **Alternative readings**: if the same evidence could support a different interpretation, note it

### Contradictions
Items that disagree with each other, with both citations.

### Gaps
What you searched for and didn't find, specifically: "Searched the issue tracker for [query] across [time range]. No matching issues."

### Additional Leads
Anything that suggests further investigation in a different source, for its investigator or a follow-up pass. For example, a chat thread that a PR mentions.

For the completion handoff, use `<plugin-root>/references/delegated-work.md`. Keep every artifact and finding required above; the handoff points to the complete output.
