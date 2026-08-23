import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { DashboardHeader, OperationalDashboard } from "@/components/dashboard/operational-dashboard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Centro de comando — COBS OS" },
      {
        name: "description",
        content: "Dashboard executivo e operacional do COBS OS com dados reais da organização.",
      },
      { property: "og:title", content: "Centro de comando — COBS OS" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandCenter,
});

function CommandCenter() {
  const { t } = useI18n();

  return (
    <AppShell activeId="overview" title={t("overview.title")}>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <DashboardHeader />
        <RequireTenant>
          <div className="animate-rise" style={{ animationDelay: "80ms" }}>
            <OperationalDashboard />
          </div>
        </RequireTenant>
      </div>
    </AppShell>
  );
}
