# Assistant Reservation Context V1

## Goal
Expose only canonical reservation facts for the authenticated traveler to the existing Assistant Router.

## Canonical source
`commercial_reservations` joined to `orders` and `order_items`, constrained by tenant, operation, active participant grant, and `beneficiary_person_id`.

## Security boundary
- Revalidates `assistant_has_operation_access` server-side.
- Resolves `person_id` from the active participant grant; the browser cannot supply it as trusted reservation context.
- Returns only current `confirmed` or `reserved` reservations from non-cancelled orders.
- Does not expose internal IDs, payment facts, hotel facts, or prices.
- Existing Assistant Router and callback contracts remain unchanged.

## Production backend validation
The pure-traveler QA profile resolves a canonical reservation with `status=confirmed`, `order_status=confirmed`, `quantity=1`, and package `Caravana Completa CIOSP 2027`.

## Remaining release gate
Run the authenticated traveler E2E question `Minha reserva para a viagem está confirmada?` and confirm the persisted assistant reply uses the canonical reservation without inventing payment, hotel, or schedule details.
