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

# Run both commit orders. In insert-first case A holds uncommitted document while
# B updates the parent. Distinct psql subprocesses = distinct server connections.
scenarios = [
    ("document_first", 1.8, 0.2),
    ("parent_first", 0.2, 1.8),
]
for name, a_delay, b_delay in scenarios:
    reset = sql(f"""DELETE FROM public.supplier_documents;
    UPDATE public.operation_quotes SET operation_id='{OP1}' WHERE id='{QUOTE}';""")
    assert reset.returncode == 0, reset.stderr
    insert = f"""BEGIN; INSERT INTO public.supplier_documents
       (tenant_id,operation_id,quote_id,supplier_id,document_type,title)
       VALUES('{TENANT}','{OP1}','{QUOTE}','{SUP}','contract','Synthetic concurrent');
       SELECT pg_sleep({a_delay}); COMMIT;"""
    parent = f"""BEGIN; UPDATE public.operation_quotes SET operation_id='{OP2}'
       WHERE id='{QUOTE}'; SELECT pg_sleep({b_delay}); COMMIT;"""
    answers = {}
    def invoke(key, stmt):
        answers[key] = sql(stmt)
    a = threading.Thread(target=invoke,args=("document",insert))
    b = threading.Thread(target=invoke,args=("parent",parent))
    if name == "parent_first":
        b.start()
        time.sleep(0.35)
        a.start()
    else:
        a.start()
        time.sleep(0.35)
        b.start()
    a.join(timeout=20)
    b.join(timeout=20)
    assert not a.is_alive() and not b.is_alive(), "Concurrent sessions deadlocked or timed out"
    check_integrity()
    print(f"PASS {name}: final database references consistent (document_rc={answers['document'].returncode}, parent_rc={answers['parent'].returncode})",flush=True)
print("PASS concurrent transactions: invariant upheld")
