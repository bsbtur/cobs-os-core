# PROD LIVE R$1 gate

Preparation is intentionally fail-closed. The temporary Edge Function returns HTTP 423 and has no code path to Mercado Pago. Database state, if later migrated, begins `locked`. No action in this branch alone authorizes or performs a real payment.
