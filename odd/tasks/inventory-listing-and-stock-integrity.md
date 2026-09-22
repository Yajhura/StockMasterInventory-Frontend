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

- [x] INV-02 — Stabilize inventory filters, pagination, and product-input validation.
  Route: delegated — frontend state/UI and backend EAV/query/validation/test changes.
  Acceptance: same-attribute values filter with OR; active query survives mutations; duplicate attributes and non-integer stocks reject; pagination is deterministic and valid.
  Checks: focused and full frontend/backend suites.
  Evidence: backend `687e788`; frontend `90fc0d0`. Backend focused tests passed (9) and full suite passed (54); frontend focused tests passed (13) and the full suite passed (60) after its unrelated CuentasCorrientes mock was corrected in `e03be16`.

- [x] INV-03 — Align product contracts and resilient inventory controls.
  Route: delegated — frontend/backend API contract, filtering, selector, and UI changes.
  Acceptance: nullable category/brand contracts align; selector can find products beyond 500; EAV values support commas; unsupported export action is removed.
  Checks: focused and full frontend/backend suites.
  Evidence: backend `1a45e43`; focused frontend (14) and backend (11) suites passed, plus full frontend (61) and backend (56) suites.

## Delivery

`ask-on-risk`; commit as one backend work unit.
