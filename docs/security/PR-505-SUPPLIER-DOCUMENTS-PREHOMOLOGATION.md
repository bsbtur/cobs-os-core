# PR #505 — Supplier documents security pre-homologation (static audit)

Date: 2026-10-17. Scope: repository-only inspection; **no database connection, DDL, production traffic, migrations, or real customer data**.

## Verified in versioned SQL
- `public.supplier_documents` has RLS enabled.
- Read policy grants owner/admin/operations_agent of the row's `tenant_id`; management policy grants owner/admin only.
- Direct table DML is granted to `authenticated`, therefore RLS is an actual write protection boundary, not just RPC access.
- `add_supplier_document` and `set_supplier_document_status` are `SECURITY DEFINER`, check `auth.uid()`, and check owner/admin membership against their looked-up quote/document tenant.
- RPC EXECUTE is revoked from PUBLIC/anon and explicitly granted to authenticated/service_role in the checked migration.
- The UI flag `ENABLE_SUPPLIER_DOCUMENT_MANAGER` stays `false`.

## Security review — not yet approved
1. **Cross-entity consistency must be proved.** The table has independent foreign keys for `tenant_id`, `operation_id`, `quote_id`, `supplier_id`; the inspected migration does **not** define a composite constraint ensuring that all four refer to the same tenant/operation. Owner/admin users with direct DML privileges may be able to create or modify inconsistent references if no other triggers/constraints intervene. Check full deployed schema and triggers before declaring exploitable.
2. **Operation-level boundary.** The RLS read condition depends on tenant role, not on operation membership. Confirm whether this is the intended role model. The UI filters operation, but client filters are not security.
3. **Definer review.** Both RPCs pin `search_path=public,app_private,pg_temp`; re-evaluate unqualified built-ins and writable schema/search-path exposure against current Supabase hardening guidance.
4. **Deployment drift.** A migration present in Git does not demonstrate it was applied in the CLEAN BUILD database.

## Required isolated behavioral matrix (future authorization)
Use a disposable PostgreSQL instance with synthetic tenants A/B, operations A1/A2/B1, suppliers and quotes, and simulated authenticated and anonymous principals; never production IDs.
- anon: deny SELECT/INSERT/UPDATE/DELETE and both RPCs.
- authenticated nonmember: deny documents of A and B; RPCs reject.
- tenant-A operations_agent: read tenant A, cannot change documents or invoke management RPC successfully.
- tenant-A owner/admin: may read and manage permitted A documents; no B access or modification.
- tenant-A owner/admin: attempt direct INSERT/UPDATE with own `tenant_id` but foreign operation/quote/supplier IDs; **must reject** cross-tenant and cross-operation links.
- tenant-A owner/admin: attempt `add_supplier_document` with quote B; must reject.
- tenant-A owner/admin: attempt `set_supplier_document_status` on document B; must reject.
- tenant-A owner/admin: status transitions with invalid status must reject, valid status must succeed.
- operation scope within tenant A: verify A1/A2 segregation according to the documented business policy.
- verify actual schema grants, RLS policy definitions, triggers, RPC owners, search paths and applied migration IDs in an **authorized isolated environment**.

## Release decision
**BLOCKED** for feature activation until isolated behavioral tests, deployed-schema checks, and explicit approval. Do not enable the feature flag, alter grants/RLS, apply migrations, merge or deploy.
