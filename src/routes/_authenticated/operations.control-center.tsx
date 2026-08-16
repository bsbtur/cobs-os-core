import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Radio,
  Route as RouteIcon,
  Users,
} from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

type HealthLevel = "green" | "yellow" | "red";

type Intelligence = {
  journey?: {
    progress_percent?: number;
    current_step?: { id?: string; title?: string } | null;
    next_step?: { id?: string; title?: string } | null;
  };
  passengers?: {
    confirmed?: number;
    current_step?: { unresolved?: number };
  };
  incidents?: { total?: number };
  health?: { level?: HealthLevel };
};

type OperationRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  timezone: string | null;
  planned_start: string | null;
  planned_end: string | null;
  expected_start: string | null;
  expected_end: string | null;
  primary_city: string | null;
  primary_region: string | null;
  archived_at: string | null;
};

type Rpc = (
  fn: "get_operation_intelligence",
  args: { _operation_id: string },
) => PromiseLike<{ data: unknown; error: unknown }>;

type ControlItem = {
  operation: OperationRow;
  intelligence: Intelligence;
  health: HealthLevel;
  delayMinutes: number;
  pendingCount: number;
};

export const Route = createFileRoute("/_authenticated/operations/control-center")({
  head: () => ({
    meta: [
      { title: "Operations Control Center — COBS OS" },
      {
        name: "description",
        content: "Central multioperação do COBS OS com saúde operacional, etapa atual e exceções.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperationsControlCenterPage,
});

const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

const healthWeight: Record<HealthLevel, number> = { red: 0, yellow: 1, green: 2 };

function delayMinutes(operation: OperationRow, now: number) {
  const raw = operation.expected_end ?? operation.planned_end;
  if (!raw) return 0;
  const end = new Date(raw).getTime();
  if (!Number.isFinite(end) || now <= end) return 0;
  return Math.floor((now - end) / 60_000);
}

function healthMeta(level: HealthLevel, locale: string) {
  if (level === "red") {
    return {
      label: copy(locale, "Crítica", "Critical"),
      className: "border-destructive/35 bg-destructive/10 text-destructive",
      icon: AlertTriangle,
    };
  }
  if (level === "yellow") {
    return {
      label: copy(locale, "Atenção", "Attention"),
      className: "border-warning/35 bg-warning-soft text-warning",
      icon: AlertTriangle,
    };
  }
  return {
    label: copy(locale, "Saudável", "Healthy"),
    className: "border-success/35 bg-success-soft text-success",
    icon: CheckCircle2,
  };
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: HealthLevel | "neutral";
}) {
  const className =
    tone === "red"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : tone === "yellow"
        ? "border-warning/30 bg-warning-soft text-warning"
        : tone === "green"
          ? "border-success/30 bg-success-soft text-success"
          : "border-border bg-elevated text-foreground";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
    </div>
  );
}

function OperationHealthCard({ item, index }: { item: ControlItem; index: number }) {
  const { locale } = useI18n();
  const { operation, intelligence, health, delayMinutes: delay, pendingCount } = item;
  const meta = healthMeta(health, locale);
  const HealthIcon = meta.icon;
  const current = intelligence.journey?.current_step?.title;
  const next = intelligence.journey?.next_step?.title;
  const progress = Math.max(0, Math.min(100, intelligence.journey?.progress_percent ?? 0));
  const confirmed = intelligence.passengers?.confirmed ?? 0;

  return (
    <article
      className="surface-panel animate-rise overflow-hidden"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{operation.name}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {operation.code}
              {operation.primary_city ? ` · ${operation.primary_city}` : ""}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}
          >
            <HealthIcon className="size-3.5" aria-hidden="true" />
            {meta.label}
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-border/70 bg-background/55 p-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
            {copy(locale, "Agora", "Now")}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {current ?? copy(locale, "Nenhuma etapa ativa", "No active step")}
          </p>
          {next ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {copy(locale, "Depois", "Next")}: {next}
            </p>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border/70 bg-background/45 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <RouteIcon className="size-3.5" aria-hidden="true" />
              <span className="text-[10px] font-medium uppercase tracking-wide">
                {copy(locale, "Progresso", "Progress")}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums">{Math.round(progress)}%</p>
          </div>
          <div
            className={`rounded-xl border px-3 py-2.5 ${delay > 0 ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border/70 bg-background/45"}`}
          >
            <div className="flex items-center gap-1.5 opacity-75">
              <Clock3 className="size-3.5" aria-hidden="true" />
              <span className="text-[10px] font-medium uppercase tracking-wide">
                {copy(locale, "Desvio", "Delay")}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {delay > 0 ? `+${delay}m` : "0m"}
            </p>
          </div>
          <div
            className={`rounded-xl border px-3 py-2.5 ${pendingCount > 0 ? "border-warning/30 bg-warning-soft text-warning" : "border-border/70 bg-background/45"}`}
          >
            <div className="flex items-center gap-1.5 opacity-75">
              <Users className="size-3.5" aria-hidden="true" />
              <span className="text-[10px] font-medium uppercase tracking-wide">
                {copy(locale, "Pendências", "Pending")}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums">{pendingCount}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {confirmed} {copy(locale, "viajantes confirmados", "travelers confirmed")}
          </span>
          <span>
            {intelligence.incidents?.total ?? 0} {copy(locale, "ocorrências", "incidents")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-border/70 bg-background/35">
        <Link
          to="/operations/$operationId/cockpit-v2"
          params={{ operationId: operation.id }}
          className="flex min-h-12 items-center justify-center gap-2 border-r border-border/70 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft/50 focus-ring"
        >
          {copy(locale, "Abrir Cockpit", "Open cockpit")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link
          to="/operations/$operationId/live"
          params={{ operationId: operation.id }}
          className="flex min-h-12 items-center justify-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-elevated focus-ring"
        >
          {copy(locale, "Intervir", "Intervene")}
          <Activity className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function OperationsControlCenter() {
  const { locale } = useI18n();
  const { tenant } = useTenant();

  const query = useQuery({
    queryKey: ["operations-control-center", tenant?.id],
    enabled: Boolean(tenant?.id),
    refetchInterval: 20_000,
    queryFn: async () => {
      const operations = await supabase
        .from("operations")
        .select(
          "id,name,code,status,timezone,planned_start,planned_end,expected_start,expected_end,primary_city,primary_region,archived_at",
        )
        .eq("tenant_id", tenant!.id)
        .eq("status", "active")
        .is("archived_at", null)
        .order("expected_start", { ascending: true, nullsFirst: false });

      if (operations.error) throw operations.error;

      const rpc = supabase.rpc as unknown as Rpc;
      const now = Date.now();
      const rows = (operations.data ?? []) as OperationRow[];
      const enriched = await Promise.all(
        rows.map(async (operation) => {
          const intelligence = await rpc("get_operation_intelligence", {
            _operation_id: operation.id,
          });
          if (intelligence.error) throw intelligence.error;
          const data = (intelligence.data ?? {}) as Intelligence;
          const health = data.health?.level ?? "green";
          const pendingCount =
            (data.passengers?.current_step?.unresolved ?? 0) + (data.incidents?.total ?? 0);

          return {
            operation,
            intelligence: data,
            health,
            delayMinutes: delayMinutes(operation, now),
            pendingCount,
          } satisfies ControlItem;
        }),
      );

      return enriched.sort((a, b) => {
        if (healthWeight[a.health] !== healthWeight[b.health]) {
          return healthWeight[a.health] - healthWeight[b.health];
        }
        if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
        return b.delayMinutes - a.delayMinutes;
      });
    },
  });

  if (query.isLoading) return <PanelSkeleton rows={4} />;

  if (query.isError) {
    return (
      <section className="surface-panel p-5" role="alert">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
              COBS Operations Control Center
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {copy(
                locale,
                "Não foi possível confirmar o estado das operações",
                "We couldn't confirm operation status",
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy(
                locale,
                "A saúde operacional não foi confirmada. Não interprete esta falha como ausência de operações críticas.",
                "Operational health was not confirmed. Do not interpret this failure as absence of critical operations.",
              )}
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching
                ? copy(locale, "Atualizando…", "Refreshing…")
                : copy(locale, "Atualizar", "Refresh")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const items = query.data ?? [];
  const healthy = items.filter((item) => item.health === "green").length;
  const attention = items.filter((item) => item.health === "yellow").length;
  const critical = items.filter((item) => item.health === "red").length;

  if (!items.length) {
    return (
      <EmptyState
        icon={HeartPulse}
        title={copy(locale, "Nenhuma operação ativa agora", "No active operations right now")}
        body={copy(
          locale,
          "Quando uma operação entrar em execução, sua saúde, etapa atual e exceções aparecerão aqui.",
          "When an operation starts, its health, current step and exceptions will appear here.",
        )}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="surface-panel overflow-hidden">
        <div className="border-b border-border bg-primary-soft/25 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Radio className="size-4" aria-hidden="true" />
                <p className="font-mono text-[10px] uppercase tracking-[0.16em]">
                  COBS Operations Control Center
                </p>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {copy(locale, "Central de Operações", "Operations Control Center")}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {copy(
                  locale,
                  "Operações ativas ordenadas por necessidade de intervenção.",
                  "Active operations ordered by intervention priority.",
                )}
              </p>
            </div>
            <div className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-semibold">
              {items.length} {copy(locale, "ativas", "active")}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 sm:p-5">
          <SummaryCard
            label={copy(locale, "Ativas", "Active")}
            value={items.length}
            tone="neutral"
          />
          <SummaryCard label={copy(locale, "Saudáveis", "Healthy")} value={healthy} tone="green" />
          <SummaryCard
            label={copy(locale, "Atenção", "Attention")}
            value={attention}
            tone="yellow"
          />
          <SummaryCard label={copy(locale, "Críticas", "Critical")} value={critical} tone="red" />
        </div>
      </section>

      {critical > 0 ? (
        <section className="rounded-2xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-destructive">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">
                {critical}{" "}
                {copy(
                  locale,
                  critical === 1 ? "operação requer" : "operações requerem",
                  critical === 1 ? "operation requires" : "operations require",
                )}{" "}
                {copy(locale, "intervenção imediata", "immediate intervention")}
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                {copy(
                  locale,
                  "As operações críticas aparecem primeiro na fila.",
                  "Critical operations are placed first in the queue.",
                )}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-2">
        {items.map((item, index) => (
          <OperationHealthCard key={item.operation.id} item={item} index={index} />
        ))}
      </section>
    </div>
  );
}

function OperationsControlCenterPage() {
  const { locale } = useI18n();
  return (
    <AppShell
      activeId="operations"
      title={copy(locale, "Central de Operações", "Operations Control Center")}
    >
      <div className="mx-auto w-full max-w-6xl">
        <RequireTenant>
          <OperationsControlCenter />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
