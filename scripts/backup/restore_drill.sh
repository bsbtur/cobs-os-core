#!/usr/bin/env bash
# COBS OS · M5 — repeatable backup + isolated restore drill.
# READ-ONLY against production. Writes only to the local isolated target.
set -euo pipefail

M5=/tmp/m5
PGBIN=/tmp/pg17/bin
TARGET_DB=${1:-cobs_restore1}
LOCAL="$PGBIN/psql -h /tmp/pgrun -p 5433 -U postgres -v ON_ERROR_STOP=1"

echo "== [1/5] generating logical backup artifact from production (read-only)"
GEN_START=$(date +%s.%N)
python3 "$M5/gen_backup.py"

echo "== [2/5] post-processing artifact (index hoist, grantee roles, auth stub rows)"
python3 - <<'PY'
import re
p = '/tmp/m5/03_post.sql'
lines = open(p).read().split('\n')
# FK constraints may reference unique *indexes*, so indexes must precede constraints.
idx = [l for l in lines if l.lower().startswith(('create index', 'create unique index'))]
rest = [l for l in lines if not l.lower().startswith(('create index', 'create unique index'))]
txt = '\n'.join([rest[0]] + idx + rest[1:])
# The isolated target has no Supabase-managed roles; create any grantee we reference.
gr = sorted(set(re.findall(r' to "([a-zA-Z0-9_]+)";', txt)))
hdr = "\n".join(
    f"do $$ begin if not exists (select 1 from pg_roles where rolname='{g}')"
    f" then create role \"{g}\" nologin noinherit; end if; end $$;" for g in gr)
open(p, 'w').write(hdr + "\n" + txt + "\n")
PY
# auth.users rows are captured out-of-band (restricted role cannot read the auth
# schema) and contain NO PII: opaque id + e-mail fingerprint only.
if [ -f "$M5/data/auth.users.tsv" ]; then
  echo "\\copy \"auth\".\"users\" (\"id\",\"email_fingerprint\",\"email_confirmed\",\"created_at\") from $M5/data/auth.users.tsv" >> "$M5/02_data.sql"
fi
GEN_END=$(date +%s.%N)

echo "== [3/5] provisioning isolated restore target: $TARGET_DB"
$PGBIN/dropdb -h /tmp/pgrun -p 5433 -U postgres --if-exists "$TARGET_DB"
$PGBIN/createdb -h /tmp/pgrun -p 5433 -U postgres "$TARGET_DB"

echo "== [4/5] applying artifact"
RES_START=$(date +%s.%N)
for f in 01_pre 02_data 03_post; do
  $LOCAL -d "$TARGET_DB" -q -f "$M5/$f.sql" 2>&1 | grep -iv 'notice\|wal_level\|^HINT' || true
done
RES_END=$(date +%s.%N)

echo "== [5/5] timings"
echo "BACKUP_GENERATION_SECONDS=$(echo "$GEN_END-$GEN_START" | bc)"
echo "RESTORE_APPLY_SECONDS=$(echo "$RES_END-$RES_START" | bc)"
echo "TOTAL_RTO_SECONDS=$(echo "$RES_END-$GEN_START" | bc)"
