# Reporting

## Content

| Item | Content |
|---|---|
| ID and title | A stable ID the user can cite in chat, and what was checked where |
| Kind and result | Defect, slop: excess, or slop: mismatch; Confirmed, Needs user, or Unverified |
| Evidence | The contract or convention, the code or execution observed, and the cost to the reader |
| Fix | The existing path to reuse, or what to remove |
| Coverage | What was executed, what was not checked, and conditions that limit the result |
| Question | The missing fact and the result for each answer |

Group locations that share one cause and contract into one finding.
Put Confirmed, Needs user, and Unverified in separate sections, ordered: summary and scope, confirmed findings, questions, detailed evidence.
Omit rejected candidates, except those the user named.

The report is one offline HTML file. Chat keeps the main results, the open questions, and the report link, and takes answers and fix requests.

## Location

Use the first location that applies:

1. A location the user named, or the project's report location.
2. A project-local output directory that version control ignores.
3. A host output location that persists.

Give each run its own folder containing `report.html`. Leave ignore rules unchanged.
If only a temporary location exists, deliver the results in chat first, state the retention limit, and ask for a persistent location.

Record the target project, the paths checked, the time, and, under version control, the HEAD and relevant uncommitted changes.
When another session reuses a report, verify the target still matches, and re-check findings whose code changed.

## Updates and retention

Keep the original evidence and code conditions of each finding.
When an answer or a re-check changes a result, add the current result and its reason beside the original.
When fixes follow, add the outcome and the verification actually run.
Create a new folder for a new audit, and link only the findings that carry over.

Keep the report after the work completes. When you clean up this audit's temporary files, keep the files the report links to.
