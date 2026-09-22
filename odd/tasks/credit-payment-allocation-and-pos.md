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

- [x] CPA-02 — Add persistent payment-to-installment allocation and installment paid/pending amounts in the backend, including migration and tests.
  Route: delegated — multiple non-trivial backend domain, endpoint, persistence, migration, and test files.
  Acceptance: a S/400 three-installment sale accepts payments S/150, S/200, and S/50 with FIFO partial allocation and no overpayment.
  Checks: focused backend tests.
  Evidence: implemented in backend commit `662789600b8c4567cabf1b1fe4fa1f4a224f9e9b`. It introduces `AbonosCuotas`, decimal `MontoPagado`/`MontoPendiente`, FIFO allocation for initial and subsequent payments, DTO fields, and a real integration scenario covering S/150 + S/200 + S/50, partial allocations, final `Pagado`, and overpayment rejection. `dotnet build StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --no-restore` passed (23 pre-existing/package warnings). After Docker Desktop was started, `dotnet test StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --no-build --filter "FullyQualifiedName~VentaCreditoTests"` passed (2/2). `dotnet ef migrations script --idempotent` generated and was inspected for the allocation table and paid/pending migration SQL. Follow-up correction: `TestDataBuilder.NewVentaAsync` now initializes direct-seeded cuotas with `MontoPagado = 0m` and `MontoPendiente = montoCuota`, matching production.

- [x] CPA-03 — Make payment and sale cancellation reverse all affected allocations, installments, balances, and payment state; add regression tests.
  Route: delegated — multiple non-trivial backend files with financial correctness risk.
  Acceptance: cancelling an allocation-spanning payment restores every affected installment and makes the payment eligible only for its prior active lifecycle rules.
  Checks: focused backend cancellation tests.
  Evidence: implemented in backend commit `ba981f7b98372d31be693f0e17833b9ef7fe4eea`. Cancellation now reverses every persisted allocation in the same transaction, restores each affected installment's paid/pending amount, status and payment date, restores the bounded sale balance/payment state, and soft-deletes the payment as `Anulado`. Real SQL Server integration tests cover a payment spanning complete and partial installments, an allocated initial payment, duplicate cancellation, and the sale-cancellation rule requiring active payments to be cancelled first. `dotnet test StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --filter "FullyQualifiedName~AbonoCancellationTests"` passed (3/3); the related cancellation/credit suite passed (7/7). The candidate-caused KPI failure was corrected in `TestDataBuilder.NewVentaAsync`: direct-seeded cuotas now initialize `MontoPagado = 0m` and `MontoPendiente = montoCuota`, matching production. With Docker available, `dotnet test StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --filter "FullyQualifiedName~KpisCobranzaTests.Kpis_returns_deudaTotal_clientesConDeuda_deudaVencida_cuotasVencenProximas"` passed (1/1), and `dotnet test StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --no-build` passed (42/42).

- [x] CPA-04 — Reconcile frontend payment/sale cancellation API contracts and refresh relevant screens after a successful cancellation; add focused tests.
  Route: delegated — multiple non-trivial frontend files and depends on CPA-03.
  Acceptance: frontend uses the finalized backend cancellation contract and reflects recalculated sale/debt state.
  Checks: focused frontend tests.
  Evidence: added `POST /api/ventas/{ventaId}/abonos/{abonoId}/anular` and `POST /api/ventas/{ventaId}/anular` service contracts, payment and sale cancellation confirmations, backend-error feedback, and successful cancellation refreshes for current accounts, collection KPIs, and payment history. Focused API/component tests passed (8 specs); `npm test` passed (51 specs); `npm run build` passed. The production build retained the pre-existing ExcelJS CommonJS optimization warning.

