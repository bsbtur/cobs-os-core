import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BedDouble,
  Bus,
  CalendarDays,
  Clock3,
  MapPin,
  MessageSquareText,
  Route,
  ShieldCheck,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTenant, type AppRole } from "@/lib/tenant";
import { formatDateTime } from "@/lib/format";
import { StatusPill } from "@/components/feedback/status-pill";

type Intelligence = {
  journey?: {
    progress_percent?: number;
    current_step?: { title?: string } | null;
    next_step?: { title?: string } | null;
  };
  passengers?: { confirmed?: number; current_step?: { unresolved?: number } };
  incidents?: { total?: number };
  health?: { level?: "green" | "yellow" | "red" };
};

type Rpc = (
  fn: "get_operation_intelligence",
  args: { _operation_id: string },
) => PromiseLike<{ data: unknown; error: unknown }>;

type ShortcutKey = "people" | "journey" | "live" | "mobility" | "hospitality" | "events" | "communication";

const n = (value: number | null | undefined) => value ?? 0;
const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

const ROLE_LABEL: Record<AppRole, { pt: string; en: string }> = {
  owner: { pt: "Proprietário", en: "Owner" },
  admin: { pt: "Gestão", en: "Management" },
  operations_agent: { pt: "Operação", en: "Operations" },
  member: { pt: "Equipe", en: "Team" },
};

const ROLE_SHORTCUTS: Record<AppRole, ShortcutKey[]> = {
  owner: ["live", "people", "journey", "mobility", "hospitality", "events", "communication"],
  admin: ["live", "people", "journey", "mobility", "hospitality", "events", "communication"],
  operations_agent: ["live", "journey", "people", "mobility", "communication", "hospitality", "events"],
  member: ["live", "journey", "people", "communication", "mobility", "hospitality", "events"],
};

/**
 * PX12 V1 — role-aware operation home.
 * Role only changes information priority and copy. Authorization remains enforced by the canonical RLS/RPC layer.
 */
