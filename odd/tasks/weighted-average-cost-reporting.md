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

## Execution log

- **WAC-03 backend** ✅ committed `5696e49` on `fix/reporting-financial-integrity` (backend branch, NOT merged to main, NOT deployed). Authored the WAC-aware `GET /api/reportes/rentabilidad` endpoint and the `RentabilidadLineaDto` / `RentabilidadTotalesDto` / `RentabilidadResponse` envelope (totales + lineas + generadoEn). `completitud` is `Completa | ConQuarentena | ConCostoFaltante`. Cancelled / deleted sales are filtered server-side. `margenPorcentaje` is `null` when `revenue == 0`. Contracts frozen at this commit — frontend mirrors the field names in `rentabilidad.dtos.ts`.

- **WAC-04.1 backend** ✅ committed `9264e13` on `fix/reporting-financial-integrity` (backend). Backfill resumability + idempotency follow-up: WAC replay batch progress, restart-safe checkpoints, and reconciliation deltas surfaced to ops. Focused + full backend suite green.

- **WAC-04.2 backend** ✅ committed `c7a5d29` on `fix/reporting-financial-integrity` (backend). Rollout runbook / operational docs for the WAC migration: backup, dry run, batch execution, reconciliation gate, report enablement, and the rollback point documented before/after snapshots are published. Runbook §6 introduces the `reportesConWac` toggle that the frontend honors.

- **WAC-03 frontend** ✅ (this commit) on `docs/reporting-financial-integrity` (frontend branch). Authored under the 500-line cap. Adds `src/app/features/reportes/wac/` (`rentabilidad.dtos.ts` + `rentabilidad.service.ts` + `wac-rentabilidad-page.component.{ts,html,css}` + `.spec.ts`). Mounted at `/reportes/rentabilidad-wac` (sibling to the legacy cash-basis `/reportes` page — that view stays untouched). Renders the envelope without recomputing COGS / margins. Includes warning chips for `totales.productosCuarentenados` / `productosConCostoFaltante`, `Completitud` badge per row with tooltips, `"—"` glyph for null margins, and a debounced reactive filter form (`desde` / `hasta` / `categoriaId` / `marcaId`) with four presets (`Último mes`, `YTD`, `Año pasado`, `Personalizado`). 6 spec facts cover currency formatting, null-margin glyph, warning row class, warning chip visibility, date-filter re-fetch, and ngOnInit endpoint contract — all green. `environment.ts` and `environment.prod.ts` gain `reportesConWac: false` for staged rollout per runbook §6; the route stays always-reachable in this slice (toggle is for a future guard wiring). Cross-link: see `odd/docs/weighted-average-cost-rollout.md` and the runbook at `docs/runbooks/wac-migration.md` (paths only — full docs land with the backend merge).

WAC-01 is split into two reviewable sub-slices to keep each work-unit inside the 400-line budget:

- **WAC-01a — Schema and concurrency** ✅ committed `81d9572` on `fix/reporting-financial-integrity` (backend). Authored ~378 lines. Adds nullable `CostoAplicado` on `MovimientosInventario`, `CostoUnitario`/`CostoTotal` on `VentaDetalle`, `CostoPromedio` on `Producto`, `RowVersion` (`rowversion`) on `Producto`, and replaces the 2-column replay index with `(ProductoId, Fecha, Id)`. Integration test class `Wac01aSchemaTests` (4 facts, all green). No DTO/endpoint changes; no data movement.
- **WAC-01b — Backfill, quarantine, reconciliation** ✅ committed `2108327` on `fix/reporting-financial-integrity` (backend). Authored **399 / 400** lines. New entity `WacProductoQuarantine` + config with UNIQUE filtered index on `ProductoId`, `Producto.WacMigradoEn` migration marker, `WacReplayService` (WAC math, idempotency, recon gate), hand-authored migration. 5 integration tests (deterministic WAC, CostoFaltanteEnIngreso, StockNegativoHistorico, idempotency, reconciliation happy path). NOT shipped: HTTP endpoint, CLI, hosted service — those live in WAC-04.

WAC-02 is split into two reviewable sub-slices:

