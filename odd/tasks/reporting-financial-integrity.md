# Reporting financial integrity

## Objective

Ensure report aggregates represent active sales and real customer attribution.

## Tasks

- [x] REP-01 — Correct top-customer attribution and exclude cancelled/deleted movement effects from reports.
  Route: delegated — backend reporting SQL, contracts, and integration tests.
  Acceptance: POS sales appear in top customers; cancelled sales and soft-deleted movements do not affect financial/stock aggregates; audit trace remains intact.
  Checks: focused and full backend suites.
  Evidence: backend commit `58153d6` (`fix(reports): preserve financial aggregate integrity`); `dotnet build StockMaster.Api.Tests/StockMaster.Api.Tests.csproj --no-restore` passed. Focused and full Testcontainers suites are blocked locally because the Docker Desktop Linux daemon is unavailable.

## Delivery

`ask-on-risk`; commit as one backend work unit.
