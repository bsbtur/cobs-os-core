import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, BellRing, CheckCircle2, Info } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Reason = { code?: string; severity?: string; value?: number | string | null };
type Intelligence = {
  health?: { level?: "green" | "yellow" | "red"; reasons?: Reason[] };
  incidents?: { total?: number };
  hospitality?: { stays?: Array<{ issues?: number }> };
  communications?: { urgent_unread?: number };
  commerce?: { currency?: string | null; outstanding_minor?: number };
  passengers?: { current_step?: { unresolved?: number } };
  journey?: { delay?: { minutes?: number; status?: string } };
};
type Rpc = (fn: "get_operation_intelligence", args: { _operation_id: string }) => PromiseLike<{ data: unknown; error: unknown }>;
type Attention = { severity: "critical" | "warning" | "info"; title: string; detail: string };

const n = (value: number | null | undefined) => value ?? 0;
const copy = (locale: string, pt: string, en: string) => locale.toLowerCase().startsWith("pt") ? pt : en;

function money(value: number | null | undefined, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n(value) / 100);
}

export function OperationAttentionCenter({ operationId }: { operationId: string }) {
  const location = useLocation();
  const { locale } = useI18n();
  const isLive = location.pathname.endsWith(`/operations/${operationId}/live`);

  const query = useQuery({
    queryKey: ["px05-operation-attention", operationId],
    enabled: isLive,
    refetchInterval: 20_000,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as Rpc;
      const { data, error } = await rpc("get_operation_intelligence", { _operation_id: operationId });
      if (error) throw error;
      return data as Intelligence;
    },
  });

  if (!isLive || query.isLoading || query.isError || !query.data) return null;
  const data = query.data;
  const attentions: Attention[] = [];
  const healthReasons = data.health?.reasons ?? [];

  for (const reason of healthReasons) {
    if (!reason.code) continue;
    attentions.push({
      severity: reason.severity === "critical" || data.health?.level === "red" ? "critical" : "warning",
      title: humanizeCode(reason.code, locale),
      detail: reason.value == null ? copy(locale, "Condição sinalizada pelo Intelligence Core.", "Condition flagged by the Intelligence Core.") : copy(locale, `Valor observado: ${reason.value}.`, `Observed value: ${reason.value}.`),
    });
  }

  const incidents = n(data.incidents?.total);
  if (incidents > 0 && !healthReasons.some((r) => r.code?.includes("INCIDENT"))) attentions.push({ severity: "critical", title: copy(locale, "Incidentes operacionais", "Operational incidents"), detail: copy(locale, `${incidents} incidente(s) registrado(s).`, `${incidents} incident(s) recorded.`) });

  const hotelIssues = (data.hospitality?.stays ?? []).reduce((sum, stay) => sum + n(stay.issues), 0);
  if (hotelIssues > 0) attentions.push({ severity: "warning", title: copy(locale, "Pendências de hospedagem", "Hospitality issues"), detail: copy(locale, `${hotelIssues} pendência(s) precisam de atenção.`, `${hotelIssues} issue(s) need attention.`) });

  const urgentUnread = n(data.communications?.urgent_unread);
  if (urgentUnread > 0) attentions.push({ severity: "critical", title: copy(locale, "Alerta urgente não lido", "Unread urgent alert"), detail: copy(locale, `${urgentUnread} leitura(s) urgente(s) ainda pendentes.`, `${urgentUnread} urgent read(s) are still pending.`) });

  const unresolved = n(data.passengers?.current_step?.unresolved);
  if (unresolved > 0 && !healthReasons.some((r) => r.code?.includes("UNRESOLVED"))) attentions.push({ severity: "warning", title: copy(locale, "Viajantes pendentes", "Pending travelers"), detail: copy(locale, `${unresolved} viajante(s) ainda não resolvidos na etapa atual.`, `${unresolved} traveler(s) remain unresolved in the current step.`) });

  const delay = n(data.journey?.delay?.minutes);
  if (delay > 0 && !healthReasons.some((r) => r.code?.includes("DELAY"))) attentions.push({ severity: delay >= 15 ? "critical" : "warning", title: copy(locale, "Atraso operacional", "Operational delay"), detail: copy(locale, `A etapa está ${delay} min atrasada.`, `The step is ${delay} min late.`) });

  const outstanding = n(data.commerce?.outstanding_minor);
  if (outstanding > 0) attentions.push({ severity: "info", title: copy(locale, "Saldo financeiro pendente", "Outstanding financial balance"), detail: money(outstanding, data.commerce?.currency ?? "BRL") });

  const order = { critical: 0, warning: 1, info: 2 } as const;
  attentions.sort((a, b) => order[a.severity] - order[b.severity]);

  if (attentions.length === 0) {
    return (
      <section className="rounded-xl border border-success/30 bg-success-soft px-4 py-3">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">{copy(locale, "Central de atenção", "Attention center")}</p><p className="mt-1 text-sm font-semibold text-success">{copy(locale, "Nenhuma atenção crítica agora", "No critical attention needed now")}</p></div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-background/70 px-4 py-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><BellRing className="size-4 text-primary" /><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{copy(locale, "Central de atenção", "Attention center")}</p></div>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold">{attentions.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {attentions.slice(0, 5).map((item, index) => <AttentionRow key={`${item.title}-${index}`} item={item} />)}
      </div>
    </section>
  );
}

function AttentionRow({ item }: { item: Attention }) {
  const Icon = item.severity === "critical" ? AlertCircle : item.severity === "warning" ? AlertTriangle : Info;
  const classes = item.severity === "critical" ? "border-destructive/30 bg-destructive/10 text-destructive" : item.severity === "warning" ? "border-warning/30 bg-warning-soft text-warning" : "border-primary/20 bg-primary-soft/30 text-foreground";
  return <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${classes}`}><Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div><p className="text-xs font-semibold">{item.title}</p><p className="mt-0.5 text-[11px] opacity-80">{item.detail}</p></div></div>;
}

function humanizeCode(code: string, locale: string) {
  const known: Record<string, [string, string]> = {
    CURRENT_STEP_DELAYED: ["Etapa atual atrasada", "Current step delayed"],
    UNRESOLVED_PASSENGERS: ["Viajantes pendentes", "Pending travelers"],
    EXPECTED_PARTICIPATIONS_REMAIN: ["Participações ainda esperadas", "Expected participations remain"],
  };
  const value = known[code];
  if (value) return copy(locale, value[0], value[1]);
  return code.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}
