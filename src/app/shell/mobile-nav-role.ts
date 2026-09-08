import { MOBILE_NAV_ITEMS } from "@/lib/navigation";
import type { AppRole } from "@/lib/tenant";

const MANAGER_PRIMARY_IDS = ["overview", "operations", "commerce"] as const;
const OPERATOR_PRIMARY_IDS = ["operations", "people", "inbox"] as const;

export function mobilePrimaryIdsForRole(role: AppRole | null): string[] {
  if (role === "owner" || role === "admin") return [...MANAGER_PRIMARY_IDS];
  if (role === "operations_agent") return [...OPERATOR_PRIMARY_IDS];
  return MOBILE_NAV_ITEMS.map((item) => item.id);
}
