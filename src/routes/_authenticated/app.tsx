import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { OperatorAttentionBlock } from "@/components/dashboard/operator-attention-block";
import { OperatorNowBlock } from "@/components/dashboard/operator-now-block";
import {
  OperatorDashboardHeader,
  OperatorSecondaryOverview,
} from "@/components/dashboard/operator-secondary-overview";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Centro operacional — COBS OS" },
      {
        name: "description",
        content: "Centro operacional do COBS OS para acompanhar execução, atenções e contexto das operações.",
      },
      { property: "og:title", content: "Centro operacional — COBS OS" },
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
        <OperatorDashboardHeader />
        <RequireTenant>
          <div className="animate-rise space-y-6" style={{ animationDelay: "80ms" }}>
            <OperatorNowBlock />
            <OperatorAttentionBlock />
            <OperatorSecondaryOverview />
          </div>
        </RequireTenant>
      </div>
    </AppShell>
  );
}
