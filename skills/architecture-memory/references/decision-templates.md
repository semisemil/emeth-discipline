# Architecture memory decision templates

Create an ADR for a significant explicit choice whose rationale will affect later decisions. Put the active effect in its current context section and keep the ADR as historical evidence. Use [record format](record-format.md) for routing; mark an established choice `confirmed/historical` or a proposal `proposed/planned`.

## `decisions/ADR-<number>-<slug>.md`

~~~markdown
# ADR-<number>: <Decision title>

- <Status>: proposed | accepted | deprecated | superseded
- <Decision date>: YYYY-MM-DD | unknown
- <Supersedes>: none | ADR-<number>
- <Superseded by>: none | ADR-<number>
- <Current document>: <Relative link showing the current effect>

## <Decision record>

### <Context>

<Conditions and constraints at the time.>

### <Decision>

<Direction chosen at the time.>

### <Consequences>

- <Positive or negative consequence>

### <Alternatives>

- <Alternative actually considered and why it was not selected>

### <Evidence>

- <User confirmation or repository-relative path and symbol>
~~~

In one write, create the ADR, add `[ADR-<number>](ADR-<number>-<slug>.md)` to `decisions/README.md`, add a relative link from the affected current C4 or Context item to its rationale, and register it as `decision`.

An accepted ADR's Context, Decision, Consequences, Alternatives, and Evidence are immutable history. Only Status, Supersedes, Superseded by, Current document, and clear typographical errors may change. A new direction gets a new ADR pointing `Supersedes` to the old ADR; the old ADR points `Superseded by` to the new one.

Keep the choice, conditions, consequences, and evidence within one retrievable level-2 section (use level-3 headings for its parts), or declare required `links` between their stable section IDs.
