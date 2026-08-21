import { useEffect, type ReactNode } from "react";
import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Sparkles } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { FieldBatchPresence } from "@/components/journey/field-batch-presence";
import { FieldModePendingFirst } from "@/components/journey/field-mode-pending-first";
import { JourneyOperationalCockpit } from "@/components/journey/journey-operational-cockpit";
import { JourneyManagementPanel } from "@/components/journey/journey-management-panel";
import { LiveNextBestAction } from "@/components/journey/live-next-best-action";
import { OperationAttentionCenter } from "@/components/operations/operation-attention-center";
import { OperationControlCenter } from "@/components/operations/operation-control-center";
import { OperationHistoryTimeline } from "@/components/operations/operation-history-timeline";
import { OperationIntelligenceCockpit } from "@/components/operations/operation-intelligence-cockpit";
import { PostOperationDebrief } from "@/components/operations/post-operation-debrief";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** Operation workspace layout — exposes only implemented areas. */
export const Route = createFileRoute("/_authenticated/operations/$operationId")({
  component: OperationWorkspace,
});

const TAB_CLASS =
  "inline-flex min-h-11 items-center rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

function OperationRuntimeQuerySync({ operationId }: { operationId: string }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      const queryKey = event?.query?.queryKey;
      if (!queryKey || queryKey[0] !== "live" || queryKey[1] !== operationId) return;

      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["px04-next-best-action", operationId] }),
        queryClient.invalidateQueries({ queryKey: ["px05-operation-attention", operationId] }),
        queryClient.invalidateQueries({ queryKey: ["operation-intelligence", operationId] }),
      ]);
    });
  }, [operationId, queryClient]);

  return null;
}

function OverviewDisclosure({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className="group surface-panel overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none hover:bg-elevated/40 focus-ring">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
          <p className="mt-1 text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-border bg-background/30 p-3 sm:p-4">{children}</div>
    </details>
  );
}

function OperationWorkspace() {
  const { t, locale } = useI18n();
  const location = useLocation();
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId" });
  const base = `/operations/${operationId}`;
  const isOverview = location.pathname === base || location.pathname === `${base}/`;
  const isLive = location.pathname.endsWith(`${base}/live`);
  const isCockpitV2 = location.pathname.endsWith(`${base}/cockpit-v2`);
  const isFieldFocused = isLive || isCockpitV2;

  return (
    <AppShell activeId="operations" title={t("op.title")}>
      <div
        className={`mx-auto w-full max-w-5xl space-y-5 ${isFieldFocused ? "field-runtime" : ""}`}
      >
        <RequireTenant>
          <OperationRuntimeQuerySync operationId={operationId} />
          {!isCockpitV2 ? <FieldModePendingFirst operationId={operationId} /> : null}

          <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-9">
            <Link to="/operations">
              <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
              {t("op.back")}
            </Link>
          </Button>

          <nav
            aria-label={t("op.title")}
            className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-elevated/50 p-1"
          >
            <Link
              from="/operations/$operationId"
              to="/operations/$operationId"
              activeOptions={{ exact: true }}
              className={TAB_CLASS}
              activeProps={{ className: "bg-primary-soft !text-primary" }}
            >
              {t("roster.tab.overview")}
            </Link>
            <Link
              from="/operations/$operationId"
              to="/operations/$operationId/cockpit-v2"
              className={`${TAB_CLASS} gap-1.5`}
              activeProps={{ className: "bg-primary-soft !text-primary" }}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {copy(locale, "Cockpit V2", "Cockpit V2")}
            </Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/people" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>
              {t("roster.tab.people")}
            </Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/schedule" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>
              {copy(locale, "Escala", "Schedule")}
            </Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/journey" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>
              {t("w04.tab.journey")}
            </Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/live" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>
              {t("w04.tab.live")}
            </Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/mobility" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>
              {t("w05.tab.mobility")}
            </Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/hospitality" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>
              {t("w06.tab.hospitality")}
            </Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/events" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>
              {t("w07.tab.events")}
            </Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/communication" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>
              {t("w08.tab.communication")}
            </Link>
          </nav>

          {isOverview ? (
            <>
              <OperationIntelligenceCockpit operationId={operationId} />
              <OperationControlCenter operationId={operationId} />
              <PostOperationDebrief operationId={operationId} />

              <OverviewDisclosure
                eyebrow="Audit trail"
                title={copy(locale, "Histórico da operação", "Operation history")}
                description={copy(
                  locale,
                  "Linha do tempo factual para auditoria e investigação.",
                  "Factual timeline for audit and investigation.",
                )}
              >
                <OperationHistoryTimeline operationId={operationId} />
              </OverviewDisclosure>
            </>
          ) : null}

          {!isCockpitV2 ? (
            <>
              <LiveNextBestAction operationId={operationId} />
              <OperationAttentionCenter operationId={operationId} />
              <FieldBatchPresence operationId={operationId} />
              <JourneyOperationalCockpit operationId={operationId} />
              <JourneyManagementPanel operationId={operationId} />
            </>
          ) : null}

          {isOverview ? (
            <OverviewDisclosure
              eyebrow={copy(locale, "Administração", "Administration")}
              title={copy(locale, "Planejamento e ciclo de vida", "Planning & lifecycle")}
              description={copy(
                locale,
                "Janelas planned/expected, status, arquivamento e controles administrativos.",
                "Planned/expected windows, status, archiving and administrative controls.",
              )}
            >
              <Outlet />
            </OverviewDisclosure>
          ) : (
            <Outlet />
          )}
        </RequireTenant>
      </div>
    </AppShell>
  );
}
