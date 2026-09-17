# Architecture memory component templates

Use [record format](record-format.md) for section routing and state labels.

## `components/README.md`

~~~markdown
# <Components>

| <Container> | <Document> | <Why L3 is needed> |
|---|---|---|
| <Container> | [<Component document>](<container-slug>.md) | <Why L3 is needed> |
~~~

## `components/<container-slug>.md`

~~~markdown
# <Container name> <components>

## <Scope>

- <Container>: `CNT-<number>`
- <Why L3 is needed>: <Responsibility or risk boundary not explained at L2>

## <Components>

| ID | <Component> | <Responsibility> |
|---|---|---|

## <Relationships>

| <From> | <To> | <Interaction> |
|---|---|---|

## <Diagram>

```mermaid
<Optional C4 L3 relationships from the tables>
```

## <Open questions>

- <Question> — `unknown/current` — <Evidence needed>
~~~

First L3: create `components/README.md`, add its architecture `README.md` row, and register the index as `component-index` and the L3 document as `component` in the same write. Later L3: update the index and register the document as `component` in the same write.
