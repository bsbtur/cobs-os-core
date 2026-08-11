import * as React from "react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";

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
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const UNGATED_PREFIXES = ["/my", "/invite", "/onboarding"];

/**
 * DEF-PILOT-016: resume a claim that was interrupted by authentication
 * (e.g. account creation with e-mail confirmation landing on another URL).
 */
function ResumePendingClaim() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  React.useEffect(() => {
    if (pathname.startsWith("/my/claim/")) return;
    const token = readPendingClaim();
    if (!token) return;
    void navigate({ to: "/my/claim/$token", params: { token }, replace: true });
  }, [pathname, navigate]);

  return null;
}

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
      <ResumePendingClaim />
      <AccessRouter />
    </TenantProvider>
  );
}

