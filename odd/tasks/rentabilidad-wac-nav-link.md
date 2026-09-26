# Rentabilidad WAC nav link

## Objective

Expose `/reportes/rentabilidad-wac` from the Reports view so the WAC breakdown modal is discoverable.

## Scope

- Add a visible link on the Reportes view routing to the WAC page.
- Honor the existing `wacReportesGuard` feature flag.
- Add focused coverage for the new active state.

## Task

- [x] RENT-NAV-01: Add link, active state, and tests. Route: delegated.

## Acceptance

- Link is reachable from `/reportes` and routes to `/reportes/rentabilidad-wac`.
- Guard still redirects when `reportesConWac=false`.
- Focused/full frontend tests and production build pass.
