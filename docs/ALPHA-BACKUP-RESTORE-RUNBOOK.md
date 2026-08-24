# COBS OS — ALPHA BACKUP & RESTORE RUNBOOK (M5)

Status: **PASS** · Milestone: ALPHA PILOT READINESS · Scope: M5 — Backup & Restore Verification
Applies to: COBS OS ALPHA CORE v0.1 (W01–W10 frozen)

> Purpose: prove that COBS OS can be **recovered from a backup into an isolated
> target** — with its structure, its data and, above all, its **enforced security
> behaviour** intact — **without ever writing to, locking, or overwriting the live
> BSBTUR production foundation**.

---

## 1. Safety contract (non-negotiable)

| Rule                                                       | Enforcement in this drill                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production is **read-only** during backup and verification | Every production query is a `SELECT` issued through the restricted read role; no migration, no `INSERT`, no `pg_dump`                                                     |
| The restore target is **never** production                 | Target is a **separate local PostgreSQL cluster** (port 5433) inside the sandbox, with its own data directory                                                             |
| Restore **never** reuses a production connection string    | Restore uses only local socket `/tmp/pgrun`                                                                                                                               |
| The drill leaves **no residue** in production              | Verified post-drill: object counts and row checksums identical to pre-drill                                                                                               |
| Auth credentials are **never** exported                    | `auth.users` is exported as a non-PII stub: opaque `id`, e-mail **fingerprint**, confirmation flag, `created_at`. No password hash, no e-mail, no token, no refresh token |

**Business PII rule:** the artifact _does_ contain tenant business data
(`people`, `profiles` — including contact e-mails), because a backup that omits it
is not a backup. The artifact is therefore **confidential** and is destroyed at the
end of every drill (§8). It must never be written outside a controlled location.

---

## 2. What Lovable Cloud gives us, and what it does not

| Capability                                                     | Status                                    | Consequence                                                                  |
| -------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| Managed daily physical backups + PITR of the Postgres instance | Provider-managed                          | Recovery of the _instance_ is the provider's path; we do not own the button  |
| Self-service point-in-time restore console                     | **Not exposed** to Lovable Cloud projects | We cannot demonstrate a provider restore ourselves                           |
| `pg_dump` / full logical dump via tooling                      | **Not permitted** on this access path     | We built our own catalog-faithful logical exporter                           |
| Read access to `auth.*` internals                              | **Denied** to the app role                | `auth` is reproduced as a documented **stub**; that branch is **UNVERIFIED** |

**Ruling:** M5 verifies what COBS _owns_ — the **application foundation**
(schema, functions, RLS, grants, triggers, data). Identity storage recovery
(`auth.*`) remains the provider's responsibility and is explicitly out of our
verifiable surface.

---

## 3. Toolchain (committed, repeatable)

| File                              | Role                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `scripts/backup/gen_backup.py`    | READ-ONLY logical backup generator → `01_pre.sql`, `02_data.sql`, `03_post.sql`, `manifest.json` |
| `scripts/backup/restore_drill.sh` | One-command drill: generate → post-process → provision isolated target → apply → report timings  |
| `scripts/backup/compare.py`       | Deterministic structural fingerprint: 11 dimensions, SHA-256 per dimension, exact drift listing  |
| `scripts/backup/behaviour.sql`    | Behavioural security drills (H1–H9) executed **on the restored copy**                            |

Artifact layout mirrors `pg_dump` section order:

```
01_pre   roles · schemas · extensions · auth STUB · enums · sequences · tables · functions
02_data  COPY (TSV) for all 50 tables + auth stub rows
03_post  indexes · constraints · triggers · RLS · policies · GRANTs · publications
```

Ordering defects found and fixed during the drill are encoded in the tooling:
indexes are emitted **before** foreign keys (FKs may reference unique indexes),
and every referenced grantee role is created if absent in the target.

---

## 4. Verified baseline (source of truth at drill time)

| Object                                         | Count                          |
| ---------------------------------------------- | ------------------------------ |
| Tables (`public`)                              | 50                             |
| Public functions                               | 229 (205 `SECURITY DEFINER`)   |
| Private helpers (`app_private`)                | 98                             |
| Enums                                          | 48 (246 labels)                |
| Columns                                        | 727                            |
| Constraints                                    | 428                            |
| Indexes                                        | 219                            |
| Triggers (non-internal)                        | 98                             |
| RLS-enabled tables                             | 50 / 50 (**zero** unprotected) |
| Policies                                       | 78                             |
| Table grants (anon/authenticated/service_role) | 100                            |

