import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { TenantProvider } from "@/lib/tenant";
import { RequireOperatorAccess } from "@/app/shell/access-gate";

/**
 * COBS OS · W01 — authenticated boundary.
 * ssr:false because the Supabase session lives in browser storage.
 * Every route below this layout requires a real, confirmed account.
 *
 * P0.2.1: authentication alone is NOT authorization. Administrative surfaces
 * are gated by an operational Membership; traveler surfaces (/my, including
 * the W10 claim flow), the W01 invitation claim and organization creation stay
 * outside that gate.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
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
