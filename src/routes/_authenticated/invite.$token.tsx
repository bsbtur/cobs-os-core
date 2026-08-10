import * as React from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { MailCheck, ShieldX } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { feedback } from "@/components/feedback/feedback";

export const Route = createFileRoute("/_authenticated/invite/$token")({
  head: () => ({
    meta: [
      { title: "Accept invitation — COBS OS" },
      {
        name: "description",
        content: "Accept a single-use COBS OS invitation and join the organization that invited you.",
      },
      { property: "og:title", content: "Accept invitation — COBS OS" },
      {
        property: "og:description",
        content: "Single-use, replay-safe invitation acceptance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const { t, locale } = useI18n();
  const { token } = useParams({ from: "/_authenticated/invite/$token" });
  const navigate = useNavigate();
  const { refetch, setActiveTenantId } = useTenant();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
    setBusy(false);

    if (error) {
      const message = humanizeError(error, locale);
      setFailed(message);
      feedback.error(message);
      return;
    }

    const result = data as { tenant_id?: string } | null;
    if (result?.tenant_id) setActiveTenantId(result.tenant_id);
    refetch();
    feedback.success(t("invite.accepted"));
    void navigate({ to: "/app" });
  };

  return (
    <AppShell activeId="overview" title={t("invite.title")}>
      <div className="mx-auto w-full max-w-lg">
        <section className="surface-panel animate-rise p-6 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-lg bg-primary-soft text-primary">
            {failed ? <ShieldX className="size-5" /> : <MailCheck className="size-5" />}
          </span>
          <h2 className="mt-4 text-xl font-semibold">{t("invite.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {failed ?? t("invite.subtitle")}
          </p>
          {!failed ? (
            <Button className="mt-6 min-h-11 w-full" onClick={() => void accept()} disabled={busy}>
              {busy ? t("common.saving") : t("invite.accept")}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="mt-6 min-h-11 w-full"
              onClick={() => void navigate({ to: "/app" })}
            >
              {t("invite.back")}
            </Button>
          )}
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("invite.singleUse")}
          </p>
        </section>
      </div>
    </AppShell>
  );
}
