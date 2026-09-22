# Movement stock integrity

## Objective

Protect Kardex and inventory stock from invalid or conflicting movement mutations.

## Tasks

- [x] MOV-01 — Validate movement input, protect derived movements, and make stock updates concurrency-safe.
  Route: delegated — backend validation, transactional persistence, concurrency, and integration tests.
  Acceptance: invalid quantities/prices/types reject; sale and initial-stock movements cannot be edited/deleted; concurrent outgoing movements cannot oversell or desynchronize stock.
  Checks: focused and full backend integration suites.
  Evidence: backend commit `b770709` validates quantity, price, and type explicitly; rejects edits/deletes of sale and initial-stock movements; and uses a conditional atomic stock update plus transaction for outgoing movements. Docker/Testcontainers full suite: `dotnet test StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --no-restore -p:BaseOutputPath=C:\Users\manua\AppData\Local\Temp\opencode\stockmaster-tests\` — 62 passed, 0 failed (2026-09-22). Includes concurrent outgoing-movement coverage.

- [x] MOV-02 — Align movement UI contracts and refresh derived inventory state.
  Route: delegated — frontend state, modal contract, validation, and focused tests.
  Acceptance: edit/delete refresh product and KPIs; client field is absent; PUT payload is complete and integer-safe.
  Checks: focused and full frontend suites.
  Evidence: edit/delete now reload full products, selector, and paginated listing before incrementing `productosRev`, which refreshes loaded KPIs. The edit modal removes Client Associated, uses an exact PUT payload, and rejects fractional quantities. Focused: `npx ng test --watch=false --browsers=ChromeHeadlessNoSandbox --include=src/app/core/state/productos.state.spec.ts` — 14 passed (2026-09-22). Production build: `npm run build` — passed (2026-09-22). Full suite: `npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox` — 53 passed, 8 failed due to the pre-existing CuentasCorrientes test double missing `ApiVentasService.listarMetodosPago`, unrelated to MOV-02.

- [x] MOV-03 — Permit safe initial-stock corrections while retaining sale-derived protections.
  Route: delegated — backend movement lifecycle and regression tests.
  Acceptance: initial-stock movements can be edited only when resulting stock remains nonnegative; movements tied to sales remain immutable; initial movement deletion remains blocked.
  Checks: focused and full backend suites.
  Evidence: backend commit `fe9b862` permits PUT of `EsStockInicial` movements, recalculates stock, and rejects a negative result; `VentaId` movements remain immutable, and DELETE remains blocked for both sale and initial-stock movements. Docker/Testcontainers focused suite: `dotnet test StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --no-restore --filter "FullyQualifiedName~MovimientoStockIntegrityTests" -p:BaseOutputPath=C:\Users\manua\AppData\Local\Temp\opencode\stockmaster-tests\` — 7 passed, 0 failed (2026-09-22). Full suite: `dotnet test StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --no-restore -p:BaseOutputPath=C:\Users\manua\AppData\Local\Temp\opencode\stockmaster-tests\` — 63 passed, 0 failed (2026-09-22).

## Delivery

`ask-on-risk`; commit as one frontend work unit.
