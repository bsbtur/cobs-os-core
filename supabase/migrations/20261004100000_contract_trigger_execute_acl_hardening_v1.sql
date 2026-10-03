-- COBS OS · Contract trigger function ACL hardening v1
-- Mirrors the verified PROD hardening for internal SECURITY DEFINER trigger functions.
-- Trigger execution does not require direct EXECUTE privileges for application roles.

revoke execute on function app_private.guard_customer_contract_production_environment()
  from public, anon, authenticated;

revoke execute on function app_private.guard_privacy_policy_activation_evidence()
  from public, anon, authenticated;

comment on function app_private.guard_customer_contract_production_environment() is
  'Internal trigger guard. Direct execution is denied to PUBLIC, anon, and authenticated roles.';

comment on function app_private.guard_privacy_policy_activation_evidence() is
  'Internal trigger guard. Direct execution is denied to PUBLIC, anon, and authenticated roles.';
