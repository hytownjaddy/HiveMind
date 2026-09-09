## Why routes matter {#motivation}

Every packet consults the routing table:claim[lpm]. Press :kbd[Ctrl+K] to search.

:::callout{kind=note title="Scope"}
IPv4 only.
:::

## The model {#mental_model}

A table of prefixes, **longest** match wins.

## Rigorous explanation {#explanation}

1. Read `ip route show`.
2. Query with `ip route get`.

| prefix    | via      |
| --------- | -------- |
| 0.0.0.0/0 | 10.0.0.1 |

## Diagram {#diagram}

```ascii
host --- gw --- internet
```

## Worked example {#worked_example}

```console
$ ip route show
default via 10.0.0.1 dev eth0
```

## Common misconception {#misconception}

:::callout{kind=misconception}
The default route is not preferred because it is listed first.
:::

## Prediction {#prediction}

::question{id=predict-default}

## Guided exercise {#guided_exercise}

:::exercise{kind=guided title="Add a static route"}
Run `ip route add`.
:::

## Demonstration {#demonstration}

### Live session

Watch the table change.

## Independent problem {#independent_problem}

:::exercise{kind=independent title="Fix the gateway"}
Restore reachability.
:::

## Reflection {#reflection}

Explain what changed.

---

## Mastery evaluation {#mastery_evaluation}

Graded lab attempt.
