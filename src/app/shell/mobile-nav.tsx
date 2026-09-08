import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import {
  isNavItemVisible,
  MOBILE_NAV_ITEMS,
  NAV_ITEMS,
  NAV_SECTIONS,
  type NavItem,
} from "@/lib/navigation";
import { useI18n } from "@/lib/i18n";
import { useTenant, type AppRole } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OrgContext } from "./org-context";
import { BrandLockup } from "./brand";

const CELL_CLASS =
  "group flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors";

const MANAGER_PRIMARY_IDS = ["overview", "operations", "commerce"] as const;
const OPERATOR_PRIMARY_IDS = ["operations", "people", "inbox"] as const;

function itemsById(ids: readonly string[]): NavItem[] {
  return ids
    .map((id) => NAV_ITEMS.find((item) => item.id === id))
    .filter((item): item is NavItem => Boolean(item));
}

function primaryItemsForRole(role: AppRole | null, canManage: boolean): NavItem[] {
  if (canManage) return itemsById(MANAGER_PRIMARY_IDS);
  if (role === "operations_agent") return itemsById(OPERATOR_PRIMARY_IDS);
  return MOBILE_NAV_ITEMS;
}

/**
 * Role-focused bottom navigation: owner/admin memberships see command/operations/commerce,
 * operations_agent sees operations/people/inbox, and other memberships preserve the neutral
 * V1 defaults. This changes emphasis only; the full drawer preserves every destination already
 * allowed by the existing RBAC.
 */
export function MobileTabBar({
  activeId,
  onOpenMenu,
}: {
  activeId: string;
  onOpenMenu: () => void;
}) {
  const { t } = useI18n();
  const { canManage, role } = useTenant();
  const primaryItems = primaryItemsForRole(role, canManage);
  const primaryIds = primaryItems.map((item) => item.id);
  const moreActive = !primaryIds.includes(activeId);

  return (
    <nav
      aria-label={t("nav.section.domains")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto w-full max-w-xl px-2 py-1.5">
        <ul className="grid grid-cols-4 gap-1">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeId;
            return (
              <li key={item.id} className="min-w-0">
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    CELL_CLASS,
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-muted-foreground hover:bg-elevated/60 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full transition-transform duration-200",
                      active && "scale-105",
                    )}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="max-w-full truncate">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              type="button"
              onClick={onOpenMenu}
              aria-haspopup="dialog"
              className={cn(
                CELL_CLASS,
                moreActive
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-elevated/60 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full transition-transform duration-200",
                  moreActive && "scale-105",
                )}
              >
                <MoreHorizontal className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="max-w-full truncate">{t("nav.more")}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

/** Full navigation drawer for the remaining destinations on mobile. */
export function MobileNavDrawer({
  open,
  onOpenChange,
  activeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: string;
}) {
  const { t } = useI18n();
  const { canManage, role } = useTenant();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[min(320px,calc(100vw-24px))] border-sidebar-border bg-sidebar p-0"
      >
        <SheetHeader className="border-b border-sidebar-border px-4 pb-4 pt-4 text-left">
          <SheetTitle className="text-sidebar-foreground">
            <BrandLockup />
          </SheetTitle>
          {role ? (
            <div className="pt-2">
              <span className="inline-flex min-h-8 items-center rounded-full border border-sidebar-border bg-sidebar-accent/50 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-primary">
                {t(`role.${role}`)}
              </span>
            </div>
          ) : null}
        </SheetHeader>
        <div className="space-y-5 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
          <OrgContext />
          {NAV_SECTIONS.map((section) => (
            <div key={section.id} className="space-y-1">
              <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">
                {t(section.labelKey)}
              </p>
              {section.items
                .filter((item) => isNavItemVisible(item, canManage))
                .map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeId;
                  return (
                    <Link
                      key={item.id}
                      to={item.to}
                      onClick={() => onOpenChange(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm text-sidebar-foreground/75 transition-colors",
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-0 w-[2px] -translate-y-1/2 rounded-full bg-sidebar-primary transition-all duration-200",
                          active && "h-5",
                        )}
                        aria-hidden="true"
                      />
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg",
                          active ? "bg-sidebar-primary/15 text-sidebar-primary" : "bg-transparent",
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                      {item.status === "planned" ? (
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/40">
                          {item.activatesIn}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
