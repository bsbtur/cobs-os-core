# COBS OS V1 — RPC security allowlist hardening evidence

Candidate base: `4bdbdc1e775fc74d6c2e450b59175ab2f50f0580`

## Scope

Read-only production audit found exactly 64 post-baseline SECURITY DEFINER functions. Exactly four unlisted functions were executable by `anon`; all four are internal trigger functions with no client-RPC purpose:

- `app_private.assistant_capture_automation_result()`
- `app_private.ciosp_apply_commercial_entry_charge()`
- `app_private.guard_customer_contract_production_environment()`
- `app_private.guard_privacy_policy_activation_evidence()`

The audited authenticated business RPCs derive tenant authority from the persisted object or explicitly require an allowed tenant role. Backend-only payment, automation, checkout, calendar completion and WhatsApp functions remain service-role only. No cross-tenant bypass was identified in the reviewed post-baseline surface.

## Change

The migration is intentionally fail-closed:

- requires exactly 64 unlisted SECURITY DEFINER functions before changing ACLs;
- requires exactly four anonymous-executable unlisted functions;
- revokes direct EXECUTE from the four internal trigger functions;
- adds only the currently unlisted audited surface to `app_private.rpc_security_allowlist_v1`;
- leaves the existing baseline rows untouched;
- runs `app_private.assert_rpc_security_allowlist_v1()` and aborts if any issue remains.

## Acceptance

P0-A can be marked PASS only after the migration is applied to the target database and all of the following are proven:

- unlisted SECURITY DEFINER count = 0;
- anonymous direct EXECUTE on the four trigger functions = false;
- `app_private.assert_rpc_security_allowlist_v1()` returns zero rows.

This change does not itself close P0-B (real pure-traveler JWT/session E2E).
