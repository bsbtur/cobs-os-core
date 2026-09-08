-- Pirenópolis sale-base financial seed (draft only).
-- Intentionally does not create orders, charges, payment attempts, or production Pix.
-- Final commercial price remains pending supplier quotes.

insert into public.operation_financial_plans (
  tenant_id,
  operation_id,
  expected_paying_passengers,
  target_unit_price_minor,
  contingency_minor,
  tax_fee_minor,
  notes
)
select
  o.tenant_id,
  o.id,
  25,
  0,
  0,
  0,
  'BASE DRAFT — Pirenópolis Experience 23–28/10/2026. 30 vagas; cenário-base 25 pagantes; preço pendente de custos reais; margem mínima BSBTUR 50%. Não publicar cobrança enquanto target_unit_price_minor = 0.'
from public.operations o
where o.code = 'PIRENO-20261023-01'
  and o.status = 'draft'
  and not exists (
    select 1
    from public.operation_financial_plans fp
    where fp.operation_id = o.id
  );
