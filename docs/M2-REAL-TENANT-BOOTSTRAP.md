# COBS OS — M2 REAL TENANT BOOTSTRAP · FINAL VERIFICATION

Date: 2026-08-10 (UTC) · Scope: read-only verification against the live production backend.
No data was created, modified or removed during this verification.

## 1. Tenant

| Field | Value |
| --- | --- |
| Tenants in database | 1 |
| Name | BSBTUR |
| Slug | `bsbtur` |
| country_code | BR |
| default_locale | pt-BR |
| timezone | America/Sao_Paulo |
| currency_code | BRL |
| created_at | 2026-08-10 23:52:44 UTC |

Uniqueness: `tenants_slug_key UNIQUE (lower(slug))` — a second `bsbtur` organization is structurally impossible.

## 2. Owner identity

| Check | Result |
| --- | --- |
| Auth users total | 1 |
| Email confirmed | YES (real inbox confirmation, 23:45 UTC) |
| Signup display name | RAFAEL LIMA |
| Profiles | 1, bound 1:1 to the auth user |
| People in BSBTUR | 1, bound to that Profile |
| Memberships | 1 · role `owner` · status `active` |
| Duplicates (tenant / profile / person / membership) | NONE |

No password, token, session or confirmation material is recorded in this document or in any database row inspected.

## 3. Bootstrap contract conformance (W01–W03 frozen)

- `bootstrap_tenant` creates exactly: tenant + owner membership + owner person + audit event + idempotency record. Verified 1 of each.
- Operational role types are **not** part of the tenant bootstrap contract; they are provisioned lazily by `ensure_operation_role_types` at first Operation creation (W03). Current count 0 → contract-correct.
- Audit evidence: 1 row, `tenant.bootstrapped`, subject `tenant`, actor = owner profile, metadata `{slug, membership_id, person_id}` — no secrets. `audit_events_immutable` trigger active.
- Idempotency: 1 row (`tenant.bootstrap`) keyed to the owner profile; replaying the same intent key returns the stored result without creating a second organization.

## 4. Data state

Non-empty tables (6): `tenants` 1, `profiles` 1, `people` 1, `memberships` 1, `audit_events` 1, `idempotency_keys` 1.
Experiences 0 · Offerings 0 · Operations 0 · all W04–W10 tables 0.

## 5. Security baseline (unchanged vs M1 fingerprint)

| Metric | M1 | M2 |
| --- | --- | --- |
| Public tables | 50 | 50 |
| RLS policies | 72 | 72 |
| Public functions | 226 | 226 |
| `app_private` helpers | 98 | 98 |
| Public enums | 48 | 48 |

- `anon`: zero privileges on every public table (0 SELECT, 0 write).
- `authenticated`: SELECT on all 50 tables.
- RLS disabled on 0 tables. Disabled triggers: 0.
- Residual W01–W03 baseline write grants (`experiences`, `offerings`, `operations`, `people`, `invitations`, `memberships`, `profiles`, `tenants`) are unchanged from the frozen baseline and are neutralised by the `guard_*` BEFORE triggers, which reject all direct DML outside SECURITY DEFINER commands.
- No schema, function, helper, policy, trigger, enum, Realtime or semantic change occurred during M2.

## 6. Session / UX checks

- Onboarding duplicate-safety (item 19): verified structurally — the unique slug index plus per-intent idempotency prevent a duplicate BSBTUR from `/onboarding` navigation or retries.
- Items 17 and 18 (owner session at `/app`, reload preserving tenant context) could not be executed in this run: no signed-in preview session was injectable (`LOVABLE_BROWSER_AUTH_STATUS = signed_out`). Same tooling limitation recorded for W06–W10. Status: **UNVERIFIED (tooling)**, not PASS.

## 7. Observations

- **OBS-M2-001 (P2, cosmetic, production data):** the owner Person `full_name` is `contato.bsbtur@gmail.com` instead of `RAFAEL LIMA`. `ensure_profile` ran at first authenticated request before the signup metadata display name was written to `profiles.display_name`, so the bootstrap fell back to email. No structural or security impact. Left untouched — production data is preserved; correction should be an explicit, authorised profile/person name update.

## 8. Verdict

- M2_REAL_TENANT_BOOTSTRAP: **PASS**
- REAL_BSBTUR_TENANT_PRESERVED: **YES**
- REAL_OWNER_IDENTITY_PRESERVED: **YES**
- DUPLICATE_BOOTSTRAP_FOUND: **NO**
- PRODUCTION_BASELINE_CAPTURED: **YES**
- READY_FOR_M3: **YES**

---

## Addendum M2.1 — Owner Person Name Correction (2026-08-11 UTC)

**Outcome: BLOCKED — no changes made.** Read-only inspection only; no DML, no schema change.

