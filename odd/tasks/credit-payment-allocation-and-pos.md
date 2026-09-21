# Credit payment allocation and POS validation

## Objective

Allow credit sales with optional initial payments, allocate every payment across installments in due-date order, and make cancellation safe and auditable.

## Problem

The POS rejects credit sales because it validates a placeholder cash payment of zero. The backend cannot represent partial installment payments or reliably reverse one payment that covered multiple installments.

## Authorized scope

- Frontend repository: POS credit validation, plan preview, frequency display, HTTP contracts, and focused tests.
- Backend repository: installment allocation persistence, FIFO allocation, payment cancellation reversal, and focused tests.
- Do not add bonuses, interest, penalties, customer credit, or a cancellation UI until the allocation model is safe.

## Constraints

- Credit financing has no extra charge, interest, or penalty.
- An initial payment is optional and reduces the financed balance.
- Payments apply FIFO by installment due date and can fully or partially cover multiple installments.
- An overpayment beyond the sale balance remains rejected.
- Installment due dates stay unchanged when payments are made early.
- Use decimal currency values and keep the final installment as the rounding remainder.

## TDD

Mode: unknown. Source and test runner will be verified by the delegated implementer before changes.

## Tasks

- [x] CPA-01 — Fix POS credit validation, financed-balance preview, frequency propagation/display, and focused component/service tests.
  Route: delegated — preparation and implementation span multiple non-trivial frontend files.
  Acceptance: a S/100 credit sale with S/10 initial payment and three daily installments can be submitted; preview uses S/90 and selected frequency; credit limit evaluates the financed balance.
  Checks: focused frontend tests and build/type check if available.
  Evidence: `npm test -- --include="src/app/core/api/api-ventas.service.spec.ts" --include="src/app/features/ventas/punto-venta/punto-venta.component.spec.ts"` passed (6 specs); `npm test` passed (46 specs); `npm run build` passed. The production build retained the pre-existing ExcelJS CommonJS optimization warning.

- [ ] CPA-02 — Add persistent payment-to-installment allocation and installment paid/pending amounts in the backend, including migration and tests.
  Route: delegated — multiple non-trivial backend domain, endpoint, persistence, migration, and test files.
  Acceptance: a S/400 three-installment sale accepts payments S/150, S/200, and S/50 with FIFO partial allocation and no overpayment.
  Checks: focused backend tests.
  Evidence: implemented in backend commit `662789600b8c4567cabf1b1fe4fa1f4a224f9e9b`. It introduces `AbonosCuotas`, decimal `MontoPagado`/`MontoPendiente`, FIFO allocation for initial and subsequent payments, DTO fields, and a real integration scenario covering S/150 + S/200 + S/50, partial allocations, final `Pagado`, and overpayment rejection. `dotnet build StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --no-restore` passed (23 pre-existing/package warnings). The focused integration test and broader `dotnet test` were executed but blocked because Docker/Testcontainers is unavailable (`Docker is either not running or misconfigured`); 11 existing non-container tests passed and 56 container-dependent tests failed during fixture startup. `dotnet ef migrations script --idempotent` generated and was inspected for the allocation table and paid/pending migration SQL. CPA-02 remains unchecked until the SQL Server container suite can run.

- [ ] CPA-03 — Make payment and sale cancellation reverse all affected allocations, installments, balances, and payment state; add regression tests.
  Route: delegated — multiple non-trivial backend files with financial correctness risk.
  Acceptance: cancelling an allocation-spanning payment restores every affected installment and makes the payment eligible only for its prior active lifecycle rules.
  Checks: focused backend cancellation tests.
  Evidence: pending.

- [ ] CPA-04 — Reconcile frontend payment/sale cancellation API contracts and refresh relevant screens after a successful cancellation; add focused tests.
  Route: delegated — multiple non-trivial frontend files and depends on CPA-03.
  Acceptance: frontend uses the finalized backend cancellation contract and reflects recalculated sale/debt state.
  Checks: focused frontend tests.
  Evidence: pending.

## Delivery strategy

`ask-on-risk`. Keep frontend and backend commits as separate work units because they are independent Git repositories.

## Progress

CPA-01 completed and verified. CPA-02 implemented; its integration verification is blocked by unavailable Docker/Testcontainers. Next: rerun CPA-02 with Docker, then CPA-03.
