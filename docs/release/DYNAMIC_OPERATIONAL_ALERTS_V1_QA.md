# Dynamic Operational Alerts V1 — QA

Production validation on 2026-09-01.

- Migration `dynamic_operational_alerts_v1` applied to production.
- Auth hardening migration `dynamic_operational_alerts_auth_hardening_v1` applied to production.
- Supported contracts: `time_changed`, `location_changed`, `delay`.
- Operator-authenticated transactional QA resolved 4 operation recipients, 1 in-app eligible recipient and created 1 in-app delivery.
- Same idempotency key replay returned the same message and kept message_count=1/distinct_keys=1.
- Pure traveler caller was rejected with `Not authorized to publish operational alerts`.
- Null-auth caller was rejected with `Authentication required`.
- All controlled QA publication calls ran inside transactions that were rolled back; zero `qa-%` dynamic alert messages persisted.
- No new n8n workflow, Assistant Router, Mercado Pago or WhatsApp changes.

Note: PR #95 was merged before the auth-hardening commit was added to its former head branch. The hardening must be merged separately so repository state matches production.