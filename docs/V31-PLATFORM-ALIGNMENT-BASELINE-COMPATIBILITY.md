# COBS Platform Alignment — Baseline Compatibility Report

## Scope

This report captures the compatibility state before any V3.1 migration is applied to the new `COBS OS STAGING V3.1` Supabase project.

## Environments

- CLEAN BUILD: `nktohbqmcpgonlizzcka`
- STAGING V3.1: `wzukfenbzwlwzhtadlxl`
- Legacy sandbox: paused

## Structural inventory

### CLEAN BUILD

- public base tables: 68
- public views: 0
- functions in `public` + `app_private`: 428
- public tables with RLS enabled: 68/68
- public RLS policies: 91
- public enum types: 63

### STAGING V3.1 before baseline

- public base tables: 0
- public views: 0
- functions in `public` + `app_private`: 0
- public tables with RLS enabled: 0
- public RLS policies: 0
- public enum types: 0

## Migration provenance finding

The live CLEAN BUILD database reports a canonical migration history beginning with the W01 clean-build sequence (`w01_identity_tenant_authorization_security_baseline`, `w01_revoke_trigger_function_execute`, etc.) and continuing through W02–W10, journey/runtime hardening, payments, participant access and release gates.

The current GitHub `main` migration directory is not a complete replay source for that live history. It contains an older migration lineage starting on 2026-08-10/11 plus later hardening migrations, while many canonical CLEAN BUILD migration versions/names reported by Supabase are absent from the repository migration directory.

Therefore, replaying the current GitHub migration folder into STAGING would not be a safe or deterministic reconstruction of CLEAN BUILD.

## Compatibility decision

**BASELINE REPLAY FROM CURRENT GITHUB MIGRATIONS: NO-GO.**

This is not a V3.1 defect. It is migration provenance drift between the live CLEAN BUILD database and the repository migration folder.

## Required remediation before V3.1

Create a canonical baseline artifact from the live CLEAN BUILD schema (schema-only, no production data), version it in GitHub, and apply that baseline artifact to STAGING. The artifact must preserve:

- schemas and enum types;
- tables, columns, constraints, indexes and triggers;
- `public` and `app_private` functions;
- RLS enablement and all policies;
- grants/revokes and SECURITY DEFINER boundaries;
- auth-facing triggers/contracts required by the application;
- exact operation/tenant/access contracts used by the current frontend.

After applying the canonical baseline, rerun the structural inventory and require parity on the following minimum gates before any V3.1 migration:

1. 68 public base tables;
2. 68/68 public tables with RLS enabled;
3. 91 public RLS policies;
4. 63 public enum types;
5. expected `public` + `app_private` function surface;
6. key access helpers present (`current_profile_id`, `has_tenant_role`, W10 effective-access helpers);
7. zero V3.1 Achievement/Operational Excellence objects before the V3.1 pack is applied.

## Gate status

- New STAGING project: PASS
- Staging health: PASS
- Legacy sandbox isolation: PASS
- Baseline provenance audit: PASS
- Direct baseline replay from repository: FAIL / blocked by provenance drift
- Canonical CLEAN BUILD baseline artifact: REQUIRED
- V3.1 Migration Pack: NOT STARTED

## Release rule

Do not point B6.3 preview to STAGING and do not apply any V3.1 migration until baseline parity is proven.
