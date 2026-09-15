import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260915200000_preprovisioned_tenant_first_owner_claim_v1.sql',
  'utf8',
)

describe('pre-provisioned tenant first-owner claim', () => {
  test('is administrative only', () => {
    expect(migration).toContain('from public, anon, authenticated')
    expect(migration).toContain('to service_role')
    expect(migration).toContain("'SERVICE_ROLE'")
  })

  test('requires a real confirmed Auth identity', () => {
    expect(migration).toContain('u.email_confirmed_at is not null')
    expect(migration).toContain("raise exception 'A confirmed Auth identity is required'")
  })

  test('claims only an existing tenant with zero memberships', () => {
    expect(migration).toContain("raise exception 'Pre-provisioned tenant not found'")
    expect(migration).toContain('if _membership_count <> 0 then')
    expect(migration).toContain("raise exception 'Tenant already has memberships'")
  })

  test('creates owner, person and audit evidence', () => {
    expect(migration).toContain("values (_tenant.id, _profile_id, 'owner', 'active')")
    expect(migration).toContain("'tenant.first_owner_claimed'")
    expect(migration).toContain("'admin_preprovisioned_claim'")
  })

  test('registers the RPC in the security allowlist and asserts zero drift', () => {
    expect(migration).toContain("'admin_claim_preprovisioned_tenant_owner'")
    expect(migration).toContain('app_private.assert_rpc_security_allowlist_v1()')
    expect(migration).toContain('if v_issues <> 0 then')
  })
})