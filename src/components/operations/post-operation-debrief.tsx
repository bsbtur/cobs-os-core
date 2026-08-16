import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BedDouble,
  Bus,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Intelligence = {
  operation?: { status?: string; code?: string; name?: string; completed_at?: string | null };
  journey?: {
    total_steps?: number;
    completed_steps?: number;
    skipped_steps?: number;
    progress_percent?: number;
  };
  passengers?: {
    total?: number;
    confirmed?: number;
    cancelled?: number;
    expected?: number;
    effective_facts?: {
      present?: number;
      boarded?: number;
      disembarked?: number;
      absent?: number;
      no_show?: number;
    };
  };
  mobility?: { total_legs?: number; arrived?: number; cancelled?: number; delayed?: number };
  hospitality?: {
    total_stays?: number;
    total_guests?: number;
    checked_in?: number;
    issues?: number;
  };
  events?: {
    total?: number;
    completed?: number;
    total_sessions?: number;
    completed_sessions?: number;
  };
  communications?: {
    total_messages?: number;
    recipients?: number;
    read?: number;
    read_rate_percent?: number;
    urgent_unread?: number;
  };
  commerce?: {
    currency?: string | null;
    grand_total_minor?: number;
    net_paid_minor?: number;
    outstanding_minor?: number;
  };
  incidents?: { total?: number };
  health?: { level?: "green" | "yellow" | "red"; reasons?: Array<{ code?: string }> };
};

type Rpc = (
  fn: "get_operation_intelligence",
  args: { _operation_id: string },
) => PromiseLike<{ data: unknown; error: unknown }>;

const n = (value: number | null | undefined) => value ?? 0;
const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

function money(value: number | null | undefined, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n(value) / 100);
}

export function PostOperationDebrief({ operationId }: { operationId: string }) {
  const location = useLocation();
  const { locale } = useI18n();
  const path = `/operations/${operationId}`;
  const isOverview = location.pathname === path || location.pathname === `${path}/`;

  const query = useQuery({
    queryKey: ["px08-post-operation-debrief", operationId],
    enabled: isOverview,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as Rpc;
      const { data, error } = await rpc("get_operation_intelligence", {
        _operation_id: operationId,
      });
      if (error) throw error;
      return data as Intelligence;
    },
  });

  if (!isOverview || query.isLoading || query.isError || !query.data) return null;
  const data = query.data;
  if (data.operation?.status !== "completed") return null;

  const currency = data.commerce?.currency ?? "BRL";
  const health = data.health?.level ?? "green";
  const healthLabel =
    health === "red"
      ? copy(locale, "Crítico", "Critical")
      : health === "yellow"
        ? copy(locale, "Com ressalvas", "With warnings")
        : copy(locale, "Concluída sob controle", "Completed under control");
  const healthClass =
    health === "red"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : health === "yellow"
        ? "border-warning/30 bg-warning-soft text-warning"
        : "border-success/30 bg-success-soft text-success";

  const facts = data.passengers?.effective_facts;
  const summary = [
    {
      icon: ClipboardList,
      label: copy(locale, "Jornada", "Journey"),
      value: `${n(data.journey?.completed_steps)}/${n(data.journey?.total_steps)}`,
      detail: copy(
        locale,
        `${n(data.journey?.progress_percent)}% concluída · ${n(data.journey?.skipped_steps)} pulada(s)`,
        `${n(data.journey?.progress_percent)}% complete · ${n(data.journey?.skipped_steps)} skipped`,
      ),
    },
    {
      icon: Users,
      label: copy(locale, "Viajantes", "Travelers"),
      value: String(n(data.passengers?.confirmed)),
      detail: copy(
        locale,
        `${n(facts?.present)} presentes · ${n(facts?.no_show)} no-show`,
        `${n(facts?.present)} present · ${n(facts?.no_show)} no-show`,
      ),
    },
    {
      icon: Bus,
      label: copy(locale, "Mobilidade", "Mobility"),
      value: String(n(data.mobility?.total_legs)),
      detail: copy(
        locale,
        `${n(data.mobility?.arrived)} chegada(s) · ${n(data.mobility?.delayed)} atraso(s)`,
        `${n(data.mobility?.arrived)} arrived · ${n(data.mobility?.delayed)} delayed`,
      ),
    },
    {
      icon: BedDouble,
      label: copy(locale, "Hospedagem", "Hospitality"),
      value: String(n(data.hospitality?.total_stays)),
      detail: copy(
        locale,
        `${n(data.hospitality?.total_guests)} hóspede(s) · ${n(data.hospitality?.issues)} issue(s)`,
        `${n(data.hospitality?.total_guests)} guest(s) · ${n(data.hospitality?.issues)} issue(s)`,
      ),
    },
    {
      icon: Activity,
      label: copy(locale, "Eventos", "Events"),
      value: `${n(data.events?.completed)}/${n(data.events?.total)}`,
      detail: copy(
        locale,
        `${n(data.events?.completed_sessions)}/${n(data.events?.total_sessions)} sessões concluídas`,
        `${n(data.events?.completed_sessions)}/${n(data.events?.total_sessions)} sessions complete`,
      ),
    },
    {
      icon: MessageSquare,
      label: copy(locale, "Comunicação", "Communication"),
      value: `${n(data.communications?.read_rate_percent)}%`,
      detail: copy(
        locale,
        `${n(data.communications?.read)}/${n(data.communications?.recipients)} leituras`,
        `${n(data.communications?.read)}/${n(data.communications?.recipients)} reads`,
      ),
    },
    {
      icon: WalletCards,
      label: copy(locale, "Financeiro", "Finance"),
      value: money(data.commerce?.net_paid_minor, currency),
      detail: copy(
        locale,
        `${money(data.commerce?.outstanding_minor, currency)} pendente`,
        `${money(data.commerce?.outstanding_minor, currency)} outstanding`,
      ),
    },
    {
      icon: ShieldCheck,
      label: copy(locale, "Incidentes", "Incidents"),
      value: String(n(data.incidents?.total)),
      detail:
        n(data.incidents?.total) === 0
          ? copy(locale, "Nenhum incidente registrado", "No incidents recorded")
          : copy(locale, "Revisar ocorrências da operação", "Review operation incidents"),
    },
  ];

  return (
    <section
      className="surface-panel overflow-hidden"
      aria-label={copy(locale, "Debrief da operação", "Operation debrief")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 bg-elevated/50 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            PX08 · POST-OPERATION DEBRIEF
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {copy(locale, "Encerramento operacional", "Operation closeout")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy(
              locale,
              "Resumo factual derivado do Intelligence Core. Nenhum dado é regravado aqui.",
              "Factual summary derived from the Intelligence Core. No data is rewritten here.",
            )}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${healthClass}`}>
          {healthLabel}
        </span>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(({ icon: Icon, label, value, detail }) => (
          <article key={label} className="rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </p>
              <Icon className="size-4 text-primary" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </article>
        ))}
      </div>

      {(data.health?.reasons?.length ?? 0) > 0 ? (
        <div className="border-t border-border/70 px-5 py-4">
          <p className="text-xs font-semibold">
            {copy(locale, "Ressalvas do encerramento", "Closeout warnings")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(data.health?.reasons ?? []).map((reason, index) => (
              <span
                key={`${reason.code}-${index}`}
                className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px]"
              >
                {reason.code ?? copy(locale, "Condição operacional", "Operational condition")}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
