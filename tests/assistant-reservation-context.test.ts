import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/20260901152500_assistant_reservation_context_v1.sql','utf8')

describe('Assistant Reservation Context V1', () => {
  test('is traveler scoped and server assembled', () => {
    expect(sql).toContain('assistant_has_operation_access')
    expect(sql).toContain('oi.beneficiary_person_id=_person_id')
    expect(sql).toContain("r.status::text in ('confirmed','reserved')")
    expect(sql).toContain("o.status::text<>'cancelled'")
    expect(sql).toContain("'{reservation}'")
  })

  test('does not add financial truth to reservation context', () => {
    const helper = sql.split('revoke all on function')[0]
    expect(helper).not.toContain("'payment'")
    expect(helper).not.toContain("'price'")
    expect(helper).not.toContain("'amount'")
  })
})