- [x] CPA-05 — Display partial installment allocations and reject invalid credit frequencies.
  Route: delegated — backend lifecycle/validation and multiple frontend contract/UI/test files.
  Acceptance: a S/10 initial payment on two S/7.50 installments shows the second as Parcial with S/2.50 paid and S/5.00 pending; invalid frequencies are rejected rather than treated as monthly.
  Checks: focused backend/frontend tests plus applicable full suites.
  Evidence: backend commit `c968844` normalizes only the four supported frequencies (missing remains Mensual), rejects invalid values in preview and credit-sale creation, assigns Cuota `Parcial` whenever paid and pending amounts are both positive (including reversals), and includes partial balances in collection KPIs. Docker-backed SQL Server integration tests passed (15 focused, 45 full) using an isolated build output because the local API executable was locked by an existing process. Frontend `Cuota` now carries paid/pending values and the installment schedule renders both plus the Parcial state. Focused frontend tests passed (9 specs); `npm test` passed (52 specs); `npm run build` passed with the pre-existing ExcelJS CommonJS warning.

- [x] CPA-06 — Add FIFO payment shortcuts to the accounts-receivable payment modal.
  Route: delegated — modal state, template, models, and focused tests.
  Acceptance: credit sales offer cuota vigente, consecutive installment advance, total balance, and free amount; the summary names affected installments before submission.
  Checks: focused frontend tests and full suite.
  Evidence: the modal loads installment detail when needed and offers cuota vigente, consecutive FIFO advance, total balance, and another amount. It calculates the amount for shortcut selections and shows affected installments in FIFO order before submission, with no installment-selection path that could skip a pending quota. Focused component tests passed (7 specs); `npm test` passed (55 specs); `npm run build` passed with the pre-existing ExcelJS CommonJS optimization warning.

- [x] CPA-07 — Harden sale creation, initial-payment controls, and debt filters before PR.
  Route: delegated — cross-repository validation, UI, API, and test changes.
  Acceptance: no stale initial payment; consistent financed-credit limit; server rejects invalid quantities/prices/stock/payments/payment methods; debt state filter works.
  Checks: focused and full frontend/backend suites.
  Evidence: the POS resets initial-payment amount, method, and frequency when it closes; it exposes the active payment-method selector only when an initial payment exists and uses that choice in the request. Credit-limit feedback now consistently names the financed balance. Current accounts exposes Pending/Partial state filtering and forwards it to `/deudas`. The backend filters debts by `estadoPago`, evaluates credit limits against `saldo` after the initial payment, rejects zero/negative quantities, zero/negative prices, zero/negative/over-total payments, aggregate insufficient stock, and nonexistent/inactive payment methods; subsequent payment registration also validates an active method. Focused frontend tests passed (19 specs); `npm test` passed (59 specs); `npm run build` passed with the pre-existing ExcelJS CommonJS optimization warning. Backend CPA-07 integration coverage passed (5/5), and the full isolated backend suite passed (46/46). The normal backend test build remains blocked by a pre-existing running `StockMaster.Api` process locking `bin/Debug/net10.0/StockMaster.Api.exe`; the isolated output build passed with the existing 23 warnings.

- [x] CPA-08 — Remove credit limit and harden client lifecycle.
  Route: delegated — cross-repository contract, schema, validation, UI, and test changes.
  Acceptance: no credit-limit field/rule remains; inactive/missing clients cannot be used in sales; clients with sales cannot be deleted.
  Checks: focused and full frontend/backend suites.
  Evidence: removed `limiteCredito` from client forms, models, POS feedback, and sale blocking in the frontend; focused POS tests passed (5 specs), `npm test` passed (59 specs), and `npm run build` passed with the pre-existing ExcelJS CommonJS optimization warning. Backend commit `96d02a3` removes the entity/DTO/configuration/rule, adds `20260921223000_RemoveClienteCreditLimit`, validates missing or soft-deleted customers before cash and credit sales, and rejects client deletion when any sale exists. Focused backend integration tests passed (7/7) and the full isolated backend suite passed (48/48); it used an isolated output because the running API locks the normal Debug binaries.

## Delivery strategy

`ask-on-risk`. Keep frontend and backend commits as separate work units because they are independent Git repositories.

## Progress

CPA-01 through CPA-08 are completed and verified.
