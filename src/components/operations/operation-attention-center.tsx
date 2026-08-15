import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, BellRing, CheckCircle2, Info, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LoadingPulse } from "@/components/feedback/loading";

type Reason = { code?: string; severity?: string; value?: number | string | null };
type Intelligence = {
  health?: { level?: "green" | "yellow" | "red"; reasons?: Reason[] };
  incidents?: { total?: number };
  hospitality?: { stays?: Array<{ issues?: number }> };
  communications?: { urgent_unread?: number };
  journey?: { delay?: { minutes?: number; status?: string } };
};
type Rpc = (fn: "get_operation_intelligence", args: { _operation_id: string }) => PromiseLike<{ data: unknown; error: unknown }>;
type Attention = { severity: "critical" | "warning" | "info"; title: string; detail: string };

const n = (value: number | null | undefined) => value ?? 0;
const copy = (locale: string, pt: string, en: string) => locale.toLowerCase().startsWith("pt") ? pt : en;

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

  if (!isLive) return null;

  if (query.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-background/70 px-4 py-3" aria-live="polite">
        <div className="flex items-center gap-2"><BellRing className="size-4 text-primary" aria-hidden="true" /><LoadingPulse label={copy(locale, "Atualizando saúde operacional...", "Updating operational health...")} /></div>
      </section>
    );
  }

  if (query.isError || !query.data) {
    return (
      <section className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3" role="alert">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">{copy(locale, "Central de atenção", "Attention center")}</p>
              <p className="mt-1 text-sm font-semibold">{copy(locale, "Não foi possível atualizar os sinais operacionais", "Could not refresh operational signals")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{copy(locale, "Não interprete a ausência de alertas como operação saudável até a atualização concluir.", "Do not treat missing alerts as a healthy operation until refresh completes.")}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-1 size-3.5 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            {copy(locale, "Atualizar", "Refresh")}
          </Button>
        </div>
      </section>
    );
  }

  const data = query.data;
  const attentions: Attention[] = [];
  const healthReasons = (data.health?.reasons ?? []).filter((reason) => !isCurrentStepPassengerBlocker(reason.code));

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

  const delay = n(data.journey?.delay?.minutes);
  if (delay > 0 && !healthReasons.some((r) => r.code?.includes("DELAY"))) attentions.push({ severity: delay >= 15 ? "critical" : "warning", title: copy(locale, "Atraso operacional", "Operational delay"), detail: copy(locale, `A etapa está ${delay} min atrasada.`, `The step is ${delay} min late.`) });

  const order = { critical: 0, warning: 1, info: 2 } as const;
  attentions.sort((a, b) => order[a.severity] - order[b.severity]);

  if (attentions.length === 0) {
    return (
      <section className="hidden rounded-xl border border-success/30 bg-success-soft px-4 py-3 sm:block">
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
        {attentions.slice(0, 3).map((item, index) => <AttentionRow key={`${item.title}-${index}`} item={item} />)}
      </div>
      {attentions.length > 3 ? <p className="mt-2 text-[11px] text-muted-foreground">+{attentions.length - 3} {copy(locale, "outro(s) sinal(is)", "more signal(s)")}</p> : null}
    </section>
  );
}

function AttentionRow({ item }: { item: Attention }) {
  const Icon = item.severity === "critical" ? AlertCircle : item.severity === "warning" ? AlertTriangle : Info;
  const classes = item.severity === "critical" ? "border-destructive/30 bg-destructive/10 text-destructive" : item.severity === "warning" ? "border-warning/30 bg-warning-soft text-warning" : "border-primary/20 bg-primary-soft/30 text-foreground";
  return <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${classes}`}><Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div><p className="text-xs font-semibold">{item.title}</p><p className="mt-0.5 text-[11px] opacity-80">{item.detail}</p></div></div>;
}

function isCurrentStepPassengerBlocker(code?: string) {
  return code === "UNRESOLVED_PASSENGERS" || code === "EXPECTED_PARTICIPATIONS_REMAIN";
}

function humanizeCode(code: string, locale: string) {
  const known: Record<string, [string, string]> = {
    CURRENT_STEP_DELAYED: ["Etapa atual atrasada", "Current step delayed"],
  };
  const value = known[code];
  if (value) return copy(locale, value[0], value[1]);
  return code.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}