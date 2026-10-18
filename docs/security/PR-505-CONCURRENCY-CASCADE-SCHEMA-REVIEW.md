# PR #505 — Pre-migration review: concurrency, cascading deletes, canonical schema
Date: 2026-10-17. Review scope: only versioned GitHub migration and disposable test harness. No changes to deployed Supabase.

## Canonical integration checked
- `20260906060000_consolidate_supplier_documents_v1.sql` declares `supplier_documents` FK to tenants, operations, operation_quotes and suppliers, all `ON DELETE CASCADE` (quote_id nullable). This means parent deletion can remove documents; distinguish expected cascade from audit/document-retention business requirements.
- `20260906050000_consolidate_procurement_v1.sql`: `update_operation_quote` can change `supplier_id` when the supplier name changes; the candidate parent guard would reject the change if that quote has associated documents. This is a behavior change that needs product review and a targeted RPC regression test.
- The baseline test harness uses simplified stand-in tables; it does **not** exercise the complete canonical dependencies, triggers or RLS policies of every parent table. Compatibility with deployed schema remains unproven.

## Concurrency risk — open / must test
- The document trigger reads parents using `FOR KEY SHARE`. This lock generally prevents deletion or updates to referenced key columns but does not necessarily serialize mutations of non-key columns such as `tenant_id`, `operation_id` or `supplier_id` where these are not part of referenced unique keys.
- Reverse parent triggers query `supplier_documents` without an explicit row lock. Under concurrent transactions (especially READ COMMITTED), two transactions may each validate a snapshot then commit incompatible changes (write skew). The current single-session SQL tests do not prove race safety.
- Proposed next test: two independent psql sessions with barriers/timeouts, one performing document insert/relink and the other changing parent scope, assert that either an operation blocks/fails or final integrity remains invariant across both commit orders. Avoid claiming PASS before execution.
- Evaluate composite foreign keys using properly indexed unique keys (tenant + operation + supplier/quote) vs consistent parent row locking (`FOR SHARE` or stronger) and symmetrical locking order, testing for deadlock behavior. Do not implement a blind lock upgrade before concurrent verification.

## Cascading deletion
- A new disposable SQL fixture checks quote, operation and supplier `ON DELETE CASCADE` independently with savepoints. Passing these tests confirms schema behavior; it does not establish that deleting evidence is desirable. Confirm retention requirements and audit impact before approval.
- Investigate whether `quote_id IS NULL` is a supported document state and whether cascaded deletion conflicts with procurement audit obligations.

## Release verdict
**BLOCK** promotion to migration and feature activation until: (1) cascade test passes, (2) dual-session concurrency testing and desired delete/retention semantics are settled, (3) canonical RPC regression around `update_operation_quote` is assessed. No merge, production deployment or Supabase mutations authorized.
