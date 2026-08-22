import * as React from "react";
import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { TenantProvider } from "@/lib/tenant";
import { RequireOperatorAccess } from "@/app/shell/access-gate";
import { claimTokenFromPath, readPendingClaim, savePendingClaim } from "@/lib/claim-intent";

/**
 * COBS OS · W01 — authenticated boundary.
 * ssr:false because the Supabase session lives in browser storage.
 * Every route below this layout requires a real, confirmed account.
 *
 * P0.2.1: authentication alone is NOT authorization. Administrative surfaces
 * are gated by an operational Membership; traveler surfaces (/my, including
 * the W10 claim flow), the W01 invitation claim and organization creation stay
 * outside that gate.
 *
 * DEF-PILOT-016: an anonymous traveler opening a portal claim link must not
 * lose the token on the way to authentication.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      const pending = claimTokenFromPath(location.pathname);
      if (pending) savePendingClaim(pending);
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }

    // DEF-PILOT-017: resume a preserved claim before rendering any access
    // posture. A component effect runs too late: /app can render the neutral
    // no-access decision before the pending invitation is consumed.
    if (!location.pathname.startsWith("/my/claim/")) {
      const pending = readPendingClaim();
      if (pending) {
        // A claim intent belongs to a traveler authentication flow. Never let
        // residual browser state divert an operator session into that flow.
        const { data: memberships, error: membershipError } = await supabase
          .from("memberships")
          .select("id")
          .eq("profile_id", data.user.id)
          .eq("status", "active")
          .limit(1);
        if (membershipError) return { user: data.user };
        if ((memberships ?? []).length > 0) return { user: data.user };

        throw redirect({
          to: "/my/claim/$token",
          params: { token: pending },
          replace: true,
        });
      }
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const UNGATED_PREFIXES = ["/my", "/invite", "/onboarding"];

function AccessRouter() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ungated = UNGATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (ungated) return <Outlet />;
  return (
    <RequireOperatorAccess>
      <Outlet />
    </RequireOperatorAccess>
  );
}

function AuthenticatedLayout() {
  return (
    <TenantProvider>
      <AccessRouter />
    </TenantProvider>
  );
}
