# Inventory listing and stock integrity

## Objective

Correct critical inventory listing and stock consistency defects before further inventory work.

## Scope

- Ensure the trash view contains only soft-deleted products.
- Prevent negative stock caused by editing initial stock.
- Persist product creation, initial stock, and Kardex movement atomically.
- Add focused backend integration tests.

## Tasks

- [x] INV-01 — Fix trash filtering, initial-stock edit validation, and atomic product creation.
  Route: delegated — backend endpoint, transaction, stock invariants, and tests span multiple non-trivial files.
  Acceptance: trash excludes active products; initial stock edits cannot make current stock negative; failed initial-movement persistence leaves no partial product/stock state.
  Checks: focused and full backend test suites.
  Evidence: backend commit `f57436d`; focused and full Docker-backed integration suites passed.

## Delivery

`ask-on-risk`; commit as one backend work unit.