### Frozen command surface inspection

| Candidate | Can correct the owner's Person name? |
| --- | --- |
| `ensure_profile(_display_name)` | Partially — sets `profiles.display_name` only when it is currently NULL. Never touches `people.full_name`. |
| `link_person_to_profile(...)` | No — binds an existing Person to a Profile. |
| `bootstrap_tenant(...)` | No — creation-only, idempotent; a replay returns the stored result. |
| Any `update_*` / `set_*` command | No — none targets `public.people`. |

Result: **the frozen W01–W10 public surface contains no command that updates `public.people.full_name`.** Direct DML is additionally rejected by the `guard_w03_mutation` BEFORE trigger, and `authenticated` holds SELECT-only on `people`. Per the task constraints (prefer the approved command path; do not modify architecture to perform the correction), execution stopped here.

Current state (unchanged): Person `cf022cd0…` `full_name = contato.bsbtur@gmail.com`; Profile `38c4f5d6…` `display_name = NULL`.

### Root cause (identified, not fixed in this task)

1. `AuthProvider` calls `ensure_profile` with no display name, so `profiles.display_name` is created NULL.
2. Signup metadata (`RAFAEL LIMA`) is stored on the auth user and never propagated to `profiles.display_name`.
3. `bootstrap_tenant` derives the owner Person name via `coalesce(profiles.display_name, profiles.email, 'Owner')` → falls back to the email address.

Remedy (requires an explicit, separately authorised change — a W01 surface addition such as `update_my_display_name(_display_name)` writing both `profiles.display_name` and the caller's owning Person `full_name`, with audit evidence; plus propagating signup metadata into `ensure_profile`).

### Verification (unchanged baseline)

Tenants 1 · auth users 1 · Profiles 1 · People 1 · Memberships 1 (active `owner`) · all IDs preserved · BSBTUR/`bsbtur`/BR/BRL/pt-BR/America/Sao_Paulo unchanged · Experiences/Offerings/Operations 0 · W04–W10 rows 0 · no duplicate identity · structural fingerprint unchanged (50 tables, 72 policies, 226 public functions, 98 helpers, 48 enums). No secret material inspected or printed.

**OBS-M2-001 remains OPEN.**

---

## Addendum M2.2 — Self Display Name Correction Contract (2026-08-11 UTC)

### New public command (additive, W01)

`public.update_my_display_name(_display_name text, _idempotency_key uuid) returns jsonb`
SECURITY DEFINER · `SET search_path = public` · EXECUTE granted to `authenticated`, `service_role`; revoked from `public`/`anon`.

- Identity derived exclusively from `auth.uid()` — no person/profile/tenant/membership arguments. Cannot touch another identity.
- Atomically sets `profiles.display_name` and, when a Person is linked to that Profile (`people.profile_id = auth.uid()`), that Person's `full_name`, in one transaction.
- Input: trimmed, blank rejected, max 120 chars, no case forcing, no name parsing, international characters preserved.
- No-op path returns `{ unchanged: true }` and writes nothing (no audit, no idempotency row).
- Idempotency via `idempotency_keys` (`action = 'identity.display_name'`, scoped to the actor); replay returns the stored result.
- Audit: `identity.display_name_changed`, subject `person` (or `profile` when unlinked), metadata carries ids plus `changed: true` only — no names, no email, no credentials.
- No table ACL broadening, no RLS change, no guard weakened. `people` has no mutation guard trigger; direct `authenticated` DML remains impossible (SELECT-only grants).

Public function count 226 → **227**. Private helpers **98 → 98 (unchanged; none added)**.

### Root-cause fix (frontend only)

`src/lib/auth.tsx` now passes the signup metadata display name ("Como devemos te chamar") into `ensure_profile`, so `profiles.display_name` is populated before `bootstrap_tenant` derives the owner Person name. `AuthProvider` structure and `bootstrap_tenant` semantics are untouched, and no table is mutated from the client. Settings gains a self-service "Your display name" card calling the approved command (needed because `ensure_profile` never overwrites an existing value).

### Real owner correction — NOT EXECUTED

`LOVABLE_BROWSER_AUTH_STATUS = signed_out`: no real authenticated Owner session is injectable in this environment. Per the contract, the correction was **not** performed by impersonating the Owner with `service_role`. The Owner completes it from **Settings → Your display name** by entering `Rafael Lima`.

Production state unchanged: tenants 1 · auth users 1 · profiles 1 · people 1 · active owner memberships 1 · all ids preserved · BSBTUR/`bsbtur`/BR/BRL/pt-BR/America/Sao_Paulo unchanged · Experiences/Offerings/Operations 0 · W04–W10 rows 0 · profile `display_name` NULL · person `full_name` still the email.

**OBS-M2-001 remains OPEN until the Owner runs the command.**