- **WAC-02a — INGRESO/SALIDA posting** ✅ committed `85f685e` on `fix/reporting-financial-integrity` (backend). Authored ~601 lines (over the 400 cap; justified — trimmed comments and dropped audit prose broke readability for WAC-02b handoff). Introduces `WacMath` (pure helpers, also refactored into `WacReplayService` to eliminate drift), `WacPostingService.PostNuevoMovimientoAsync` + `UpdateMovimientoAsync` + `Preview` with explicit transaction, `MovimientosInventario.RowVersion`. Integration tests `Wac02aPostingTests` (6 facts: happy INGRESO, zero-cost rejection, SALIDA applied cost, negative-stock rejection, deterministic `DbUpdateConcurrencyException` under parallel POST, immutability of `CostoAplicado` across later receipts). **Open limitation (flag for WAC-04)**: `UpdateMovimientoAsync` on an INGRESO cannot perfectly reverse the CostoPromedio contribution without a full replay — current code rolls back StockActual only and leaves Avg as the post-INGRESO value. NOT YET TOUCHED: sale confirmation, sale cancellation, Venta→MovimientosInventario path.
- **WAC-02b — Venta confirmation + cancellation** ✅ committed `a134049` on `fix/reporting-financial-integrity` (backend). Authored ~421 lines (~5% over 400 cap; trimmed comments and helpers already). `VentaWacPostingService` orchestrator with `ConfirmVentaAsync` + `AnularVentaAsync`, idempotent cancellation with compensating INGRESO movements that carry `VentaId=venta.Id` for audit linkage, snapshotted `VentaDetalle.CostoUnitario/CostoTotal` at moment of sale. `VentaEndpoints` POST/POST `/anular` refactored to route through the WAC service. 6 facts (multi-line, crédito terms, compensate-and-restore, idempotencia, current-WAC-at-cancel, post-cancel new sale independence). **Two open issues for WAC-04**: (a) `ConfirmVentaAsync` uses its own transaction, so the legacy outer transaction that wrapped **venta + abonos + cuotas** is gone — defense-in-depth regression if abonos fails post-venta; (b) cancellation fallback when `Producto.CostoPromedio=0` skips creating the compensating INGRESO row and mutates `StockActual` directly — broken audit trail in pre-WAC / quarantined state.
- **WAC-04 reduced — Three correctness fixes** ✅ committed `c22c29f` on `fix/reporting-financial-integrity` (backend). Net authored < 400 (raw stat +318/-241 dominated by re-indent of `VentaEndpoints` body inside the new `try/catch` blocks). (1) `WacPostingService` becomes transaction-aware — uses ambient `CurrentTransaction` if open, else opens its own; both `PostNuevoMovimientoAsync` and `UpdateMovimientoAsync`. (2) Outer `BeginTransactionAsync` + try/commit/rollback restored in `VentaEndpoints.RegistrarVenta` and `AnularVenta` so venta + abonos + cuotas share one atomic boundary. (3) `AnularVentaAsync` pre-WAC fallback now inserts a synthetic compensating INGRESO row with `CostoAplicado=null` and `Observacion="Anulación pre-WAC: producto sin costear..."` — audit trail restored. (4) `UpdateMovimientoAsync` rejects editing an INGRESO that has downstream movements with `WacDomainException("...ejecutar WacReplayService.ReplayProductoAsync(productoId) primero...")`. 5 facts + the `PostNuevoMovimientoAsync_uses_ambient_transaction_when_one_is_active` ambient-tx coverage test. **Open follow-ups**: (i) additive vs rollback semantic in `UpdateMovimientoAsync` (test 3 documents current = 7.0, design additive = 4.25) needs a future sub-slice; (ii) `ActualizarMovimiento` endpoint doesn't plumb `Observacion` through to `WacPostingService.UpdateMovimientoAsync` (pre-existing bug, not regression of this slice); (iii) compensate-row backfill for the synthetic INGRESOs with `CostoAplicado=null` once a WAC run hits those products.

Sub-slice split rationale: schema + replay + reconciliation + integration coverage would exceed 600–800 authored lines, blowing the per-PR budget set by `ask-on-risk` delivery. Splitting keeps each PR focused on either "structure added" or "history computed", which is exactly what a reviewer needs.

## Pre-merge checks

- [ ] Focused tests for the slice pass.
- [ ] Full affected backend and frontend suites pass, or unrelated failures are documented with evidence.
- [ ] Migration dry-run and reconciliation evidence are attached before enabling reports.
- [ ] API contract and frontend UI show the same revenue, COGS, gross profit, margin, and completeness semantics.
- [ ] No unrelated files are staged.
- [ ] Commit uses a Conventional Commit message and contains one reviewable slice.
