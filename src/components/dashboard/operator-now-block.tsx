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
      <section className="surface-panel overflow-hidden p-5 lg:p-6" aria-busy="true">
        <div className="animate-pulse space-y-4">
          <div className="h-3 w-24 rounded-full bg-muted" />
          <div className="h-7 w-2/3 max-w-sm rounded-lg bg-muted" />
          <div className="h-4 w-1/2 max-w-xs rounded bg-muted" />
          <div className="flex gap-2 pt-1">
            <div className="h-10 w-32 rounded-lg bg-muted" />
            <div className="h-10 w-28 rounded-lg bg-muted" />
          </div>
        </div>
      </section>
    );
  }

  if (operationsQuery.isError || !operationsQuery.data) {
    return (
      <section className="surface-panel border-destructive/30 p-5 lg:p-6" role="alert">
        <p className="font-semibold text-foreground">Não foi possível identificar a operação atual.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tente novamente para atualizar o estado operacional.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 min-h-10"
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
      <section className="surface-panel overflow-hidden border-primary/30 p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-primary">
                <Activity className="size-4" aria-hidden="true" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">
                  Operação em execução
                </span>
              </span>
              {active.length > 1 ? (
                <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  +{active.length - 1} ativa{active.length - 1 === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <h3 className="break-words text-2xl font-semibold leading-tight lg:text-3xl">
                {current.name}
              </h3>
              <span className="rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                {STATUS_LABEL[current.status]}
              </span>
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              {formatDateTime(current.planned_start)} → {formatDateTime(current.planned_end)}
            </p>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              Acompanhe a execução ao vivo ou abra a operação para acessar os demais módulos.
            </p>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[292px]">
            <Button asChild className="min-h-11 w-full">
              <Link to="/operations/$operationId/live" params={{ operationId: current.id }}>
                Abrir Ao Vivo
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 w-full">
              <Link to="/operations/$operationId" params={{ operationId: current.id }}>
                Abrir operação
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
            <CalendarClock className="size-4" aria-hidden="true" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">
              Estado operacional
            </p>
          </div>
          <h3 className="mt-3 text-xl font-semibold lg:text-2xl">Operação em ordem neste momento</h3>
          {next ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Próxima: <span className="font-medium text-foreground">{next.name}</span> · {formatDateTime(next.planned_start)} · {STATUS_LABEL[next.status]}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhuma operação em execução ou próxima operação confirmada neste recorte.
            </p>
          )}
        </div>

        <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[292px]">
          {next ? (
            <Button asChild className="min-h-11 w-full">
              <Link to="/operations/$operationId" params={{ operationId: next.id }}>
                Abrir próxima operação
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link to="/operations">Ver operações</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