---

## 5. Restore result — structural fidelity

Source (production) vs restored isolated copy, 11 dimensions, SHA-256 compared:

| Dimension                                                                 | Rows     | Match                |
| ------------------------------------------------------------------------- | -------- | -------------------- |
| columns                                                                   | 727      | ✅ identical         |
| constraints                                                               | 428      | ✅ identical         |
| indexes                                                                   | 219      | ✅ identical         |
| enums                                                                     | 246      | ✅ identical         |
| functions (signature + `secdef` + volatility + `search_path` + body hash) | 327      | ✅ identical         |
| triggers                                                                  | 98       | ✅ identical         |
| RLS flags                                                                 | 50       | ✅ identical         |
| policies (roles + cmd + `USING` + `WITH CHECK`)                           | 78       | ✅ identical         |
| table grants                                                              | 100      | ✅ identical         |
| function EXECUTE ACLs                                                     | 327      | ✅ identical         |
| publications                                                              | 13 vs 12 | ⚠️ 1 explained delta |

**Total structural drift: 1**, fully explained:
`supabase_realtime_messages_publication → realtime.messages` is a
**provider-internal** table in the managed `realtime` schema, outside the COBS
application surface and outside our read access. No COBS table is missing from
the restored realtime publication.

**Data fidelity:** all 50 tables compared by row count **and** full-content MD5
(`md5(string_agg(row::text order by row::text))`). **Data drift: 0.**
Non-empty tables verified: `tenants`, `profiles`, `people`, `memberships`,
`idempotency_keys`, `audit_events`.

---

## 6. Restore result — behavioural fidelity (the part that actually matters)

A restore that recreates tables but loses enforcement is a **security incident**,
not a recovery. Drills executed **on the restored copy**:

| ID  | Drill                                                | Result                                                             |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| H1  | Anonymous role reads `tenants` / `people`            | ❌ `permission denied` — **denied as designed**                    |
| H2  | `authenticated` with no JWT claims                   | 0 rows visible                                                     |
| H3  | `authenticated` as the real restored member          | Sees exactly **1** tenant, **1** membership, **1** person          |
| H4  | `authenticated` as a foreign `uid`                   | **0** rows — tenant isolation intact                               |
| H5  | Direct `INSERT`/`UPDATE`/`DELETE` as `authenticated` | ❌ `permission denied` — SELECT-only ACL intact                    |
| H6  | Call `app_private` helper as `authenticated`         | ❌ `permission denied for function`                                |
| H7a | `SECURITY DEFINER` command with no session           | ❌ `Authentication required`                                       |
| H7b | `SECURITY DEFINER` command as foreign caller         | ❌ `Only owners and admins can create experiences`                 |
| H8  | `UPDATE` on `audit_events` (as superuser)            | ❌ `audit_events is append-only` — trigger survived restore        |
| H9  | Frozen-surface census                                | 229 public fns · 205 secdef · 50/50 RLS · **0** tables without RLS |

**Behavioural verdict: PASS.** The restored copy denies exactly what production
denies and reveals exactly what production reveals.

---

## 7. Defects found by the drill (all fixed)

The drill earned its keep — three real artifact defects were caught only because
verification compared _behaviour and ACLs_, not just table names:

| ID             | Defect                                                                                                                                                                            | Impact if undetected                                                                                                            | Fix                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **DEF-M5-001** | Table `GRANT`s were read from `information_schema.role_table_grants`, which only reveals grants the _current_ role participates in → the artifact contained **zero** table grants | A "successful" restore where every app request fails with `permission denied`; recovery looks complete and the product is dead  | Grants are now read from `pg_class.relacl` and reproduced letter-by-letter |
| **DEF-M5-002** | The `auth.uid()` stub read only the legacy flat GUC, not `request.jwt.claims`                                                                                                     | Every RLS policy silently evaluates false on the restored copy → a _silent total data blackout_ mistaken for "no data restored" | Stub now resolves the claims JSON first, with the legacy GUC as fallback   |
| **DEF-M5-003** | `PUBLIC` `EXECUTE` grants on 22 trigger-guard functions were dropped                                                                                                              | Restored ACL posture diverges from production                                                                                   | `PUBLIC` grants are now reproduced faithfully                              |
| **DEF-M5-004** | FK constraints emitted before the unique indexes they reference                                                                                                                   | Restore aborts mid-way                                                                                                          | Indexes hoisted before constraints                                         |

---

## 8. Recovery procedure (operator steps)

**Trigger:** data loss, destructive migration, or corruption suspected in production.

