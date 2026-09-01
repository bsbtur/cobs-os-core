import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260901152500_assistant_reservation_context_v1.sql',
  'utf8',
)

describe('Assistant Reservation Context V1 migration', () => {
  test('scopes reservation facts to active traveler access and beneficiary', () => {
    expect(migration).toContain('assistant_has_operation_access')
    expect(migration).toContain("g.status::text = 'active'")
    expect(migration).toContain('oi.beneficiary_person_id = _person_id')
    expect(migration).toContain('o.operation_id = _operation_id')
    expect(migration).toContain('r.tenant_id = _tenant_id')
  })

  test('only exposes active reservation states and excludes cancelled orders', () => {
    expect(migration).toContain("r.status::text in ('confirmed', 'reserved')")
    expect(migration).toContain("o.status::text <> 'cancelled'")
  })

  test('injects reservation server-side into trusted context', () => {
    expect(migration).toContain("'{reservation}'")
    expect(migration).toContain('app_private.assistant_build_reservation_context')
    expect(migration).toContain('app_private.assistant_build_trusted_context')
  })

  test('does not add payment or price facts to reservation context', () => {
    const helperBody = migration.split('revoke all on function')[0]
    expect(helperBody).not.toContain("'payment'")
    expect(helperBody).not.toContain("'amount'")
    expect(helperBody).not.toContain("'price'")
  })
})
