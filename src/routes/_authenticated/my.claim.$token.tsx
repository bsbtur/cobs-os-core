import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { portalKeys } from "@/lib/w10";
import { clearPendingClaim } from "@/lib/claim-intent";
import { PortalFrame } from "@/app/portal/portal-shell";
import { EmptyState } from "@/components/feedback/empty-state";

/**
 * Invitation claim.
 *
 * SECURITY: the raw token is single-use and must never linger in the address
 * bar, history, referrer or any log.
 *
 * DEF-PILOT-016: the claim is consumed in `beforeLoad`, before anything is
 * rendered, and the route then redirects (history replace) to the portal with
 * an explicit outcome flag. The previous implementation consumed the token in
 * a component effect while rewriting the URL with `history.replaceState`,
 * which made the router re-match `/my` and unmount the page mid-flight — the
 * claim never completed and the traveler silently landed on an empty portal.
 */
export const Route = createFileRoute("/_authenticated/my/claim/$token")({
  head: () => ({
    meta: [
      { title: "Accept invitation — COBS OS traveler portal" },
      {
        name: "description",
        content: "Confirm your access to the experience you were invited to.",
      },
      { property: "og:title", content: "Accept invitation — COBS OS traveler portal" },
      { property: "og:description", content: "One-time access confirmation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ params, context }) => {
    // The pending intent has served its purpose; clearing it first prevents
    // any resume loop, whatever the outcome of the claim.
    clearPendingClaim();

    const { data, error } = await supabase.rpc("accept_participant_access_invitation", {
      _token: params.token,
    });

    if (error) {
      // Never log or echo the token. Invalid / expired / revoked / already
      // used / foreign identity all resolve to one explicit, safe outcome.
      throw redirect({ to: "/my", search: { claim: "invalid" as const }, replace: true });
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    const operationId =
      typeof payload["operation_id"] === "string" ? payload["operation_id"] : undefined;

    await context.queryClient.invalidateQueries({ queryKey: portalKeys.all });

    throw redirect({
      to: "/my",
      search: { claim: "ok" as const, ...(operationId ? { operation: operationId } : {}) },
      replace: true,
    });
  },
  component: ClaimPending,
  pendingComponent: ClaimPending,
});

function ClaimPending() {
  const { t } = useI18n();
  return (
    <PortalFrame title={t("w10.claim.title")}>
      <EmptyState icon={Loader2} title={t("w10.claim.working")} body={t("w10.claim.body")} />
    </PortalFrame>
  );
}
