# Reporting and Kardex integrity

## Objective

Render reporting errors and incomplete financial data honestly, and generate complete Kardex exports with the existing Excel frontend capability.

## Tasks

- [x] REPORT-03: Fetch all filtered Kardex pages and invoke the existing Excel generator. Evidence: `4738e54`; full Karma suite passed.
- [x] REPORT-05: Render report request errors and unavailable values explicitly. Evidence: `20053a8`; full Karma suite passed.
- [x] REPORT-06: Register the WAC quarantine route and consume relational customer history. Evidence: `4738e54`, `20053a8`; full Karma suite passed.
- [x] REPORT-07: Align the sale-level customer-history DTO and modal template. Evidence: focused Karma regression and full Karma suite passed.
- [x] REPORT-08: Preserve legacy textual TopClientes, persist audit inserts after final primary keys, and merge audit-event and legacy history. Evidence: `ReportingFinancialIntegrityTests` focused regression and full Docker-backed backend suite passed.

## Acceptance

- No report error is represented as a real zero.
- Kardex export never silently truncates.
- WAC recovery navigation resolves to a real route.