export function OperationControlCenter({ operationId }: { operationId: string }) {
  const location = useLocation();
  const { locale, timeZone } = useI18n();
  const { role } = useTenant();
  const base = `/operations/${operationId}`;
  const isOverview = location.pathname === base || location.pathname === `${base}/`;

  const query = useQuery({
    queryKey: ["px12-role-aware-operation-home", operationId],
    enabled: isOverview,
    refetchInterval: isOverview ? 30_000 : false,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as Rpc;
      const [operation, intelligence] = await Promise.all([
        supabase.from("operations").select("id,name,code,status,operation_kind,primary_city,primary_region,primary_country,timezone,planned_start,planned_end,expected_start,expected_end,archived_at").eq("id", operationId).maybeSingle(),
        rpc("get_operation_intelligence", { _operation_id: operationId }),
      ]);
      if (operation.error) throw operation.error;
      if (intelligence.error) throw intelligence.error;
      return { operation: operation.data, intelligence: intelligence.data as Intelligence };
    },
  });

  if (!isOverview || query.isLoading || query.isError || !query.data?.operation) return null;

  const op = query.data.operation;
  const data = query.data.intelligence;
  const tz = op.timezone || timeZone;
  const start = op.expected_start ?? op.planned_start;
  const end = op.expected_end ?? op.planned_end;
  const current = data.journey?.current_step?.title;
  const effectiveRole: AppRole = role ?? "member";
  const managerial = effectiveRole === "owner" || effectiveRole === "admin";
  const roleLabel = copy(locale, ROLE_LABEL[effectiveRole].pt, ROLE_LABEL[effectiveRole].en);
  const health = data.health?.level ?? "green";
  const healthLabel = health === "red"
    ? copy(locale, "Crítico", "Critical")
    : health === "yellow"
      ? copy(locale, "Atenção", "Attention")
      : copy(locale, "Sob controle", "Under control");
  const healthClass = health === "red"
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : health === "yellow"
      ? "border-warning/40 bg-warning/10 text-warning"
      : "border-success/40 bg-success/10 text-success";

  const shortcutCatalog: Record<ShortcutKey, { label: string; icon: typeof Users; to: string; emphasis?: boolean }> = {
    people: { label: copy(locale, "Pessoas", "People"), icon: Users, to: `${base}/people` },
    journey: { label: copy(locale, "Jornada", "Journey"), icon: Route, to: `${base}/journey` },
    live: { label: copy(locale, "Ao vivo", "Live"), icon: Activity, to: `${base}/live`, emphasis: true },
    mobility: { label: copy(locale, "Mobilidade", "Mobility"), icon: Bus, to: `${base}/mobility` },
    hospitality: { label: copy(locale, "Hospedagem", "Hospitality"), icon: BedDouble, to: `${base}/hospitality` },
    events: { label: copy(locale, "Eventos", "Events"), icon: CalendarDays, to: `${base}/events` },
    communication: { label: copy(locale, "Comunicação", "Communication"), icon: MessageSquareText, to: `${base}/communication` },
  };
  const shortcuts = ROLE_SHORTCUTS[effectiveRole].map((key) => shortcutCatalog[key]);

  const primaryTitle = managerial
    ? copy(locale, "Acompanhar operação ao vivo", "Monitor live operation")
    : copy(locale, "Continuar operação", "Continue operation");
  const primaryDescription = managerial
    ? copy(locale, "Veja execução, pendências e exceções em tempo real.", "See execution, pending work and exceptions in real time.")
    : copy(locale, "Abra sua próxima ação, presença e tarefas de campo.", "Open your next action, presence and field tasks.");

  return (
    <section className="surface-panel overflow-hidden" aria-label={copy(locale, "Central de controle da operação", "Operation control center")}>
      <div className="border-b border-border bg-primary-soft/30 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">COBS Operation Home</p>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                <ShieldCheck className="size-3" aria-hidden="true" />
                {roleLabel}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-semibold">{op.name}</h2>
              <StatusPill status={op.status} />
              {op.archived_at ? <StatusPill status="archived" /> : null}
            </div>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{op.code} · {op.operation_kind}</p>
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${healthClass}`}>{healthLabel}</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Summary icon={Clock3} label={copy(locale, "Janela atual", "Current window")} value={`${formatDateTime(start, { locale, timeZone: tz })} — ${formatDateTime(end, { locale, timeZone: tz })}`} />
          <Summary icon={MapPin} label={copy(locale, "Local principal", "Primary location")} value={[op.primary_city, op.primary_region, op.primary_country].filter(Boolean).join(" · ") || "—"} />
          <Summary
            icon={Users}
            label={managerial ? copy(locale, "Visão de viajantes", "Traveler overview") : copy(locale, "Pessoas agora", "People now")}
            value={`${n(data.passengers?.confirmed)} ${copy(locale, "confirmados", "confirmed")} · ${n(data.passengers?.current_step?.unresolved)} ${copy(locale, "pendentes agora", "pending now")}`}
          />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-border bg-background/60 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              {managerial ? copy(locale, "Estado operacional", "Operational state") : copy(locale, "Seu foco agora", "Your focus now")}
            </p>
            <p className="mt-2 text-lg font-semibold">{current ?? (op.status === "completed" ? copy(locale, "Operação concluída", "Operation completed") : copy(locale, "Nenhuma etapa ativa", "No active step"))}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.journey?.next_step?.title
                ? `${copy(locale, "Próxima", "Next")}: ${data.journey.next_step.title}`
                : copy(locale, "Sem próxima etapa definida", "No next step defined")}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, n(data.journey?.progress_percent)))}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {n(data.journey?.progress_percent)}%
              {managerial ? ` · ${n(data.incidents?.total)} ${copy(locale, "incidente(s)", "incident(s)")}` : ""}
            </p>
          </div>

          <Link
            to={`${base}/live`}
            className="group flex min-h-36 flex-col justify-between rounded-xl border border-primary/30 bg-primary px-4 py-4 text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-75">
                {managerial ? copy(locale, "Ação principal", "Primary action") : copy(locale, "Próximo passo", "Next step")}
              </p>
              <p className="mt-2 text-xl font-semibold">{primaryTitle}</p>
              <p className="mt-1 text-sm opacity-80">{primaryDescription}</p>
            </div>
            <ArrowRight className="mt-4 size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        </div>

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {managerial ? copy(locale, "Acessos da gestão", "Management shortcuts") : copy(locale, "Ferramentas para seu trabalho", "Tools for your work")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {shortcuts.map(({ label, icon: Icon, to, emphasis }) => (
              <Link
                key={to}
                to={to}
                className={`flex min-h-20 flex-col items-start justify-between rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${emphasis ? "border-primary/40 bg-primary-soft text-primary" : "border-border bg-background/50 hover:border-border-strong"}`}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-3">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-3.5" aria-hidden="true" /><p className="font-mono text-[10px] uppercase tracking-[0.12em]">{label}</p></div>
      <p className="mt-1.5 text-sm font-medium">{value}</p>
    </div>
  );
}