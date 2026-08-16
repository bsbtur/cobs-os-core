import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  LayoutDashboard,
  Radio,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { LiveNextBestAction } from "@/components/journey/live-next-best-action";
import { LiveTimingStrip } from "@/components/journey/live-timing-strip";
import { supabase } from "@/integrations/supabase/client";
import type {
  JourneyStepRow,
  PlaybookExecutionRow,
  PlaybookItemRow,
  RuntimeState,
} from "@/lib/w04";

export const Route = createFileRoute("/_authenticated/operations/$operationId/cockpit-v2")({
  head: () => ({
    meta: [
      { title: "Cockpit UX V2 — COBS OS" },
      {
        name: "description",
        content: "Preview mobile-first do cockpit operacional COBS OS.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CockpitV2Preview,
});

type RosterRow = {
  id: string;
  participation_kind: string;
  status: string;
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function CockpitV2Preview() {
  const { operationId } = useParams({
    from: "/_authenticated/operations/$operationId/cockpit-v2",
  });

  const live = useQuery({
    queryKey: ["cockpit-v2", operationId],
    refetchInterval: 20_000,
    queryFn: async () => {
      const [operation, steps, state, items, executions, roster] = await Promise.all([
        supabase.from("operations").select("*").eq("id", operationId).maybeSingle(),
        supabase
          .from("journey_steps")
          .select("*")
          .eq("operation_id", operationId)
          .order("sequence"),
        supabase.rpc("w04_operation_runtime_state", { _operation_id: operationId }),
        supabase
          .from("playbook_items")
          .select("*")
          .eq("operation_id", operationId)
          .eq("is_active", true)
          .order("sequence"),
        supabase.from("playbook_executions").select("*").eq("operation_id", operationId),
        supabase
          .from("operation_participations")
          .select("id, participation_kind, status")
          .eq("operation_id", operationId)
          .neq("status", "cancelled"),
      ]);

      if (operation.error) throw operation.error;
      if (steps.error) throw steps.error;
      if (state.error) throw state.error;
      if (items.error) throw items.error;
      if (executions.error) throw executions.error;
      if (roster.error) throw roster.error;

      return {
        operation: operation.data,
        steps: (steps.data ?? []) as JourneyStepRow[],
        state: (state.data ?? null) as RuntimeState | null,
        items: (items.data ?? []) as PlaybookItemRow[],
        executions: (executions.data ?? []) as PlaybookExecutionRow[],
        roster: (roster.data ?? []) as RosterRow[],
      };
    },
  });

  if (live.isLoading) return <PanelSkeleton />;

  const operation = live.data?.operation;
  if (!operation) {
    return (
      <EmptyState
        icon={Radio}
        title="Operação indisponível"
        body="Não foi possível carregar esta operação para o preview do Cockpit V2."
      />
    );
  }

  const steps = live.data?.steps ?? [];
  const state = live.data?.state ?? null;
  const current = steps.find((step) => step.id === state?.current_step_id) ?? null;
  const next = steps.find((step) => step.id === state?.next_step_id) ?? null;

  const currentItems = current
    ? (live.data?.items ?? []).filter((item) => item.journey_step_id === current.id)
    : [];

  const latestExecution = (itemId: string) =>
    (live.data?.executions ?? [])
      .filter((row) => row.playbook_item_id === itemId)
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))[0] ?? null;

  const checklistDone = currentItems.filter(
    (item) => latestExecution(item.id)?.execution_action === "completed",
  ).length;

  const participants = (live.data?.roster ?? []).filter(
    (row) => row.participation_kind === "participant" && row.status !== "cancelled",
  );
  const confirmed = participants.filter((row) => row.status === "confirmed").length;
  const unconfirmed = participants.length - confirmed;

  const readiness = state?.readiness ?? null;
  const missingRequiredItems = readiness?.missing_required_items.length ?? 0;
  const missingPeople = readiness?.missing_participations.length ?? 0;
  const checklistNeedsAttention = missingRequiredItems > 0;
  const travelersNeedAttention = unconfirmed > 0 || missingPeople > 0;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 pb-28 sm:pb-24">
      <header className="space-y-1 px-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>COBS Cockpit UX V2</Eyebrow>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">{operation.name}</h1>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
              operation.status === "active"
                ? "bg-success-soft text-success"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {operation.status === "active" ? "Em andamento" : operation.status}
          </span>
        </div>
      </header>

      <article className="overflow-hidden rounded-3xl border border-primary/30 bg-elevated shadow-sm">
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-2.5 rounded-full bg-primary" aria-hidden="true" />
            <Eyebrow>Agora</Eyebrow>
          </div>

          {current ? (
            <>
              <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                {current.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {current.location_label ?? "Etapa operacional em execução"}
              </p>

              <LiveTimingStrip current={current} next={next} />
            </>
          ) : next ? (
            <>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Próxima etapa pronta</h2>
              <p className="mt-1 text-sm text-muted-foreground">{next.title}</p>
            </>
          ) : (
            <>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Jornada concluída</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Não há próxima etapa operacional pendente.
              </p>
            </>
          )}
        </div>

        <div className="space-y-3 border-t border-border/70 bg-background/45 p-4 sm:px-6">
          <LiveNextBestAction operationId={operationId} />
          <Button asChild className="min-h-14 w-full justify-between rounded-2xl px-4 text-base">
            <Link to="/operations/$operationId/live" params={{ operationId }}>
              <span>Executar próxima ação</span>
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </article>

      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/operations/$operationId/live"
          params={{ operationId }}
          className={`group rounded-2xl border p-4 transition-colors hover:bg-elevated/80 focus-ring ${
            checklistNeedsAttention
              ? "border-warning/35 bg-warning-soft text-warning"
              : "border-border/70 bg-elevated"
          }`}
          aria-label={checklistNeedsAttention ? "Abrir checklist pendente" : "Abrir checklist"}
        >
          <div className="flex items-center gap-2">
            {checklistNeedsAttention ? (
              <AlertTriangle className="size-4" aria-hidden="true" />
            ) : (
              <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            <Eyebrow>Checklist</Eyebrow>
            <ArrowRight
              className="ml-auto size-4 opacity-60 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {checklistDone}/{currentItems.length}
          </p>
          {checklistNeedsAttention ? (
            <p className="mt-1 text-xs font-medium">
              {missingRequiredItems} obrigatório(s) pendente(s) · tocar para resolver
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">sem bloqueio obrigatório</p>
          )}
        </Link>

        <Link
          to="/operations/$operationId/people"
          params={{ operationId }}
          className={`group rounded-2xl border p-4 transition-colors hover:bg-elevated/80 focus-ring ${
            travelersNeedAttention
              ? "border-warning/35 bg-warning-soft text-warning"
              : "border-border/70 bg-elevated"
          }`}
          aria-label={travelersNeedAttention ? "Abrir viajantes pendentes" : "Abrir viajantes"}
        >
          <div className="flex items-center gap-2">
            {travelersNeedAttention ? (
              <AlertTriangle className="size-4" aria-hidden="true" />
            ) : (
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            <Eyebrow>Viajantes</Eyebrow>
            <ArrowRight
              className="ml-auto size-4 opacity-60 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {confirmed}/{participants.length}
          </p>
          {travelersNeedAttention ? (
            <p className="mt-1 text-xs font-medium">
              {unconfirmed > 0
                ? `${unconfirmed} aguardando confirmação · tocar para resolver`
                : `${missingPeople} pendente(s) nesta etapa · tocar para resolver`}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">todos confirmados</p>
          )}
        </Link>
      </div>

      {next ? (
        <article className="rounded-2xl border border-border/70 bg-elevated p-4">
          <Eyebrow>Depois</Eyebrow>
          <h3 className="mt-1 text-base font-semibold">{next.title}</h3>
          {next.location_label ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{next.location_label}</p>
          ) : null}
        </article>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <Button asChild variant="outline" className="min-h-12 justify-between rounded-xl">
          <Link to="/operations/$operationId/people" params={{ operationId }}>
            Passageiros <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-12 justify-between rounded-xl">
          <Link to="/operations/$operationId/journey" params={{ operationId }}>
            Jornada <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-12 justify-between rounded-xl">
          <Link to="/operations/$operationId/mobility" params={{ operationId }}>
            Transporte <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <nav
        aria-label="Navegação rápida do Cockpit"
        className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-lg backdrop-blur sm:hidden"
      >
        <div className="grid grid-cols-3 gap-1">
          <Link
            to="/operations/$operationId/cockpit-v2"
            params={{ operationId }}
            aria-current="page"
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl bg-primary-soft px-2 text-primary focus-ring"
          >
            <LayoutDashboard className="size-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold">Cockpit</span>
          </Link>
          <Link
            to="/operations/$operationId/people"
            params={{ operationId }}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-ring"
          >
            <Users className="size-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold">Passageiros</span>
          </Link>
          <Link
            to="/operations/$operationId/live"
            params={{ operationId }}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-ring"
          >
            <Radio className="size-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold">Operação</span>
          </Link>
        </div>
      </nav>
    </section>
  );
}
