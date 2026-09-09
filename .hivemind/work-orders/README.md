# Work orders

Each file here is one Claude Code task (D-009): `HM-WO-nnnn.md` with a YAML header
holding the `WorkOrder` record (`schemas/WorkOrder.schema.json`) and, below it, the
deterministic prompt assembled from that header. The D1 row is authoritative; files are
written by `hivemind work new` / `hivemind work pull` and read by Claude Code.

```text
Execute HiveMind Work Order HM-WO-0184.
```

Lifecycle: `draft → exported → in_progress → implemented → validation_failed |
review_required → approved → done` (`hivemind work validate` moves implemented orders to
`review_required` or `validation_failed`; approval happens in the app). Never put secrets
in a work order.
