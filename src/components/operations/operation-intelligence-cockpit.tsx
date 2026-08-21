import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bus,
  CalendarDays,
  CheckCircle2,
  MessageSquareText,
  RefreshCw,
  Route,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { isOperationClosed } from "@/lib/operation-lock";

type Intelligence = {
  operation?: { status?: string };
  journey?: {
    total_steps?: number;
    completed_steps?: number;
    active_steps?: number;
    pending_steps?: number;
    progress_percent?: number;
    current_step?: { id?: string; title?: string } | null;
    next_step?: { id?: string; title?: string } | null;
  };
  passengers?: {
    confirmed?: number;
    current_step?: { unresolved?: number };
    effective_facts?: { present?: number; boarded?: number; no_show?: number };
  };
  mobility?: { legs?: Array<{ state?: { dispatch_state?: string } }> };
  events?: { total?: number; completed?: number };
  communications?: { recipients?: number; read?: number; read_rate_percent?: number };
  incidents?: { total?: number };
  health?: { level?: "green" | "yellow" | "red"; reasons?: Array<{ code?: string }> };
};

type ParticipantSummary = {
  expected: number;
  confirmed: number;
};

const n = (value: number | null | undefined) => value ?? 0;
const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  attention = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  attention?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        attention
          ? "border-warning/35 bg-warning-soft/70"
          : "border-border/70 bg-background/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <Icon className={`size-4 ${attention ? "text-warning" : "text-primary"}`} aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function CompactFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/45 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function OperationIntelligenceCockpit({ operationId }: { operationId: string }) {
  const location = useLocation();
  const { locale } = useI18n();
  const path = `/operations/${operationId}`;
  const isOverview = location.pathname === path || location.pathname === `${path}/`;

  const operation = useQuery({
    queryKey: ["operation-status", operationId],
    enabled: isOverview,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("status")
        .eq("id", operationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const operationClosed = isOperationClosed(operation.data?.status);

  const query = useQuery({
    queryKey: ["operation-intelligence", operationId],
    enabled: isOverview && operation.isSuccess,
    refetchInterval: isOverview && operation.isSuccess && !operationClosed ? 30_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_operation_intelligence", {
        _operation_id: operationId,
      });
      if (error) throw error;
      return data as Intelligence;
    },
  });

  const participantSummary = useQuery({
    queryKey: ["operation-participant-summary", operationId],
    enabled: isOverview && operation.isSuccess,
    refetchInterval: isOverview && operation.isSuccess && !operationClosed ? 30_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operation_participations")
        .select("status")
        .eq("operation_id", operationId)
        .eq("participation_kind", "participant")
        .neq("status", "cancelled");
      if (error) throw error;

      return (data ?? []).reduce<ParticipantSummary>(
        (summary, row) => {
          if (row.status === "expected") summary.expected += 1;
          if (row.status === "confirmed") summary.confirmed += 1;
          return summary;
        },
        { expected: 0, confirmed: 0 },
      );
    },
  });

  if (!isOverview) return null;

  if (operation.isLoading) {
    return <div className="surface-panel h-48 animate-pulse" aria-label="Carregando resumo operacional" />;
  }

  if (operation.isError) {
    return (
      <section className="surface-panel p-4" role="alert">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">
              {copy(locale, "Não foi possível confirmar a operação.", "Could not confirm operation.")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {copy(locale, "Atualize a página e tente novamente.", "Refresh the page and try again.")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (operationClosed) {
    const completed = operation.data?.status === "completed";
    return (
      <section className="surface-panel p-4" role="status">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">
              {completed
                ? copy(locale, "Operação concluída.", "Operation completed.")
                : copy(locale, "Operação encerrada.", "Operation closed.")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {copy(
                locale,
                "O resumo ao vivo foi encerrado. Os fatos continuam disponíveis no histórico da operação.",
                "The live summary is closed. Recorded facts remain available in operation history.",
              )}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (query.isLoading || query.isPending) {
    return <div className="surface-panel h-48 animate-pulse" aria-label="Carregando resumo operacional" />;
  }

  if (query.isError || !query.data) {
    return (
      <section className="surface-panel p-4" role="alert">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">
                {copy(locale, "Resumo operacional indisponível.", "Operational summary unavailable.")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {copy(
                  locale,
                  "Os dados atuais não puderam ser confirmados. Atualize antes de tomar uma decisão operacional.",
                  "Current data could not be confirmed. Refresh before making an operational decision.",
                )}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw
              className={`mr-1 size-3.5 ${query.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {copy(locale, "Atualizar", "Refresh")}
          </Button>
        </div>
      </section>
    );
  }

  const data = query.data;
  const journey = data.journey;
  const passengers = data.passengers;
  const roster = participantSummary.data;
  const confirmedPassengers = n(passengers?.confirmed);
  const expectedPassengers = n(roster?.expected);
  const legs = data.mobility?.legs ?? [];
  const arrived = legs.filter((leg) => leg.state?.dispatch_state === "arrived").length;
  const incidents = n(data.incidents?.total);
  const unresolved = n(passengers?.current_step?.unresolved);
  const health = data.health?.level ?? "green";
  const healthLabel =
    health === "red"
      ? copy(locale, "Crítica", "Critical")
      : health === "yellow"
        ? copy(locale, "Atenção", "Attention")
        : copy(locale, "Sob controle", "Under control");
  const healthClass =
    health === "red"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : health === "yellow"
        ? "border-warning/40 bg-warning-soft text-warning"
        : "border-success/40 bg-success-soft text-success";

  const travelerDetail = participantSummary.isError
    ? copy(locale, "confirmados na operação", "confirmed in operation")
    : copy(
        locale,
        `${confirmedPassengers} confirmados · ${expectedPassengers} previstos`,
        `${confirmedPassengers} confirmed · ${expectedPassengers} expected`,
      );

  return (
    <section className="surface-panel overflow-hidden" aria-label={copy(locale, "Resumo da operação", "Operation summary")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 bg-primary-soft/30 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            COBS Operational Summary
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {copy(locale, "Resumo da operação", "Operation summary")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy(
              locale,
              "O que está acontecendo agora e onde a equipe precisa agir.",
              "What is happening now and where the team needs to act.",
            )}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${healthClass}`}>
          {healthLabel}
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Users}
            label={copy(locale, "Viajantes", "Travelers")}
            value={String(confirmedPassengers)}
            detail={travelerDetail}
          />
          <Metric
            icon={Route}
            label={copy(locale, "Jornada", "Journey")}
            value={`${Math.round(n(journey?.progress_percent))}%`}
            detail={`${n(journey?.completed_steps)}/${n(journey?.total_steps)} ${copy(locale, "etapas concluídas", "steps completed")}`}
          />
          <Metric
            icon={Activity}
            label={copy(locale, "Pendências agora", "Pending now")}
            value={String(unresolved)}
            detail={copy(locale, "pessoas ainda não resolvidas na etapa", "people unresolved in current step")}
            attention={unresolved > 0}
          />
          <Metric
            icon={incidents > 0 ? AlertTriangle : CheckCircle2}
            label={copy(locale, "Ocorrências", "Incidents")}
            value={String(incidents)}
            detail={
              incidents > 0
                ? copy(locale, "exigem acompanhamento", "require attention")
                : copy(locale, "nenhuma ocorrência registrada", "no incidents recorded")
            }
            attention={incidents > 0}
          />
        </div>

        <div className="rounded-xl border border-primary/25 bg-primary-soft/15 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                {copy(locale, "Agora", "Now")}
              </p>
              <p className="mt-1 text-lg font-semibold">
                {journey?.current_step?.title ?? copy(locale, "Nenhuma etapa ativa", "No active step")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {journey?.next_step?.title
                  ? `${copy(locale, "Próxima", "Next")}: ${journey.next_step.title}`
                  : copy(locale, "Sem próxima etapa definida", "No next step defined")}
              </p>
            </div>
            <Button asChild className="min-h-11 shrink-0">
              <Link to="/operations/$operationId/live" params={{ operationId }}>
                {copy(locale, "Abrir operação ao vivo", "Open live operation")}
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <CompactFact
            label={copy(locale, "Presentes", "Present")}
            value={String(n(passengers?.effective_facts?.present))}
          />
          <CompactFact
            label={copy(locale, "Embarcados", "Boarded")}
            value={String(n(passengers?.effective_facts?.boarded))}
          />
          <CompactFact label="No-show" value={String(n(passengers?.effective_facts?.no_show))} />
          <CompactFact
            label={copy(locale, "Mobilidade", "Mobility")}
            value={`${arrived}/${legs.length}`}
          />
          <CompactFact
            label={copy(locale, "Eventos", "Events")}
            value={`${n(data.events?.completed)}/${n(data.events?.total)}`}
          />
          <CompactFact
            label={copy(locale, "Leitura avisos", "Message reads")}
            value={`${Math.round(n(data.communications?.read_rate_percent))}%`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Bus className="size-3.5" aria-hidden="true" />
            {arrived}/{legs.length} {copy(locale, "deslocamentos concluídos", "movements arrived")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {n(journey?.active_steps)} {copy(locale, "etapa ativa", "active step")} · {n(journey?.pending_steps)} {copy(locale, "pendentes", "pending")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageSquareText className="size-3.5" aria-hidden="true" />
            {n(data.communications?.read)}/{n(data.communications?.recipients)} {copy(locale, "leituras", "reads")}
          </span>
        </div>
      </div>
    </section>
  );
}
