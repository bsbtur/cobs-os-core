import * as React from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W01 — tenant (organization) context.
 * MULTI-TENANT FROM DAY ONE: nothing is ever queried without an explicit tenant.
 */

export type AppRole = Database["public"]["Enums"]["app_role"];
export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
export type PersonRow = Database["public"]["Tables"]["people"]["Row"];
export type InvitationRow = Database["public"]["Tables"]["invitations"]["Row"];

export type MembershipWithTenant = MembershipRow & { tenants: Tenant | null };

export const ROLE_ORDER: AppRole[] = ["owner", "admin", "operations_agent", "member"];

const ACTIVE_TENANT_KEY = "cobs.activeTenantId";

export function useMemberships(): UseQueryResult<MembershipWithTenant[]> {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["memberships", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("*, tenants(*)")
        .eq("profile_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as MembershipWithTenant[];
    },
  });
}

type TenantContextValue = {
  memberships: MembershipWithTenant[];
  activeMembership: MembershipWithTenant | null;
  tenant: Tenant | null;
  role: AppRole | null;
  isOwner: boolean;
  canManage: boolean;
  loading: boolean;
  hasError: boolean;
  setActiveTenantId: (id: string) => void;
  refetch: () => void;
};

const TenantContext = React.createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError, refetch } = useMemberships();
  const memberships = React.useMemo(() => data ?? [], [data]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(ACTIVE_TENANT_KEY);
    if (stored) setActiveId(stored);
  }, []);

  const activeMembership =
    memberships.find((m) => m.tenant_id === activeId) ?? memberships[0] ?? null;

  const setActiveTenantId = React.useCallback((id: string) => {
    window.localStorage.setItem(ACTIVE_TENANT_KEY, id);
    setActiveId(id);
  }, []);

  const value = React.useMemo<TenantContextValue>(() => {
    const role = activeMembership?.role ?? null;
    return {
      memberships,
      activeMembership,
      tenant: activeMembership?.tenants ?? null,
      role,
      isOwner: role === "owner",
      canManage: role === "owner" || role === "admin",
      loading: isLoading,
      hasError: isError,
      setActiveTenantId,
      refetch: () => void refetch(),
    };
  }, [memberships, activeMembership, isLoading, isError, setActiveTenantId, refetch]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = React.useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}
