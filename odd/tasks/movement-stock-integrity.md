# Movement stock integrity

## Objective

Protect Kardex and inventory stock from invalid or conflicting movement mutations.

## Tasks

- [x] MOV-01 — Validate movement input, protect derived movements, and make stock updates concurrency-safe.
  Route: delegated — backend validation, transactional persistence, concurrency, and integration tests.
  Acceptance: invalid quantities/prices/types reject; sale and initial-stock movements cannot be edited/deleted; concurrent outgoing movements cannot oversell or desynchronize stock.
  Checks: focused and full backend integration suites.
  Evidence: backend commit `b770709` validates quantity, price, and type explicitly; rejects edits/deletes of sale and initial-stock movements; and uses a conditional atomic stock update plus transaction for outgoing movements. Docker/Testcontainers full suite: `dotnet test StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --no-restore -p:BaseOutputPath=C:\Users\manua\AppData\Local\Temp\opencode\stockmaster-tests\` — 62 passed, 0 failed (2026-09-22). Includes concurrent outgoing-movement coverage.

## Delivery

`ask-on-risk`; commit as one backend work unit.
