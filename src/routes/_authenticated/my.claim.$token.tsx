import * as React from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ShieldOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { portalKeys } from "@/lib/w10";
import { PortalFrame } from "@/app/portal/portal-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";

/**
 * Invitation claim.
 * SECURITY: the raw token is single-use and must never linger in the address
 * bar, history, referrer or any log. We capture it once into memory and strip
 * it from the URL before the network call is even made.
 */
export const Route = createFileRoute("/_authenticated/my/claim/$token")({
  head: () => ({
    meta: [
      { title: "Accept invitation — COBS OS traveler portal" },
      { name: "description", content: "Confirm your access to the experience you were invited to." },
      { property: "og:title", content: "Accept invitation — COBS OS traveler portal" },
      { property: "og:description", content: "One-time access confirmation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClaimPage,
});

type ClaimState = "working" | "success" | "invalid";

function ClaimPage() {
  const { token } = useParams({ from: "/_authenticated/my/claim/$token" });
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [state, setState] = React.useState<ClaimState>("working");
  const [operationId, setOperationId] = React.useState<string | null>(null);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;

    const raw = token;
    // Strip immediately: replaceState does not re-run the router, so the
    // component stays mounted while the secret leaves the URL.
    if (typeof window !== "undefined") {
      // Replace with "/my" (never "/my/claim", which collides with the
      // "/my/$operationId" dynamic route and would send "claim" to the RPC).
      window.history.replaceState(window.history.state, "", "/my");
    }

    void (async () => {
      const { data, error } = await supabase.rpc("accept_participant_access_invitation", {
        _token: raw,
      });
      if (error) {
        setState("invalid");
        return;
      }
      const payload = (data ?? {}) as Record<string, unknown>;
      const opId = typeof payload["operation_id"] === "string" ? payload["operation_id"] : null;
      setOperationId(opId);
      await queryClient.invalidateQueries({ queryKey: portalKeys.all });
      setState("success");
    })();
  }, [token, queryClient]);

  return (
    <PortalFrame title={t("w10.claim.title")}>
      {state === "working" ? (
        <EmptyState
          icon={Loader2}
          title={t("w10.claim.working")}
          body={t("w10.claim.body")}
        />
      ) : state === "success" ? (
        <EmptyState
          icon={CheckCircle2}
          title={t("w10.claim.success")}
          body={t("w10.claim.body")}
          action={
            <Button
              className="min-h-11"
              onClick={() =>
                void navigate(
                  operationId
                    ? { to: "/my/$operationId", params: { operationId }, replace: true }
                    : { to: "/my", replace: true },
                )
              }
            >
              {t("w10.list.open")}
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={ShieldOff}
          title={t("w10.claim.invalid")}
          body={t("w10.denied.body")}
          action={
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void navigate({ to: "/my", replace: true })}
            >
              {t("w10.denied.back")}
            </Button>
          }
        />
      )}
    </PortalFrame>
  );
}
