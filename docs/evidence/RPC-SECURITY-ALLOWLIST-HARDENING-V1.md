# COBS OS V1 — RPC security allowlist hardening evidence

Audit base: `4bdbdc1e775fc74d6c2e450b59175ab2f50f0580`. PR branch was recreated from current `main` after three application-only commits advanced the branch; those commits do not alter the audited database SECURITY DEFINER surface.

Read-only PROD audit found exactly 64 post-baseline SECURITY DEFINER functions and exactly four unlisted functions executable by `anon`; all four are internal trigger functions: `assistant_capture_automation_result`, `ciosp_apply_commercial_entry_charge`, `guard_customer_contract_production_environment`, and `guard_privacy_policy_activation_evidence`.

The migration fails closed unless those counts remain 64 and 4, revokes direct EXECUTE from the four triggers, adds only the currently unlisted audited surface to the existing allowlist, and aborts if `app_private.assert_rpc_security_allowlist_v1()` returns any issue.

P0-A becomes PASS only after application to the target database proves: unlisted count 0; anonymous direct EXECUTE on the four triggers false; assertion zero rows. P0-B real pure-traveler JWT/session E2E remains separate and open.
