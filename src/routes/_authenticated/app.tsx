import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { AdminOverview } from "@/components/dashboard/admin-overview";
import { OperatorAttentionBlock } from "@/components/dashboard/operator-attention-block";
import { OperatorNowBlock } from "@/components/dashboard/operator-now-block";
import {
  OperatorDashboardHeader,
  OperatorSecondaryOverview,
} from "@/components/dashboard/operator-secondary-overview";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Centro de comando — COBS OS" },
      {
        name: "description",
        content: "Centro de comando do COBS OS adaptado ao papel ativo na organização.",
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
  const { canManage } = useTenant();

  return (
    <AppShell activeId="overview" title={t("overview.title")}>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <RequireTenant>
          {canManage ? (
            <AdminOverview />
          ) : (
            <>
              <OperatorDashboardHeader />
              <div className="animate-rise space-y-6" style={{ animationDelay: "80ms" }}>
                <OperatorNowBlock />
                <OperatorAttentionBlock />
                <OperatorSecondaryOverview />
              </div>
            </>
          )}
        </RequireTenant>
      </div>
    </AppShell>
  );
}
