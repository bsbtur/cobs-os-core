import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/feedback/loading";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { eventLabel, type JourneyEventRow } from "@/lib/w04";
import { isOperationTerminal, type OperationStatus } from "@/lib/w02";

/** Operation workspace layout — exposes only implemented areas. */
export const Route = createFileRoute("/_authenticated/operations/$operationId")({ component: OperationWorkspace });
const TAB_CLASS = "inline-flex min-h-11 items-center rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

function TerminalLiveRecord({ operationId, status, timezone }: { operationId: string; status: OperationStatus; timezone: string }) {
  const { t, locale } = useI18n();
  const events = useQuery({ queryKey: ["terminal-live-events", operationId], queryFn: async () => { const { data, error } = await supabase.from("journey_events").select("*").eq("operation_id", operationId).order("occurred_at", { ascending: false }).limit(40); if (error) throw error; return (data ?? []) as JourneyEventRow[]; } });
  if (events.isLoading) return <PanelSkeleton />;
  const completed = status === "completed";
  return <section className="space-y-4"><header><h2 className="text-xl font-semibold">{t("w04.live.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("w04.live.subtitle")}</p></header><div className="surface-panel border-success/40 px-4 py-4"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">{completed ? "Operação concluída" : "Operação cancelada"}</p><h3 className="mt-2 text-lg font-semibold">Jornada concluída</h3><p className="mt-1 text-sm text-muted-foreground">Registro operacional disponível somente para consulta. Nenhuma ação operacional pode ser registrada após o encerramento.</p></div><section className="surface-panel p-4"><div className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" aria-hidden="true" /><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("w04.live.timeline")}</p></div>{(events.data ?? []).length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("w04.live.noEvents")}</p> : <ol className="mt-3 space-y-2">{(events.data ?? []).map((event) => <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-sm"><span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDateTime(event.occurred_at, { locale, timeZone: timezone })}</span><span>{eventLabel(event.event_type, t)}</span></li>)}</ol>}</section></section>;
}

function OperationWorkspace() {
  const { t } = useI18n(); const { operationId } = useParams({ from: "/_authenticated/operations/$operationId" }); const location = useLocation();
  const operation = useQuery({ queryKey: ["operation-workspace-status", operationId], queryFn: async () => { const { data, error } = await supabase.from("operations").select("status, timezone").eq("id", operationId).maybeSingle(); if (error) throw error; return data; } });
  const status = operation.data?.status as OperationStatus | undefined; const terminal = isOperationTerminal(status); const isOverview = location.pathname === `/operations/${operationId}`; const isLive = location.pathname === `/operations/${operationId}/live`;
  const tabs = [
    { to: "/operations/$operationId", label: t("roster.tab.overview"), exact: true },
    { to: "/operations/$operationId/people", label: t("roster.tab.people") },
    { to: "/operations/$operationId/journey", label: t("w04.tab.journey") },
    { to: "/operations/$operationId/live", label: t("w04.tab.live") },
    { to: "/operations/$operationId/mobility", label: t("w05.tab.mobility") },
    { to: "/operations/$operationId/hospitality", label: t("w06.tab.hospitality") },
    { to: "/operations/$operationId/costs", label: "Custos" },
    { to: "/operations/$operationId/contracts", label: "Contratos" },
    { to: "/operations/$operationId/events", label: t("w07.tab.events") },
    { to: "/operations/$operationId/communication", label: t("w08.tab.communication") },
  ] as const;
  return <AppShell activeId="operations" title={t("op.title")}><div className="mx-auto w-full max-w-5xl space-y-5"><RequireTenant><Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9"><Link to="/operations"><ArrowLeft className="mr-2 size-4" aria-hidden="true" />{t("op.back")}</Link></Button><nav aria-label={t("op.title")} className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-elevated/50 p-1">{tabs.map((tab) => <Link key={tab.to} from="/operations/$operationId" to={tab.to} activeOptions={"exact" in tab ? { exact: tab.exact } : undefined} className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{tab.label}</Link>)}</nav>{operation.isLoading ? <PanelSkeleton /> : terminal && isLive && status ? <TerminalLiveRecord operationId={operationId} status={status} timezone={operation.data?.timezone ?? "America/Sao_Paulo"} /> : terminal && !isOverview ? <><div className="surface-panel border-success/40 px-4 py-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">{status === "completed" ? "Operação concluída." : "Operação cancelada."}</span>{" "}Este registro histórico está disponível somente para consulta.</div><fieldset disabled className="min-w-0 border-0 p-0 disabled:cursor-not-allowed"><Outlet /></fieldset></> : <Outlet />}</RequireTenant></div></AppShell>;
}
