# Production build configuration

## Objective

Restore the configured Angular production build by supplying its required environment replacement.

## Task

- [x] BUILD-CONFIG-01: Add the production environment configuration and verify `npm run build`. Route: delegated.

## Acceptance

- The replacement path declared in angular.json exists.
- Production build succeeds without changing feature behavior unexpectedly.

## Evidence

- `src/environments/environment.prod.ts` is now versioned and provides the
  replacement declared by `angular.json`. It uses only the public API base URL;
  no credential or secret is embedded.
- `reportesConWac` is `true`, matching `environment.ts` so the released WAC
  profitability route remains available in the production build.
- Focused guard tests: `npm test -- --include='src/app/core/guards/auth.guard.spec.ts'`
  — 4 passed.
- Production build: `npm run build` — succeeded. The existing `exceljs`
  CommonJS optimization warning remains.
