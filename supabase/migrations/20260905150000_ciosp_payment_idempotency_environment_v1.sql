-- Keep one live public CIOSP charge and one live Pix attempt per installment
-- and Mercado Pago environment. The environment is part of the financial fact
-- boundary: a test QR must never be reused for a production request.
create unique index if not exists payment_charges_ciosp_live_installment_environment_uidx
  on public.payment_charges (
    order_id,
    installment_number,
    coalesce(metadata->>'environment', 'unknown')
  )
  where provider = 'mercado_pago'::public.payment_provider
    and installment_number is not null
    and metadata->>'source' = 'public_checkout'
    and status in ('draft', 'pending', 'processing');

create unique index if not exists payment_attempts_ciosp_live_environment_uidx
  on public.payment_attempts (
    charge_id,
    method,
    coalesce(metadata->>'environment', 'unknown')
  )
  where provider = 'mercado_pago'::public.payment_provider
    and method = 'pix'::public.payment_method_kind
    and metadata->>'source' = 'public_checkout'
    and status in ('created', 'pending', 'processing');
