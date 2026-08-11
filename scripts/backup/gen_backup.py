#!/usr/bin/env python3
"""COBS OS · M5 — logical backup generator (READ-ONLY against production).

Catalog-faithful restore artifact in pg_dump-compatible order:
  01_pre : roles, schemas, extensions, auth STUB, enums, sequences, tables, functions
  02_data: COPY data for every public/app_private table
  03_post: constraints, indexes, triggers, RLS + policies, grants, publications

No production write. No secret value read or emitted. auth.* is provider-managed:
only a non-PII identity-linkage stub is reproduced (documented as UNVERIFIED).
"""
import subprocess, os, json, hashlib

OUTDIR = "/tmp/m5"
os.makedirs(OUTDIR, exist_ok=True)


def rows(sql):
    """Return list of dicts; JSON transport keeps newlines/quotes intact."""
    wrapped = f"select coalesce(json_agg(t), '[]'::json)::text from ({sql}) t"
    r = subprocess.run(["psql", "-Atq", "-c", wrapped], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return json.loads(r.stdout.strip() or "[]")


pre, post = [], []
pre.append("-- COBS OS M5 logical backup artifact (catalog-derived). NO SECRETS.\n"
           "set check_function_bodies = off;\nset client_min_messages = warning;\n")

for r in rows("""select rolname from pg_roles where rolname in
 ('anon','authenticated','service_role','authenticator','postgres','supabase_admin',
  'supabase_auth_admin','supabase_storage_admin','dashboard_user') order by 1"""):
    n = r["rolname"]
    pre.append(f"do $$ begin if not exists (select 1 from pg_roles where rolname='{n}') "
               f"then create role \"{n}\" nologin noinherit; end if; end $$;")

for s in ("public", "app_private", "extensions", "auth"):
    pre.append(f'create schema if not exists "{s}";')
for r in rows("""select e.extname, n.nspname from pg_extension e
 join pg_namespace n on n.oid=e.extnamespace
 where e.extname in ('pgcrypto','uuid-ossp','btree_gist')"""):
    pre.append(f'create extension if not exists "{r["extname"]}" with schema "{r["nspname"]}";')

pre.append("""
-- AUTH STUB — the provider-managed auth schema cannot be exported or restored by
-- this procedure. Only the identity-linkage surface is reproduced, with NO PII:
-- no e-mail, no password hash, no token. This branch is UNVERIFIED by design.
create table if not exists auth.users (
  id uuid primary key,
  email_fingerprint text,
  email_confirmed boolean,
  created_at timestamptz
);
-- Supabase resolves identity from the request.jwt.claims JSON first and only
-- falls back to the legacy flat GUCs; the stub must match, otherwise every RLS
-- policy silently evaluates to false on the restored copy (defect DEF-M5-002).
create or replace function auth.uid() returns uuid language sql stable as
  $fn$ select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid $fn$;
create or replace function auth.role() returns text language sql stable as
  $fn$ select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $fn$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $fn$;

grant usage on schema auth to anon, authenticated, service_role;
""")

for r in rows("""select n.nspname nsp, t.typname tn,
   string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder) labels
 from pg_type t join pg_namespace n on n.oid=t.typnamespace
 join pg_enum e on e.enumtypid=t.oid
 where n.nspname in ('public','app_private') and t.typtype='e' group by 1,2 order by 1,2"""):
    pre.append(f'create type "{r["nsp"]}"."{r["tn"]}" as enum ({r["labels"]});')

for r in rows("""select n.nspname nsp, t.typname tn,
   string_agg(format('%I %s', a.attname, format_type(a.atttypid,a.atttypmod)), ', ' order by a.attnum) d
 from pg_type t join pg_namespace n on n.oid=t.typnamespace
 join pg_class c on c.oid=t.typrelid
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 where n.nspname in ('public','app_private') and t.typtype='c' and c.relkind='c'
 group by 1,2 order by 1,2"""):
    pre.append(f'create type "{r["nsp"]}"."{r["tn"]}" as ({r["d"]});')

for r in rows("""select schemaname nsp, sequencename sn from pg_sequences
 where schemaname in ('public','app_private')"""):
    pre.append(f'create sequence if not exists "{r["nsp"]}"."{r["sn"]}";')

tables = rows("""select n.nspname nsp, c.relname tbl from pg_class c
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','app_private') and c.relkind='r' order by 1,2""")
allcols = rows("""select n.nspname nsp, c.relname tbl, a.attname col,
   format_type(a.atttypid,a.atttypmod) typ, a.attnotnull nn,
   pg_get_expr(d.adbin,d.adrelid) dflt, a.attnum
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 where n.nspname in ('public','app_private') and c.relkind='r'
 order by 1,2,a.attnum""")
for t in tables:
    cols = [c for c in allcols if c["nsp"] == t["nsp"] and c["tbl"] == t["tbl"]]
    defs = []
    for c in cols:
        line = f'  "{c["col"]}" {c["typ"]}'
        if c["dflt"]:
            line += f' default {c["dflt"]}'
        if c["nn"]:
            line += " not null"
        defs.append(line)
    pre.append(f'create table "{t["nsp"]}"."{t["tbl"]}" (\n' + ",\n".join(defs) + "\n);")

funcs = rows("""select pg_get_functiondef(p.oid) def
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','app_private') and p.prokind in ('f','p')
 order by n.nspname, p.proname, p.oid""")
for f in funcs:
    pre.append(f["def"].rstrip().rstrip(";") + ";")

# ---------------- post-data ----------------
post.append("set client_min_messages = warning;")
for r in rows("""select n.nspname nsp, c.relname tbl, con.conname cn,
   pg_get_constraintdef(con.oid) d, con.contype
 from pg_constraint con join pg_class c on c.oid=con.conrelid
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','app_private')
 order by case con.contype when 'p' then 1 when 'u' then 2 when 'c' then 3 else 4 end, 1,2,3"""):
    post.append(f'alter table "{r["nsp"]}"."{r["tbl"]}" add constraint "{r["cn"]}" {r["d"]};')

for r in rows("""select i.indexdef d from pg_indexes i
 where i.schemaname in ('public','app_private')
   and not exists (select 1 from pg_constraint c
                   where c.conname=i.indexname
                     and c.connamespace=i.schemaname::regnamespace)
 order by i.schemaname, i.tablename, i.indexname"""):
    post.append(r["d"] + ";")

for r in rows("""select pg_get_triggerdef(tg.oid) d
 from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','app_private') and not tg.tgisinternal
 order by n.nspname, c.relname, tg.tgname"""):
    post.append(r["d"] + ";")

for r in rows("""select n.nspname nsp, c.relname tbl, c.relrowsecurity rls, c.relforcerowsecurity frls
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','app_private') and c.relkind='r' order by 1,2"""):
    if r["rls"]:
        post.append(f'alter table "{r["nsp"]}"."{r["tbl"]}" enable row level security;')
    if r["frls"]:
        post.append(f'alter table "{r["nsp"]}"."{r["tbl"]}" force row level security;')

for r in rows("""select schemaname nsp, tablename tbl, policyname pn, permissive perm,
   array_to_string(roles, ',') rls_roles, cmd, qual, with_check
 from pg_policies where schemaname in ('public','app_private')
 order by 1,2,3"""):
    stmt = (f'create policy "{r["pn"]}" on "{r["nsp"]}"."{r["tbl"]}" '
            f'as {"permissive" if r["perm"].lower().startswith("perm") else "restrictive"} '
            f'for {r["cmd"].lower() if r["cmd"] != "ALL" else "all"} '
            f'to {r["rls_roles"].strip("{}")}')
    if r["qual"]:
        stmt += f' using ({r["qual"]})'
    if r["with_check"]:
        stmt += f' with check ({r["with_check"]})'
    post.append(stmt + ";")

post.append("-- schema + default ACLs")
for r in rows("""select nspname, coalesce(array_to_string(nspacl,'|'),'') acl
 from pg_namespace where nspname in ('public','app_private','extensions')"""):
    for entry in [e for e in r["acl"].split("|") if e]:
        grantee, rest = entry.split("=", 1)
        privs, _ = rest.split("/", 1)
        if not grantee:
            continue
        m = {"U": "usage", "C": "create"}
        p = ", ".join(m[c] for c in privs if c in m)
        if p:
            post.append(f'grant {p} on schema "{r["nspname"]}" to "{grantee}";')

# Table ACLs are read from pg_class.relacl: information_schema.role_table_grants
# only shows grants the *current* role participates in, which silently produced a
# grant-less restore artifact on the first drill iteration (defect DEF-M5-001).
ACL_LETTERS = {"r": "select", "a": "insert", "w": "update", "d": "delete",
               "D": "truncate", "x": "references", "t": "trigger", "m": "maintain"}
for r in rows("""select n.nspname nsp, c.relname tbl, acl::text entry
 from pg_class c join pg_namespace n on n.oid=c.relnamespace,
      lateral unnest(coalesce(c.relacl, '{}'::aclitem[])) a(acl)
 where n.nspname in ('public','app_private') and c.relkind='r'
 order by 1,2,3"""):
    grantee, rest = r["entry"].split("=", 1)
    privs = rest.split("/", 1)[0]
    names = ", ".join(ACL_LETTERS[c] for c in privs if c in ACL_LETTERS)
    if not names:
        continue
    target = "public" if not grantee else f'"{grantee}"'
    post.append(f'grant {names} on table "{r["nsp"]}"."{r["tbl"]}" to {target};')

post.append('revoke all on all functions in schema "public" from public;')
post.append('revoke all on all functions in schema "app_private" from public;')
post.append('revoke all on all functions in schema "app_private" from anon, authenticated;')
for r in rows("""select n.nspname nsp, p.oid::regprocedure::text sig,
   coalesce(array_to_string(p.proacl,'|'),'') acl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','app_private') order by 1,2"""):
    for entry in [e for e in r["acl"].split("|") if e]:
        grantee, rest = entry.split("=", 1)
        privs, _ = rest.split("/", 1)
        if "X" not in privs:
            continue
        target = "public" if not grantee else f'"{grantee}"'
        post.append(f'grant execute on function {r["sig"]} to {target};')

post.append("-- realtime publication membership")
for r in rows("""select p.pubname, n.nspname nsp, c.relname tbl
 from pg_publication p join pg_publication_rel pr on pr.prpubid=p.oid
 join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','app_private') order by 1,2,3"""):
    post.append(f"do $$ begin if not exists (select 1 from pg_publication where pubname='{r['pubname']}') "
                f"then create publication \"{r['pubname']}\"; end if; end $$;")
    post.append(f'alter publication "{r["pubname"]}" add table "{r["nsp"]}"."{r["tbl"]}";')

open(f"{OUTDIR}/01_pre.sql", "w").write("\n".join(pre) + "\n")
open(f"{OUTDIR}/03_post.sql", "w").write("\n".join(post) + "\n")

# ---------------- data ----------------
os.makedirs(f"{OUTDIR}/data", exist_ok=True)
manifest = []
data_sql = ["set session_replication_role = origin;  -- triggers are NOT disabled"]
for t in tables:
    nsp, tbl = t["nsp"], t["tbl"]
    if True:
        colnames = [c["col"] for c in allcols if c["nsp"] == nsp and c["tbl"] == tbl]
        cols = ",".join(f'"{c}"' for c in colnames)
        sel = f'select {cols} from "{nsp}"."{tbl}"'
    path = f"{OUTDIR}/data/{nsp}.{tbl}.tsv"
    r = subprocess.run(["psql", "-Atq", "-c", f"copy ({sel}) to stdout"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{nsp}.{tbl}: {r.stderr.strip()}")
    open(path, "w").write(r.stdout)
    n = len([l for l in r.stdout.split("\n") if l != ""])
    manifest.append({"table": f"{nsp}.{tbl}", "rows": n,
                     "sha256": hashlib.sha256(r.stdout.encode()).hexdigest()})
    if n:
        data_sql.append(f'\\copy "{nsp}"."{tbl}" ({cols}) from {path}')

open(f"{OUTDIR}/02_data.sql", "w").write("\n".join(data_sql) + "\n")
open(f"{OUTDIR}/manifest.json", "w").write(json.dumps(manifest, indent=1))
print("tables:", len(tables), "functions:", len(funcs),
      "rows_total:", sum(m["rows"] for m in manifest),
      "nonempty:", [m["table"] for m in manifest if m["rows"]])
