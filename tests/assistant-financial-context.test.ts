import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const financial = readFileSync('supabase/migrations/20260901163324_assistant_financial_amount_semantics_v1.sql','utf8')
const submit = readFileSync('supabase/migrations/20260901162019_assistant_financial_context_v1.sql','utf8')

describe('Assistant Financial Context V1', () => {
  test('is traveler and operation scoped', () => {
    expect(financial).toContain('assistant_has_operation_access')
    expect(financial).toContain('oi.beneficiary_person_id=_person_id')
    expect(financial).toContain('pc.tenant_id=_tenant_id')
    expect(financial).toContain('pc.order_id=_order_id')
  })

  test('exposes major currency units with explicit semantics', () => {
    expect(financial).toContain("'amount_unit','major'")
    expect(financial).toContain("'order_total',round(coalesce(_order_total,0)::numeric/100,2)")
    expect(financial).toContain('Do not divide or multiply these values.')
  })

  test('assistant request receives server-built payment context', () => {
    expect(submit).toContain("'{payment}'")
    expect(submit).toContain('assistant_build_payment_context')
    expect(submit).toContain('auth.uid() is null')
    expect(submit).toContain('_c.profile_id<>auth.uid()')
  })
})
