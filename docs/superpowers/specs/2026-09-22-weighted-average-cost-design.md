# Weighted-Average Cost Profitability Design

## Decision

Profitability will use a perpetual weighted-average cost (WAC) per product. Every incoming movement updates the product's moving average; every sale records the average in force at the time of sale as its immutable cost of goods sold (COGS). Reports derive gross profit from those recorded COGS values, never from a product's current average cost.

This design makes historical profitability reproducible after later purchases, price changes, or stock corrections.

## Scope

The implementation spans backend inventory and sales persistence, a one-time historical backfill, reporting contracts, and the existing Reports UI. It does not change tax treatment, revenue recognition, payment allocation, or inventory valuation methods other than replacing absent/legacy sale-cost derivation with WAC.

## Approved decisions

| Area | Decision |
| --- | --- |
| Costing model | Use perpetual moving WAC, calculated independently for each product. |
| Incoming stock | Recalculate WAC when stock is received or a positive stock correction is posted. |
| Outgoing stock | A sale or other outgoing movement uses the WAC effective immediately before that movement; it does not change the average of remaining stock. |
| Sale COGS | Persist the unit cost and total COGS on each sale detail when the sale is confirmed. These values are the reporting source of truth. |
| Cancellations | Cancel a sale through a compensating inventory/cost event that restores quantity and reverses the original sale's recorded COGS. Do not price a cancellation using the current WAC. |
| Corrections | Preserve the movement ledger. Changes that affect historical quantity or acquisition cost must be represented as controlled corrections and trigger a deterministic replay from the affected point. |
| Ordering | Replay and backfill use a stable chronological order: effective timestamp, then immutable movement identifier as the tie-breaker. |
| Zero stock | When a product reaches zero quantity, its active WAC is cleared. The next positive receipt establishes WAC from that receipt's unit cost. |
| Precision | Store monetary and cost values as fixed-point decimals; calculate using sufficient internal precision and round only at defined persistence/report boundaries. |
| Reports | Gross profit = recognized sales revenue - recorded COGS. Margin percentage is `grossProfit / revenue * 100`; render `N/A` when revenue is zero. |

## Cost state and ledger

Maintain a cost state for each product alongside the movement ledger:

| Field | Purpose |
| --- | --- |
| Product ID | Identifies the independently costed product. |
| On-hand quantity | Quantity after the latest accepted cost event. |
| Average unit cost | Current WAC used by the next outgoing event. |
| Last processed event | Stable replay cursor for observability and idempotency. |
| Version/concurrency token | Prevents concurrent postings from calculating against stale state. |

Each movement must retain its effective timestamp, immutable identity, quantity delta, acquisition unit cost when applicable, and applied unit cost. Sale details additionally retain their COGS unit cost and line total. A reversal references the original event/detail it compensates.

For an incoming quantity `qIn` at unit cost `cIn`, with existing quantity `qOnHand` and average `cAvg`:

```
newAverage = ((qOnHand * cAvg) + (qIn * cIn)) / (qOnHand + qIn)
```

For an outgoing quantity, record `cAvg` as the applied cost and reduce only quantity. Reject an outgoing event that would make on-hand quantity negative.

## Posting flow

1. Validate the business event, quantity, monetary inputs, and product state.
2. Lock or compare-and-swap the product cost state in the same transaction that persists the movement or sale.
3. Apply the event in stable order, persist its applied cost/COGS snapshot, and update the state atomically.
4. For a historical correction, rebuild the affected product's cost events from the earliest changed event and atomically replace the derived state and snapshots.
5. Publish report data only from confirmed, non-cancelled sales and their persisted COGS snapshots.

## Backfill and migration

Backfill is a deliberate, resumable migration rather than a request-time calculation.

1. Add nullable cost-state and applied-cost/COGS fields, indexes for product replay order, and a migration marker/version.
2. Validate historical movement data before writing derived values. Quarantine products with missing acquisition cost, invalid chronology, or negative historical stock rather than silently inventing profitability.
3. Replay each valid product's ledger in stable order and persist state plus sale COGS snapshots in bounded batches.
4. Reconcile per-product ending quantity and valuation against the existing inventory ledger; reconcile aggregate COGS against the new sale-detail snapshots.
5. Mark the migration complete only after reconciliation. Expose unresolved products as unavailable in profitability reports until corrected and replayed.

The migration must be idempotent, restartable, observable, and safe to execute without serving partially backfilled profitability as final data.

## Reporting and UI contract

Reporting returns product/category profitability for a requested date range, including revenue, COGS, gross profit, margin percentage, sale count, and a data-completeness indicator. The backend applies date and lifecycle filters; the UI does not recalculate costs.

The Reports UI keeps its product/category views and adds clear labels for Revenue, COGS, Gross Profit, and Margin. It shows an explicit unavailable/partial-data state for dates or products that were not successfully backfilled. Cancelled sales and their compensating events do not contribute revenue or COGS to active-sales profitability.

## Constraints and safeguards

- Do not derive historical sale COGS from the current product cost.
- Do not use binary floating-point values for monetary arithmetic.
- Do not silently include invalid historical inventory in reported margins.
- Do not permit a correction or cancellation to leave derived quantity, WAC, or COGS snapshots inconsistent.
- Keep cost calculation and persistence server-side; frontend contracts only display returned report values.
- Treat the cost ledger and product cost state as one transactional boundary.
- Preserve existing audit history; reversals and corrections must be traceable to their source events.

## Verification strategy

- Unit-test WAC arithmetic, precision, zero-stock reset, and margin calculation.
- Integration-test incoming movements, sales, cancellations, corrections, concurrency, and rejected negative stock.
- Migration-test valid replay, idempotent restart, reconciliation, and quarantined invalid histories.
- Contract-test report filtering, lifecycle exclusion, completeness states, and pagination/sorting where applicable.
- Frontend-test formatting, loading/error/partial states, and product/category views against server-provided profitability values.

## Implementation slices

The implementation order is captured in `odd/tasks/weighted-average-cost-reporting.md`: schema/backfill first, movement-sale-cancellation posting second, reports/UI third, then tests and migration rollout.
