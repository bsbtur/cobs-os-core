import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Trophy } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/feedback/loading";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { eventLabel, type JourneyEventRow } from "@/lib/w04";
import { isOperationTerminal, type OperationStatus } from "@/lib/w02";

export const Route = createFileRoute("/_authenticated/operations/$operationId")({ component: OperationWorkspace });

const TAB_CLASS = "inline-flex min-h-11 items-center rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
type ExcellenceSummary = { available?: boolean; snapshot?: { rounded_score?: number; classification?: string } };

function excellenceLabel(value?: string) {
  if (value === "gold") return "Operação Ouro";
  if (value === "silver") return "Operação Prata";
  if (value === "bronze") return "Operação Bronze";
  return "Excelência Operacional";
}

function ExcellenceSummaryCard({ operationId, enabled }: { operationId: string; enabled: boolean }) {
  const excellence = useQuery({
    queryKey: ["operation-excellence-summary", operationId],
    enabled,
    queryFn: async () => {
      const client = supabase as unknown as RpcClient;
      const { data, error } = await client.rpc("get_operation_excellence", { _operation_id: operationId });
      if (error) throw error;
      return data as ExcellenceSummary;
    },
  });
  if (!enabled || excellence.isLoading || !excellence.data?.available || !excellence.data.snapshot) return null;
  const snapshot = excellence.data.snapshot;
  return <section className="surface-panel overflow-hidden border-amber-500/30 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-full border border-amber-500/30 bg-amber-500/10"><Trophy className="size-6 text-amber-500" aria-hidden="true" /></div><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">Excelência operacional</p><h3 className="mt-1 text-lg font-semibold">🏆 {excellenceLabel(snapshot.classification)} · {Number(snapshot.rounded_score ?? 0)}%</h3><p className="mt-1 text-sm text-muted-foreground">Resultado final canônico da operação · somente leitura</p></div></div><Button asChild className="min-h-11"><Link to="/operations/$operationId/excellence" params={{ operationId }}>Ver Excelência Operacional</Link></Button></div></section>;
}

function TerminalLiveRecord({ operationId, status, timezone }: { operationId: string; status: OperationStatus; timezone: string }) {
  const { t, locale } = useI18n();
  const events = useQuery({ queryKey: ["terminal-live-events", operationId], queryFn: async () => { const { data, error } = await supabase.from("journey_events").select("*").eq("operation_id", operationId).order("occurred_at", { ascending: false }).limit(40); if (error) throw error; return (data ?? []) as JourneyEventRow[]; } });
  if (events.isLoading) return <PanelSkeleton />;
  const completed = status === "completed";
  return <section className="space-y-4"><header><h2 className="text-xl font-semibold">{t("w04.live.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("w04.live.subtitle")}</p></header><div className="surface-panel border-success/40 px-4 py-4"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">{completed ? "Operação concluída" : "Operação cancelada"}</p><h3 className="mt-2 text-lg font-semibold">Jornada concluída</h3><p className="mt-1 text-sm text-muted-foreground">Registro operacional disponível somente para consulta. Nenhuma ação operacional pode ser registrada após o encerramento.</p></div><section className="surface-panel p-4"><div className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" aria-hidden="true" /><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("w04.live.timeline")}</p></div>{(events.data ?? []).length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("w04.live.noEvents")}</p> : <ol className="mt-3 space-y-2">{(events.data ?? []).map((event) => <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-sm"><span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDateTime(event.occurred_at, { locale, timeZone: timezone })}</span><span>{eventLabel(event.event_type, t)}</span></li>)}</ol>}</section></section>;
}

function OperationWorkspace() {
  const { t } = useI18n();
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId" });
  const location = useLocation();
  const operation = useQuery({ queryKey: ["operation-workspace-status", operationId], queryFn: async () => { const { data, error } = await supabase.from("operations").select("status, timezone").eq("id", operationId).maybeSingle(); if (error) throw error; return data; } });
  const status = operation.data?.status as OperationStatus | undefined;
  const terminal = isOperationTerminal(status);
  const isOverview = location.pathname === `/operations/${operationId}`;
  const isLive = location.pathname === `/operations/${operationId}/live`;
  const isExcellence = location.pathname === `/operations/${operationId}/excellence`;

  const tab = (to: string, label: string) => <Link from="/operations/$operationId" to={to as never} className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{label}</Link>;

  return <AppShell activeId="operations" title={t("op.title")}><div className="mx-auto w-full max-w-5xl space-y-5"><RequireTenant><Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9"><Link to="/operations"><ArrowLeft className="mr-2 size-4" aria-hidden="true" />{t("op.back")}</Link></Button><nav aria-label={t("op.title")} className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-elevated/50 p-1"><Link from="/operations/$operationId" to="/operations/$operationId" activeOptions={{ exact: true }} className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{t("roster.tab.overview")}</Link>{tab("/operations/$operationId/people", t("roster.tab.people"))}{tab("/operations/$operationId/journey", t("w04.tab.journey"))}{tab("/operations/$operationId/live", t("w04.tab.live"))}{tab("/operations/$operationId/mobility", t("w05.tab.mobility"))}{tab("/operations/$operationId/hospitality", t("w06.tab.hospitality"))}{tab("/operations/$operationId/costs", "Custos")}{tab("/operations/$operationId/contracts", "Contratos")}{tab("/operations/$operationId/events", t("w07.tab.events"))}{tab("/operations/$operationId/communication", t("w08.tab.communication"))}{status === "completed" ? tab("/operations/$operationId/excellence", "Excelência") : null}</nav>{operation.isLoading ? <PanelSkeleton /> : terminal && isLive && status ? <TerminalLiveRecord operationId={operationId} status={status} timezone={operation.data?.timezone ?? "America/Sao_Paulo"} /> : terminal && !isOverview && !isExcellence ? <><div className="surface-panel border-success/40 px-4 py-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">{status === "completed" ? "Operação concluída." : "Operação cancelada."}</span>{" "}Este registro histórico está disponível somente para consulta.</div><fieldset disabled className="min-w-0 border-0 p-0 disabled:cursor-not-allowed"><Outlet /></fieldset></> : <><Outlet />{isOverview ? <ExcellenceSummaryCard operationId={operationId} enabled={status === "completed"} /> : null}</>}</RequireTenant></div></AppShell>;
}