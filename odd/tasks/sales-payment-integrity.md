# Sales payment integrity

## Objective

Prevent the POS from submitting an incomplete cash sale and keep its credit-payment preview aligned with backend accounting.

## Scope

- Require the cash payment total to match the sale total before submission.
- Preserve initial credit payment behavior and backend-generated installment plan semantics.

## Task

- [x] SALE-PAY-02: Validate cash payment completeness and add focused POS tests. Route: delegated with backend work.

## Acceptance

- A cash sale cannot be submitted with a partial payment.
- Existing valid cash and credit flows remain usable.

## Next step

Implemented alongside backend payment-invariant changes.

## Evidence

- `npx ng test --watch=false --browsers=ChromeHeadlessNoSandbox --include="src/app/features/ventas/punto-venta/punto-venta.component.spec.ts"`: 7 passed.
- `npm run build`: passed.
- Focused coverage blocks a partial cash payment before the API call and preserves credit sales with no initial payment, an initial payment, and a fully paid initial payment.
