-- Safety boundary: migrations in this V3 synchronization never create customer_contracts,
-- never mutate orders/payments, and never invoke a signature provider.
-- This no-op migration intentionally records that deployment boundary in migration history.
do $$ begin null; end $$;
