import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BedDouble, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";

type OperationRow = {
  id: string;
  name: string;
  status: string;
  planned_end: string;
  archived_at: string | null;
};

type StayRow = {
  id: string;
  operation_id: string;
  status: string;
  planned_check_out: string;
};

type AttentionItem = {
  id: string;
  operationId: string;
  label: string;
  detail: string;
  kind: "operation" | "hospitality";
};

export function OperatorAttentionBlock() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const attentionQuery = useQuery({
    queryKey: ["operator-attention-block", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const [operationsResult, staysResult] = await Promise.all([
        supabase
          .from("operations")
          .select("id,name,status,planned_end,archived_at")
          .eq("tenant_id", tenantId!),
        supabase
          .from("hospitality_stays")
          .select("id,operation_id,status,planned_check_out")
          .eq("tenant_id", tenantId!),
      ]);

      if (operationsResult.error) throw operationsResult.error;
      if (staysResult.error) throw staysResult.error;

      const operations = (operationsResult.data ?? []) as OperationRow[];
      const stays = (staysResult.data ?? []) as StayRow[];
      const visibleOperations = operations.filter((operation) => !operation.archived_at);
      const operationMap = new Map(visibleOperations.map((operation) => [operation.id, operation]));
      const now = Date.now();
      const items: AttentionItem[] = [];

      for (const operation of visibleOperations) {
        if (operation.status === "active" && new Date(operation.planned_end).getTime() < now) {
          items.push({
            id: `operation-${operation.id}`,
            operationId: operation.id,
            label: `${operation.name}: operação ativa após o fim planejado`,
            detail: "Revise o estado da execução e registre o fato operacional correto.",
            kind: "operation",
          });
        }
      }

      for (const stay of stays) {
        if (!["confirmed", "active"].includes(stay.status)) continue;
        if (new Date(stay.planned_check_out).getTime() >= now) continue;

        const operation = operationMap.get(stay.operation_id);
        if (!operation) continue;

        items.push({
          id: `hospitality-${stay.id}`,
          operationId: stay.operation_id,
          label: `${operation.name}: hospedagem aberta após o check-out planejado`,
          detail: "Revise o encerramento da hospedagem e os fatos de check-out.",
          kind: "hospitality",
        });
      }

      return items;
    },
  });

  if (attentionQuery.isLoading) {
    return (
      <section className="surface-panel p-5" aria-busy="true">
        <p className="text-sm text-muted-foreground">Verificando o que precisa da sua atenção…</p>
      </section>
    );
  }

  if (attentionQuery.isError || !attentionQuery.data) {
    return (
      <section className="surface-panel border-destructive/30 p-5" role="alert">
        <p className="font-semibold text-destructive">Não foi possível verificar as atenções operacionais.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void attentionQuery.refetch()}
        >
          Tentar novamente
        </Button>
      </section>
    );
  }

  const items = attentionQuery.data;

  if (items.length === 0) {
    return (
      <section className="surface-panel p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <CheckCircle2 className="size-4" />
          </span>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              Precisa da sua atenção
            </p>
            <h3 className="mt-1 font-semibold">Nenhuma atenção objetiva detectada agora</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              O COBS só mostra aqui regras derivadas de fatos registrados.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-panel border-destructive/20 p-5 lg:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
          <AlertTriangle className="size-4" />
        </span>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-destructive">
            Precisa da sua atenção
          </p>
          <h3 className="mt-1 font-semibold">
            {items.length} atenção{items.length === 1 ? "" : "ões"} operacional{items.length === 1 ? "" : "is"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Alertas determinísticos com acesso direto ao ponto onde o operador pode agir.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {item.kind === "hospitality" ? (
                    <BedDouble className="size-4 text-muted-foreground" />
                  ) : (
                    <Activity className="size-4 text-muted-foreground" />
                  )}
                  <p className="text-sm font-semibold">{item.label}</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/operations/$operationId" params={{ operationId: item.operationId }}>
                    Abrir operação
                  </Link>
                </Button>
                {item.kind === "hospitality" ? (
                  <Button asChild size="sm">
                    <Link
                      to="/operations/$operationId/hospitality"
                      params={{ operationId: item.operationId }}
                    >
                      Abrir hospedagem
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link
                      to="/operations/$operationId/live"
                      params={{ operationId: item.operationId }}
                    >
                      Abrir Ao Vivo
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
