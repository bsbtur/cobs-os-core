import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { JourneyOperationalCockpit } from "@/components/journey/journey-operational-cockpit";
import { JourneyManagementPanel } from "@/components/journey/journey-management-panel";
import { LiveNextBestAction } from "@/components/journey/live-next-best-action";
import { OperationAttentionCenter } from "@/components/operations/operation-attention-center";
import { OperationIntelligenceCockpit } from "@/components/operations/operation-intelligence-cockpit";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** Operation workspace layout — exposes only implemented areas. */
export const Route = createFileRoute("/_authenticated/operations/$operationId")({
  component: OperationWorkspace,
});

const TAB_CLASS =
  "inline-flex min-h-11 items-center rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

function OperationWorkspace() {
  const { t } = useI18n();
  const location = useLocation();
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId" });
  const isLive = location.pathname.endsWith(`/operations/${operationId}/live`);

  return (
    <AppShell activeId="operations" title={t("op.title")}>
      <div className={`mx-auto w-full max-w-5xl space-y-5 ${isLive ? "field-runtime" : ""}`}>
        <RequireTenant>
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
            <Link from="/operations/$operationId" to="/operations/$operationId" activeOptions={{ exact: true }} className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{t("roster.tab.overview")}</Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/people" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{t("roster.tab.people")}</Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/journey" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{t("w04.tab.journey")}</Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/live" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{t("w04.tab.live")}</Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/mobility" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{t("w05.tab.mobility")}</Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/hospitality" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{t("w06.tab.hospitality")}</Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/events" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{t("w07.tab.events")}</Link>
            <Link from="/operations/$operationId" to="/operations/$operationId/communication" className={TAB_CLASS} activeProps={{ className: "bg-primary-soft !text-primary" }}>{t("w08.tab.communication")}</Link>
          </nav>

          <OperationIntelligenceCockpit operationId={operationId} />
          <LiveNextBestAction operationId={operationId} />
          <OperationAttentionCenter operationId={operationId} />
          {/* Keep QA journey controls mounted with the operation workspace so Preview builds always include them. */}
          <JourneyOperationalCockpit operationId={operationId} />
          <JourneyManagementPanel operationId={operationId} />
          <Outlet />
        </RequireTenant>
      </div>
    </AppShell>
  );
}