1. **Freeze writes.** Announce an operational pause; do not attempt repair mutations.
   Recovery decisions are made _before_ touching data.
2. **Classify.** Structural damage (schema/functions/policies) → §8a.
   Data damage only → §8b. Instance-level loss → §8c.
3. **Never restore into production first.** Always restore into an isolated target
   and verify there.

**§8a — Application foundation recovery**

```bash
scripts/backup/restore_drill.sh cobs_restore_incident   # isolated target
python3 scripts/backup/compare.py prod cobs_restore_incident   # expect drift ≤ 1 (realtime)
psql -d cobs_restore_incident -f scripts/backup/behaviour.sql  # expect H1–H9 as in §6
```

Only after both gates pass may the reviewed SQL be promoted to production as a
normal migration.

**§8b — Data-only recovery**
Restore into the isolated target, extract only the affected table(s), and reapply
through the frozen `SECURITY DEFINER` command surface where a command exists
(`reinstate_operation`, `retract_presence_fact`, …). **Never** bypass append-only
guards; event/audit tables are corrected by _appending compensating facts_, never
by editing history (H8 proves the guard survives restore).

**§8c — Instance-level loss**
Escalate to Lovable Cloud support for provider PITR. `auth.*` recovery is
provider-owned; the COBS artifact restores the application foundation on top.

---

## 9. Objectives: measured, not promised

| Objective                                   | Measured               | Note                                                                 |
| ------------------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| Backup generation (RPO capture)             | **~49 s**              | Full catalog + data, read-only                                       |
| Restore apply (RTO, application foundation) | **~0.55 s**            | 50 tables · 327 functions · 78 policies at current pilot data volume |
| End-to-end drill (generate → restore)       | **~50 s**              | Reproducible via one command                                         |
| Verified recovery point                     | **On-demand snapshot** | The artifact is only as fresh as the last run                        |

**RPO ruling (honest):** COBS itself has **no scheduled backup job**. The verified
recovery point is _"whenever an operator last ran the drill"_, layered on top of
provider-managed daily backups + PITR that we cannot invoke ourselves. Before
carrying real BSBTUR revenue-bearing data, run the artifact **before and after every
migration and at each pilot day's close**.

---

## 10. Known limitations (recorded, not hidden)

| ID             | Limitation                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LIM-M5-001** | `auth.*` is reproduced as a **non-PII stub**. Recovery of real credentials, sessions and identities is provider-owned and **UNVERIFIED** by COBS. Never claim auth recovery as tested. |
| **LIM-M5-002** | Storage buckets/objects are **not** covered by this artifact. Not a pilot blocker today (no storage dependency), becomes one the moment files are stored.                              |
| **LIM-M5-003** | Realtime publication membership for provider-internal `realtime.*` tables is out of read scope (the single accepted structural delta).                                                 |
| **LIM-M5-004** | Restore timings were measured at **pilot data volume (8 rows)**. RTO must be re-measured once real operational volume exists; it is not a linear guarantee.                            |
| **LIM-M5-005** | Provider PITR itself was **never executed** — Lovable Cloud does not expose the control to this project. Provider-side recovery is asserted by the platform, not proven by us.         |
| **LIM-M5-006** | The drill runs in a sandbox cluster (PostgreSQL 17.9) while production runs 17.6. Same major version; no cross-major-version restore has been tested.                                  |
| **LIM-M5-007** | Extensions are recreated by name; provider-specific extension internals (`pg_net`, `pg_cron` jobs, `vault` contents) are **not** part of the artifact.                                 |

---

## 11. Post-drill hygiene (mandatory)

After every drill:

1. Drop every restore target database in the isolated cluster.
2. Delete the artifact directory (`/tmp/m5`) — it contains **real business PII**.
3. Re-verify production integrity (object counts + row checksums unchanged).

Verified for this drill: production remained **50 tables · 229 public functions ·
1 tenant · 1 person · 1 membership · 2 audit events** — byte-identical before and
after. **No production write occurred.**

---

## 12. M5 verdict

**PASS — with recorded limitations.**

COBS OS can be recovered from a backup into an isolated target with **zero
structural drift** on the application surface (one explained provider-internal
delta), **zero data drift**, and **fully preserved security enforcement**. The
drill is committed, one-command repeatable, and caught four real defects that a
naïve "the tables are back" check would have shipped straight into an incident.

**Residual pilot risk:** no automated backup schedule, and provider-side PITR is
unproven from our side (LIM-M5-005). Mitigation is operational: run the drill
before/after every migration and at each pilot day's close until scheduling is owned.
