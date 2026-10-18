#!/usr/bin/env python3
"""Two independent psql sessions, synthetic data and a disposable DB only."""
import os
import subprocess
import threading
import time

assert os.environ.get("PGDATABASE") == "supplier_security", "Refusing non-disposable database"
BASE = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-q", "-At"]
TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
QUOTE = "a2000000-0000-0000-0000-000000000001"
OP1 = "a0000000-0000-0000-0000-000000000001"
OP2 = "a0000000-0000-0000-0000-000000000002"
SUP = "a1000000-0000-0000-0000-000000000001"

def sql(stmt):
    return subprocess.run(BASE + ["-c", stmt], text=True, capture_output=True, timeout=15)

def check_integrity():
    query = """select count(*) from public.supplier_documents d
      left join public.operations o on o.id=d.operation_id
      left join public.suppliers s on s.id=d.supplier_id
      left join public.operation_quotes q on q.id=d.quote_id
      where o.tenant_id is distinct from d.tenant_id
         or s.tenant_id is distinct from d.tenant_id
         or (d.quote_id is not null and
           (q.tenant_id is distinct from d.tenant_id
           or q.operation_id is distinct from d.operation_id
           or q.supplier_id is distinct from d.supplier_id))"""
    result = sql(query)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "0", f"INTEGRITY VIOLATION: {result.stdout.strip()} inconsistent documents"

# Both orderings for every parent relation. A real OS process + connection per session.
# Parent rows are changed to the other tenant while a document is inserted.
# PostgreSQL should reject one operation, never accept an inconsistent final state.
OTHER_TENANT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
cases = [
    ("quote_operation", "UPDATE public.operation_quotes SET operation_id='" + OP2 + "' WHERE id='" + QUOTE + "'", "UPDATE public.operation_quotes SET operation_id='" + OP1 + "' WHERE id='" + QUOTE + "'"),
    ("operation_tenant", "UPDATE public.operations SET tenant_id='" + OTHER_TENANT + "' WHERE id='" + OP1 + "'", "UPDATE public.operations SET tenant_id='" + TENANT + "' WHERE id='" + OP1 + "'"),
    ("supplier_tenant", "UPDATE public.suppliers SET tenant_id='" + OTHER_TENANT + "' WHERE id='" + SUP + "'", "UPDATE public.suppliers SET tenant_id='" + TENANT + "' WHERE id='" + SUP + "'"),
]
for kind, parent_sql, restore_sql in cases:
    for order in ("document_first","parent_first"):
        reset = sql("DELETE FROM public.supplier_documents; " + restore_sql + ";")
        assert reset.returncode == 0, reset.stderr
        insert = f"""BEGIN; SET LOCAL lock_timeout = '7s'; SET LOCAL statement_timeout='10s';
            INSERT INTO public.supplier_documents
            (tenant_id,operation_id,quote_id,supplier_id,document_type,title)
            VALUES('{TENANT}','{OP1}','{QUOTE}','{SUP}','contract','Synthetic concurrent');
            SELECT pg_sleep(1.5); COMMIT;"""
        parent = f"""BEGIN; SET LOCAL lock_timeout = '7s'; SET LOCAL statement_timeout='10s';
            {parent_sql}; SELECT pg_sleep(1.5); COMMIT;"""
        answers = {}
        errors = {}
        def invoke(key, stmt):
            try:
                answers[key] = sql(stmt)
            except Exception as exc:
                errors[key] = str(exc)
        a = threading.Thread(target=invoke,args=("document",insert))
        b = threading.Thread(target=invoke,args=("parent",parent))
        if order == "parent_first":
            b.start()
            time.sleep(0.3)
            a.start()
        else:
            a.start()
            time.sleep(0.3)
            b.start()
        a.join(timeout=16)
        b.join(timeout=16)
        assert not a.is_alive() and not b.is_alive(), f"TIMEOUT: {kind} {order}"
        assert not errors, f"Session exception: {kind} {order}: {errors}"
        for key, result in answers.items():
            assert "deadlock detected" not in result.stderr.lower(), f"DEADLOCK: {kind} {order} {key}"
            assert "canceling statement due to lock timeout" not in result.stderr.lower(), f"LOCK TIMEOUT: {kind} {order} {key}"
            assert "canceling statement due to statement timeout" not in result.stderr.lower(), f"STATEMENT TIMEOUT: {kind} {order} {key}"
        assert not (answers["document"].returncode == 0 and answers["parent"].returncode == 0), f"Unexpected double commit: {kind} {order}"
        check_integrity()
        print(f"PASS {kind} {order}: consistent, document_rc={answers['document'].returncode}, parent_rc={answers['parent'].returncode}",flush=True)
print("PASS concurrent operations/suppliers/quotes: invariants upheld; no deadlocks or timeouts")
