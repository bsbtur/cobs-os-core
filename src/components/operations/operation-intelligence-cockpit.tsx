import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BedDouble, Bus, CalendarDays, MessageSquare, RefreshCw, Users, WalletCards } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Intelligence = {
  operation?: { status?: string };
  journey?: {
    total_steps?: number;
    completed_steps?: number;
    active_steps?: number;
    pending_steps?: number;
    progress_percent?: number;
    current_step?: { title?: string } | null;
    next_step?: { title?: string } | null;
  };
  passengers?: {
    confirmed?: number;
    current_step?: { unresolved?: number };
    effective_facts?: { present?: number; boarded?: number; no_show?: number };
  };
  mobility?: { legs?: Array<{ state?: { dispatch_state?: string } }> };
  hospitality?: { stays?: Array<{ guests?: number; checked_in?: number; issues?: number }> };
  events?: { total?: number; completed?: number; total_sessions?: number; completed_sessions?: number };
  communications?: { recipients?: number; read?: number; read_rate_percent?: number };
  commerce?: { currency?: string | null; net_paid_minor?: number; outstanding_minor?: number };
  incidents?: { total?: number };
  health?: { level?: "green" | "yellow" | "red"; reasons?: Array<{ code?: string }> };
};

type Rpc = (
  fn: "get_operation_intelligence",
  args: { _operation_id: string },
) => PromiseLike<{ data: unknown; error: unknown }>;

const n = (value: number | null | undefined) => value ?? 0;

function money(value: number | null | undefined, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n(value) / 100);
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function OperationIntelligenceCockpit({ operationId }: { operationId: string }) {
  const location = useLocation();
  const path = `/operations/${operationId}`;
  const isOverview = location.pathname === path || location.pathname === `${path}/`;

  const query = useQuery({
    queryKey: ["operation-intelligence", operationId],
    enabled: isOverview,
    refetchInterval: isOverview ? 30_000 : false,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as Rpc;
      const { data, error } = await rpc("get_operation_intelligence", { _operation_id: operationId });
      if (error) throw error;
      return data as Intelligence;
    },
  });

  if (!isOverview) return null;
  if (query.isLoading) return <div className="surface-panel h-36 animate-pulse" aria-label="Carregando cockpit operacional" />;
  if (query.isError || !query.data) {
    return (
      <section className="surface-panel p-4" role="alert">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Cockpit operacional indisponível.</p>
              <p className="mt-1 text-xs text-muted-foreground">Os dados atuais não puderam ser confirmados. Tente atualizar antes de tomar uma decisão operacional.</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-1 size-3.5 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            Atualizar
          </Button>
        </div>
      </section>
    );
  }

  const data = query.data;
  const journey = data.journey;
  const passengers = data.passengers;
  const legs = data.mobility?.legs ?? [];
  const stays = data.hospitality?.stays ?? [];
  const arrived = legs.filter((leg) => leg.state?.dispatch_state === "arrived").length;
  const guests = stays.reduce((sum, stay) => sum + n(stay.guests), 0);
  const checkedIn = stays.reduce((sum, stay) => sum + n(stay.checked_in), 0);
  const issues = stays.reduce((sum, stay) => sum + n(stay.issues), 0);
  const health = data.health?.level ?? "green";
  const healthLabel = health === "red" ? "Crítica" : health === "yellow" ? "Atenção" : "Saudável";
  const healthClass = health === "red"
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : health === "yellow"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  const currency = data.commerce?.currency ?? "BRL";

  return (
    <section className="surface-panel overflow-hidden" aria-label="Cockpit da operação">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 bg-primary-soft/30 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">COBS Operational Intelligence</p>
          <h2 className="mt-1 text-xl font-semibold">Cockpit da operação</h2>
          <p className="mt-1 text-sm text-muted-foreground">Estado operacional consolidado em uma única visão.</p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${healthClass}`}>{healthLabel}</span>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Activity} label="Jornada" value={`${n(journey?.progress_percent)}%`} detail={`${n(journey?.completed_steps)}/${n(journey?.total_steps)} etapas concluídas`} />
          <Metric icon={Users} label="Viajantes" value={String(n(passengers?.confirmed))} detail={`${n(passengers?.current_step?.unresolved)} pendente(s) agora`} />
          <Metric icon={MessageSquare} label="Comunicação" value={`${n(data.communications?.read_rate_percent)}%`} detail={`${n(data.communications?.read)}/${n(data.communications?.recipients)} leituras`} />
          <Metric icon={WalletCards} label="Financeiro" value={money(data.commerce?.net_paid_minor, currency)} detail={`${money(data.commerce?.outstanding_minor, currency)} pendente`} />
        </div>

        <div className="rounded-xl border border-border/70 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Agora</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Etapa atual</p><p className="font-medium">{journey?.current_step?.title ?? (data.operation?.status === "completed" ? "Operação concluída" : "Nenhuma etapa ativa")}</p></div>
            <div><p className="text-xs text-muted-foreground">Próxima etapa</p><p className="font-medium">{journey?.next_step?.title ?? "Sem próxima etapa"}</p></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{n(journey?.active_steps)} ativa(s) · {n(journey?.pending_steps)} pendente(s) · {n(data.incidents?.total)} incidente(s)</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Bus} label="Mobilidade" value={`${arrived}/${legs.length}`} detail="deslocamentos que chegaram" />
          <Metric icon={BedDouble} label="Hospedagem" value={`${checkedIn}/${guests}`} detail={issues ? `${issues} pendência(s)` : `${stays.length} hospedagem(ns)`} />
          <Metric icon={CalendarDays} label="Eventos" value={`${n(data.events?.completed)}/${n(data.events?.total)}`} detail={`${n(data.events?.completed_sessions)}/${n(data.events?.total_sessions)} sessões concluídas`} />
          <Metric icon={Users} label="Presença efetiva" value={String(n(passengers?.effective_facts?.present))} detail={`${n(passengers?.effective_facts?.boarded)} embarcado(s) · ${n(passengers?.effective_facts?.no_show)} no-show`} />
        </div>
      </div>
    </section>
  );
}
