import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260915190000_rpc_security_allowlist_post_baseline_hardening_v1.sql',
  'utf8',
)

describe('post-baseline SECURITY DEFINER allowlist hardening', () => {
  test('fails closed if the audited surface is not exactly 64 functions', () => {
    expect(migration).toContain('IF v_unlisted <> 64')
    expect(migration).toContain('IF v_anon_unlisted <> 4')
  })

  test('removes direct execution from the four internal trigger functions', () => {
    for (const fn of [
      'assistant_capture_automation_result',
      'ciosp_apply_commercial_entry_charge',
      'guard_customer_contract_production_environment',
      'guard_privacy_policy_activation_evidence',
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION app_private.${fn}() FROM PUBLIC, anon, authenticated, service_role`,
      )
    }
  })

  test('keeps the two authenticated assistant predicates explicitly allowed', () => {
    expect(migration).toContain("assistant_can_access_conversation")
    expect(migration).toContain("assistant_has_operation_access")
  })

  test('uses the assertion as a transactional release gate', () => {
    expect(migration).toContain('app_private.assert_rpc_security_allowlist_v1()')
    expect(migration).toContain('IF v_issues <> 0')
  })
})
