# Architecture memory base templates

Use [authoring commands](recording.md) for scaffolding and section edits. These templates describe content; document registration, headings and routing metadata are supplied by the writer.

## `README.md`

~~~markdown
# <Architecture>

<One paragraph describing the system and this document set.>

<Brief legend explaining explicit confidence/lifecycle and attributed evidence; missing state is not confirmation.>

## <Document map>

| <Document> | <Contents> |
|---|---|
| [<System context>](01-system-context.md) | <Purpose, boundary, external relationships> |
| [<Containers>](02-containers.md) | <Runtime and storage units> |
| [<Components>](components/README.md) | <Selected component boundaries; include only when L3 documents exist> |
| [<Architecture context>](04-context.md) | <Domain meanings, operating conditions, business background and premises> |
| [<Decision records>](decisions/README.md) | <Historical architecture decisions> |

## <Find relevant context>

<Use the system context for orientation; for a concrete task search its topic or code path and read the selected sections. Follow related ADRs when the rationale matters.>

## <Unknown areas>

<Point to Open questions sections; do not duplicate them.>
~~~

## `01-system-context.md`

~~~markdown
# <System context>

## <Purpose and boundary>

<Problem, value, included scope, excluded scope.>

## <People>

| ID | <Person or role> | <Need> |
|---|---|---|

## <System of interest>

| ID | <System> | <Responsibility> |
|---|---|---|

## <External systems>

| ID | <System> | <Relationship> |
|---|---|---|

## <Relationships>

| <From> | <To> | <Interaction> |
|---|---|---|

## <Diagram>

```mermaid
<C4 L1 relationships from the tables>
```

## <Open questions>

- <Question> — `unknown/current` — <Evidence needed>
~~~

## `02-containers.md`

~~~markdown
# <Containers>

## <Containers>

| ID | <Container> | <Responsibility> | <Runtime or technology> | <Data> |
|---|---|---|---|---|

## <Relationships>

| <From> | <To> | <Interface or data flow> |
|---|---|---|

## <Diagram>

```mermaid
<C4 L2 relationships from the tables>
```

## <Open questions>

- <Question> — `unknown/current` — <Evidence needed>
~~~

## `04-context.md`

~~~markdown
# <Architecture context>

<Meaning and premises needed to interpret the system that code alone does not establish. Link authoritative decisions and Designs for choices and detailed contracts.>

## <Goals>

- <Goal that directly affects architecture>

## <Constraints>

- <Condition that limits architecture choices>

## <Operating environment>

<Actual users, physical setting, devices, connectivity, and operating procedures that affect design.>

## <Quality criteria>

- <Performance, security, reliability, operability, or another decision criterion>

## <Domain meanings and relationships>

| <Term or relationship> | <Business meaning and distinction> |
|---|---|

## <Business background and premises>

- <Business meaning or operating premise needed to understand a rule, with its scope and source>
- <Link to the authoritative ADR or Design when a premise results from an explicit choice>

## <Assumptions>

- <Unverified domain or operating premise> — `inferred/current` — <Evidence or confirmation needed>

## <Risks>

| <Risk> | <Impact> | <Response> |
|---|---|---|

## <Open questions>

| <Question> | <Evidence needed> |
|---|---|
| <Question> — `unknown/current` | <Evidence needed> |

## <Related decisions and Designs>

- <Relative link to the authoritative ADR or Design>
~~~

## `decisions/README.md`

~~~markdown
# <Architecture decisions>

| ADR | <Decision> | <Status> | <Current document> |
|---|---|---|---|
~~~
