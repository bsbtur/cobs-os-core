import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";

type OperationStatus = "draft" | "planning" | "ready" | "active" | "completed" | "cancelled";

type OperationRow = {
  id: string;
  name: string;
  status: OperationStatus;
  planned_start: string;
  planned_end: string;
  archived_at: string | null;
};

const STATUS_LABEL: Record<OperationStatus, string> = {
  draft: "Rascunho",
  planning: "Planejamento",
  ready: "Pronto",
  active: "Em execução",
  completed: "Concluída",
  cancelled: "Cancelada",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function OperatorNowBlock() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const operationsQuery = useQuery({
    queryKey: ["operator-now-block", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const result = await supabase
        .from("operations")
        .select("id,name,status,planned_start,planned_end,archived_at")
        .eq("tenant_id", tenantId!);

      if (result.error) throw result.error;

      const operations = (result.data ?? []) as OperationRow[];
      const visible = operations.filter((operation) => !operation.archived_at);
      const active = visible
        .filter((operation) => operation.status === "active")
        .sort(
          (a, b) =>
            new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime(),
        );
      const now = Date.now();
      const upcoming = visible
        .filter(
          (operation) =>
            ["planning", "ready"].includes(operation.status) &&
            new Date(operation.planned_start).getTime() >= now,
        )
        .sort(
          (a, b) =>
            new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime(),
        );

      return {
        active,
        next: upcoming[0] ?? null,
      };
    },
  });

  if (operationsQuery.isLoading) {
    return (
      <section className="surface-panel p-5" aria-busy="true">
        <p className="text-sm text-muted-foreground">Identificando o que está acontecendo agora…</p>
      </section>
    );
  }

  if (operationsQuery.isError || !operationsQuery.data) {
    return (
      <section className="surface-panel border-destructive/30 p-5" role="alert">
        <p className="font-semibold text-destructive">Não foi possível identificar a operação atual.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void operationsQuery.refetch()}
        >
          Tentar novamente
        </Button>
      </section>
    );
  }

  const { active, next } = operationsQuery.data;
  const current = active[0] ?? null;

  if (current) {
    return (
      <section className="surface-panel border-primary/30 p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <Activity className="size-4" />
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">Agora</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h3 className="truncate text-xl font-semibold lg:text-2xl">{current.name}</h3>
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                {STATUS_LABEL[current.status]}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatDateTime(current.planned_start)} → {formatDateTime(current.planned_end)}
            </p>
            {active.length > 1 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Há mais {active.length - 1} operação{active.length - 1 === 1 ? "" : "ões"} em execução.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/operations/$operationId" params={{ operationId: current.id }}>
                Abrir operação
              </Link>
            </Button>
            <Button asChild>
              <Link to="/operations/$operationId/live" params={{ operationId: current.id }}>
                Abrir Ao Vivo
              </Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-panel p-5 lg:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="size-4" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">Agora</p>
          </div>
          <h3 className="mt-3 text-xl font-semibold">Nenhuma operação em execução agora</h3>
          {next ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Próxima: <span className="font-medium text-foreground">{next.name}</span> · {formatDateTime(next.planned_start)} · {STATUS_LABEL[next.status]}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma próxima operação confirmada neste recorte.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {next ? (
            <Button asChild>
              <Link to="/operations/$operationId" params={{ operationId: next.id }}>
                Abrir próxima operação
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/operations">Ver operações</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
