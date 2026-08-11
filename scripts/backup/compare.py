#!/usr/bin/env python3
"""COBS OS · M5 — deterministic structural fingerprint (source vs restored target)."""
import subprocess, hashlib, json, sys

LOCAL = ["/tmp/pg17/bin/psql", "-h", "/tmp/pgrun", "-p", "5433", "-U", "postgres", "-d"]

DIMS = {
 "columns": """select n.nspname||'.'||c.relname||'.'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)
   ||'|'||a.attnotnull::text||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'-')
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 where n.nspname in ('public','app_private') and c.relkind='r'""",
 "constraints": """select n.nspname||'.'||c.relname||'.'||con.conname||'|'||pg_get_constraintdef(con.oid)
 from pg_constraint con join pg_class c on c.oid=con.conrelid
 join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private')""",
 "indexes": """select schemaname||'.'||indexname||'|'||indexdef from pg_indexes
 where schemaname in ('public','app_private')""",
 "enums": """select n.nspname||'.'||t.typname||'|'||e.enumlabel||'|'||e.enumsortorder::text
 from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid
 where n.nspname in ('public','app_private')""",
 "functions": """select n.nspname||'.'||p.oid::regprocedure::text||'|secdef='||p.prosecdef::text
   ||'|volatile='||p.provolatile::text||'|cfg='||coalesce(array_to_string(p.proconfig,','),'-')
   ||'|body='||md5(coalesce(p.prosrc,''))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','app_private')""",
 "triggers": """select n.nspname||'.'||c.relname||'.'||tg.tgname||'|'||pg_get_triggerdef(tg.oid)
 from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','app_private') and not tg.tgisinternal""",
 "rls_flags": """select n.nspname||'.'||c.relname||'|rls='||c.relrowsecurity::text||'|force='||c.relforcerowsecurity::text
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','app_private') and c.relkind='r'""",
 "policies": """select schemaname||'.'||tablename||'.'||policyname||'|'||permissive||'|'||array_to_string(roles,',')
   ||'|'||cmd||'|'||coalesce(qual,'-')||'|'||coalesce(with_check,'-')
 from pg_policies where schemaname in ('public','app_private')""",
 "table_grants": """select n.nspname||'.'||c.relname||'|'||split_part(acl::text,'/',1)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace,
      lateral unnest(coalesce(c.relacl, '{}'::aclitem[])) a(acl)
 where n.nspname in ('public','app_private') and c.relkind='r'
   and split_part(acl::text,'=',1) in ('anon','authenticated','service_role')""",
 "function_execute": """select n.nspname||'.'||p.oid::regprocedure::text||'|'||coalesce(array_to_string(p.proacl,'|'),'-')
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private')""",
 "publication": """select p.pubname||'|'||n.nspname||'.'||c.relname
 from pg_publication p join pg_publication_rel pr on pr.prpubid=p.oid
 join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace""",
}


def run(sql, target):
    cmd = ["psql", "-Atq", "-c", sql] if target == "prod" else LOCAL + [target, "-Atq", "-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{target}: {r.stderr.strip()[:300]}")
    return sorted(l for l in r.stdout.split("\n") if l != "")


def norm(rows, dim):
    out = []
    for x in rows:
        # ACL grantor identity is environment-specific (prod owner vs restore owner)
        if dim == "function_execute":
            head, *acl = x.split("|")
            x = "|".join([head] + sorted(p.split("/")[0] for p in acl))
        out.append(x)
    return sorted(out)


src_t = sys.argv[1] if len(sys.argv) > 1 else "prod"
dst_t = sys.argv[2] if len(sys.argv) > 2 else "cobs_restore1"
report, drift_total = [], 0
for dim, sql in DIMS.items():
    a, b = norm(run(sql, src_t), dim), norm(run(sql, dst_t), dim)
    ha, hb = (hashlib.sha256("\n".join(x).encode()).hexdigest()[:16] for x in (a, b))
    only_src, only_dst = sorted(set(a) - set(b)), sorted(set(b) - set(a))
    drift_total += len(only_src) + len(only_dst)
    report.append({"dimension": dim, "source_rows": len(a), "target_rows": len(b),
                   "source_sha256_16": ha, "target_sha256_16": hb,
                   "match": ha == hb, "only_in_source": only_src[:8],
                   "only_in_target": only_dst[:8],
                   "drift": len(only_src) + len(only_dst)})

print(json.dumps({"source": src_t, "target": dst_t, "total_drift": drift_total,
                  "dimensions": report}, indent=1))
