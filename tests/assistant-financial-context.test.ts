import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const paymentSql = readFileSync('supabase/migrations/20260901161900_assistant_financial_context_v1.sql','utf8')
const semanticsSql = readFileSync('supabase/migrations/20260901163200_assistant_financial_amount_semantics_v1.sql','utf8')

describe('Assistant Financial Context V1', () => {
  test('is scoped to the granted traveler and selected order', () => {
    expect(paymentSql).toContain('assistant_has_operation_access')
    expect(paymentSql).toContain('oi.beneficiary_person_id=_person_id')
    expect(paymentSql).toContain('pc.order_id=_order_id')
    expect(paymentSql).toContain("'{payment}'")
  })

  test('publishes explicit major-unit semantics after normalization', () => {
    expect(semanticsSql).toContain("'amount_unit','major'")
    expect(semanticsSql).toContain("'order_total',round(coalesce(_order_total,0)::numeric/100,2)")
    expect(semanticsSql).toContain("'paid_total',round(_paid_total::numeric/100,2)")
    expect(semanticsSql).toContain("'balance_due',round(_balance::numeric/100,2)")
    expect(semanticsSql).toContain('Do not divide or multiply these values.')
  })
})
