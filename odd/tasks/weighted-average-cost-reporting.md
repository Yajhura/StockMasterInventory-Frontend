# Weighted-average cost reporting

## Objective

Deliver reproducible product and category profitability using perpetual weighted-average cost (WAC). Every confirmed sale must retain the cost in effect when it was posted, so later purchases, corrections, or price changes cannot rewrite historical gross profit.

## Approved decisions

- Cost each product independently with perpetual moving WAC.
- Recalculate WAC only for incoming stock: receipt or positive stock correction.
- Apply the current WAC to each outgoing movement; an outgoing movement reduces quantity but does not change the remaining average.
- Persist the applied unit cost and total COGS on every confirmed sale detail. Report from those snapshots, not from the current product average.
- Cancel a sale with a compensating event that references and reverses the original sale's recorded COGS; never use current WAC for the reversal.
- Retain an append-only, traceable ledger. Historical corrections trigger deterministic replay from the earliest affected event, ordered by effective timestamp and immutable identifier.
- Clear active WAC at zero stock; the next positive receipt establishes WAC from its own unit cost.
- Use fixed-point decimals for costs, revenue, COGS, and margins. Round only at persistence/report boundaries.
- Calculate gross profit as revenue minus recorded COGS. Render margin as `N/A` when revenue is zero.
- Keep calculation and persistence server-side. The frontend displays report values and data-completeness states returned by the API.

## Constraints

- Preserve audit history and link reversals/corrections to their original events.
- Keep product cost state and the event that changes it in one transaction with concurrency protection.
- Reject any outgoing event that produces negative stock.
- Never infer historical sale COGS from the current product cost.
- Do not silently report margins for invalid historical data; quarantine incomplete or inconsistent products until corrected and replayed.
- Run backfill out of band, in resumable and idempotent batches. Do not expose partially backfilled data as final profitability.
- Preserve unrelated working-tree changes. This task document is planning-only until an implementation slice is explicitly started.

## Actionable slices

### WAC-01 — Schema and historical backfill

**Route:** backend inventory/sales persistence and migration.

**Work:**

- Add per-product cost state: on-hand quantity, active average unit cost, last processed event, and a concurrency token.
- Add applied movement cost plus sale-detail COGS unit and total snapshots; index product replay order.
- Add migration version/marker and a quarantined-history record with reason and source event.
- Build a resumable, idempotent replay that orders events by effective timestamp then immutable identifier.
- Reconcile replayed ending quantity/valuation and aggregate COGS before marking a product migrated.

**Acceptance:** Valid historical products have deterministic WAC and sale COGS snapshots; invalid histories are visible as quarantined, never silently costed; restarting the backfill does not duplicate or alter already reconciled results.

**Checks:** Migration-specific integration tests; replay/reconciliation fixture tests; dry-run count and reconciliation report against a production-shaped backup.

### WAC-02 — Movement, sale, and cancellation posting

**Route:** backend movement and POS transaction flows.

**Work:**

- Post incoming movements with `((onHand * average) + (incomingQuantity * incomingCost)) / newOnHand`.
- Post outgoing movements using the pre-event WAC as the applied cost and reject negative stock.
- Confirm sales, persist immutable sale-detail COGS snapshots, and update inventory/cost state atomically.
- Implement sale cancellation as a compensating event that restores quantity and reverses the original sale's recorded COGS.
- Represent historical corrections as controlled ledger events and replay affected products atomically.

**Acceptance:** Concurrent postings cannot use stale cost state; later receipts cannot change a confirmed sale's COGS; cancellation reverses the original snapshot; all changes remain auditable and stock never becomes negative.

**Checks:** Focused unit tests for arithmetic/precision/zero stock; integration tests for receipt, sale, cancellation, correction, rollback, and concurrent posting; full backend suite.

### WAC-03 — Profitability reports and UI

**Route:** backend reporting contract and frontend Reports feature.

**Work:**

- Return product/category revenue, COGS, gross profit, margin percentage, sale count, and data-completeness status for a date range.
- Exclude cancelled/deleted lifecycle states server-side according to the existing reporting integrity rules.
- Preserve existing Reports product/category navigation and render Revenue, COGS, Gross Profit, and Margin from API values.
- Render unavailable/partial data explicitly for quarantined or not-yet-migrated products; do not calculate fallback costs in the UI.

**Acceptance:** A report is reproducible after later stock receipts; cancelled sales contribute neither active revenue nor COGS; zero-revenue rows show `N/A` margin; incomplete history is visible to the user.

**Checks:** Backend contract/integration tests for filters and lifecycle handling; frontend component tests for loading, error, complete, and partial-data states; production build and full frontend suite.

### WAC-04 — Tests and migration rollout

**Route:** backend/frontend test suites and operational migration runbook.

**Work:**

- Add golden fixtures that cover multi-receipt averages, fractional costs, zero-stock reset, sales, cancellation, correction replay, and invalid history quarantine.
- Add migration observability: batch progress, replay failures, reconciliation deltas, and final completeness counts.
- Write the rollout/rollback runbook: backup, dry run, batch execution, reconciliation gate, report enablement, and safe rollback before/after snapshots are published.
- Execute migration in a controlled environment and record reconciliation evidence before enabling profitability reporting.

**Acceptance:** Focused and full suites pass; migration can be resumed safely; reconciliation has no unexplained valid-product variance; rollout has a documented stop and rollback point.

**Checks:** Focused backend and frontend suites; full backend and frontend suites; migration dry run; reconciliation sign-off; post-rollout report smoke test.

## Cross-slice acceptance

- [ ] WAC is deterministic for the same ordered ledger and uses decimal arithmetic.
- [ ] Every confirmed sale line has immutable COGS captured at posting time.
- [ ] A later receipt, correction, or price change cannot rewrite already confirmed sale COGS without an explicit controlled replay.
- [ ] A cancellation restores quantity and reverses the original sale snapshot rather than applying current WAC.
- [ ] Reports use persisted COGS, respect sale lifecycle filtering, and disclose incomplete historical data.
- [ ] Backfill is idempotent, resumable, reconciled, and does not silently cost invalid history.
- [ ] Frontend displays API-supplied values only and preserves existing report navigation.
- [ ] Audit history links every correction/reversal to its source event.

## Delivery

`ask-on-risk`; each WAC slice is an independently reviewable work unit. Do not combine schema/backfill, posting semantics, reporting/UI, and rollout evidence in one commit unless the reviewed line budget and validation evidence support it.

## Pre-merge checks

- [ ] Focused tests for the slice pass.
- [ ] Full affected backend and frontend suites pass, or unrelated failures are documented with evidence.
- [ ] Migration dry-run and reconciliation evidence are attached before enabling reports.
- [ ] API contract and frontend UI show the same revenue, COGS, gross profit, margin, and completeness semantics.
- [ ] No unrelated files are staged.
- [ ] Commit uses a Conventional Commit message and contains one reviewable slice.
