import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { TenantProvider } from "@/lib/tenant";

/**
 * COBS OS · W01 — authenticated boundary.
 * ssr:false because the Supabase session lives in browser storage.
 * Every route below this layout requires a real, confirmed account.
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

function AuthenticatedLayout() {
  return (
    <TenantProvider>
      <Outlet />
    </TenantProvider>
  );
}
