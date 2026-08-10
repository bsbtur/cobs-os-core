import { Building2, Check, ChevronsUpDown } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Organization (tenant) context switcher.
 * MULTI-TENANT FROM DAY ONE: the active tenant is always explicit and visible.
 */
export function OrgContext({ tone = "sidebar" }: { tone?: "sidebar" | "bar" }) {
  const { t } = useI18n();
  const { memberships, tenant, setActiveTenantId } = useTenant();
  const sidebar = tone === "sidebar";
  const label = tenant?.name ?? t("org.placeholder");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={
          sidebar
            ? "flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent focus-ring"
            : "flex max-w-[220px] items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left transition-colors hover:bg-elevated focus-ring"
        }
        aria-label={t("org.context")}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <Building2 className="size-3.5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.16em] opacity-60">
            {t("org.context")}
          </span>
          <span className="truncate text-xs font-medium">{label}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("org.context")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.length === 0 ? (
          <DropdownMenuItem disabled>{t("org.placeholder")}</DropdownMenuItem>
        ) : (
          memberships.map((membership) => (
            <DropdownMenuItem
              key={membership.tenant_id}
              onSelect={() => setActiveTenantId(membership.tenant_id)}
            >
              <span className="flex-1 truncate">
                {membership.tenants?.name ?? membership.tenant_id}
              </span>
              {membership.tenant_id === tenant?.id ? (
                <Check className="size-3.5 opacity-70" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("org.hint")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
