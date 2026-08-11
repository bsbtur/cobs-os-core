import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { BrandLockup } from "@/app/shell/brand";
import { Button } from "@/components/ui/button";
import { FullPageLoading } from "@/components/feedback/loading";

/**
 * COBS OS · P0.2.1 — operator access gate.
 *
 * BINDING: an authenticated identity WITHOUT an operational Membership never
 * receives administrative chrome. It is routed to the traveler portal when it
 * holds effective Participant Access (W10), otherwise it gets a neutral
 * "account without access" state. This gate never creates Membership, Person,
 * Participation, Tenant or Grant — it only decides what to render.
 */

function useEffectivePortalAccess(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["access-posture", "portal", user?.id],
    enabled: enabled && Boolean(user?.id),
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_participant_access");
      if (error) return false;
      const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
      return rows.some((row) => row["effective"] === true);
    },
  });
}

function NoAccountAccess() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const { refetch } = useTenant();

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-md">
        <BrandLockup />
        <div className="surface-panel mt-6 p-6">
          <span className="grid size-11 place-items-center rounded-lg bg-primary-soft text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">{t("access.none.title")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("access.none.body")}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={() => refetch()}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              {t("access.none.recheck")}
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => void signOut()}>
              {t("access.none.signOut")}
            </Button>
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <Link
              to="/onboarding"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("access.none.org")}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">{t("access.none.orgHint")}</p>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Renders children only for identities with an operational Membership. */
export function RequireOperatorAccess({ children }: { children: React.ReactNode }) {
  const { loading, memberships } = useTenant();
  const navigate = useNavigate();
  const hasMembership = memberships.length > 0;
  const portal = useEffectivePortalAccess(!loading && !hasMembership);

  const shouldRedirectToPortal = !loading && !hasMembership && portal.data === true;

  React.useEffect(() => {
    if (shouldRedirectToPortal) void navigate({ to: "/my", replace: true });
  }, [shouldRedirectToPortal, navigate]);

  if (loading) return <FullPageLoading />;
  if (hasMembership) return <>{children}</>;
  if (portal.isLoading || shouldRedirectToPortal) return <FullPageLoading />;

  return <NoAccountAccess />;
}
