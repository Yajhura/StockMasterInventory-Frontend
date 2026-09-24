# WAC reporting feature guard

## Objective

Make `reportesConWac` control access to the WAC profitability route as well as its UI exposure.

## Scope

- Allow `/reportes/rentabilidad-wac` only when the configured feature flag is enabled.
- Redirect an authenticated user to the existing reports route when it is disabled.
- Add focused route-guard coverage for enabled and disabled states.

## Task

- [x] WAC-GUARD-01: Implement the route guard and focused tests. Route: delegated because routing and test files change together.

## Acceptance

- Setting `reportesConWac` to `false` prevents direct URL access.
- Setting it to `true` preserves the existing WAC route.
- Production build and focused tests pass.

## Next step

Completed. `wacReportesGuard` redirects disabled direct access to `/reportes` and
allows the existing WAC route when enabled.

## Evidence

- Focused tests: `npx ng test --watch=false --browsers=ChromeHeadlessNoSandbox --include='src/app/core/guards/auth.guard.spec.ts'` — passed (4 tests).
- Production build: `npm run build` — passed (existing `exceljs` CommonJS optimization warning only).
