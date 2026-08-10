import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import { MOBILE_NAV_ITEMS, NAV_SECTIONS } from "@/lib/navigation";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OrgContext } from "./org-context";
import { BrandLockup } from "./brand";

const CELL_CLASS =
  "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] transition-colors";

/**
 * Field-first bottom navigation: 3 primary destinations + a "More" trigger.
 * The grid is exactly 4 cells — items never wrap or overlap at 390px.
 */
export function MobileTabBar({
  activeId,
  onOpenMenu,
}: {
  activeId: string;
  onOpenMenu: () => void;
}) {
  const { t } = useI18n();
  const primaryIds = MOBILE_NAV_ITEMS.map((item) => item.id);
  const moreActive = !primaryIds.includes(activeId);

  return (
    <nav
      aria-label={t("nav.section.domains")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <li key={item.id} className="min-w-0">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(CELL_CLASS, active ? "text-primary" : "text-muted-foreground")}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full transition-all duration-300",
                    active ? "bg-primary-soft" : "bg-transparent",
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
            className={cn(CELL_CLASS, moreActive ? "text-primary" : "text-muted-foreground")}
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full transition-all duration-300",
                moreActive ? "bg-primary-soft" : "bg-transparent",
              )}
            >
              <MoreHorizontal className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="max-w-full truncate">{t("nav.more")}</span>
          </button>
        </li>
      </ul>
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[300px] border-sidebar-border bg-sidebar p-0">
        <SheetHeader className="px-4 pt-4 text-left">
          <SheetTitle className="text-sidebar-foreground">
            <BrandLockup />
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-3 pb-6 pt-4">
          <OrgContext />
          {NAV_SECTIONS.map((section) => (
            <div key={section.id} className="space-y-1">
              <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">
                {t(section.labelKey)}
              </p>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeId;
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    onClick={() => onOpenChange(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/75",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
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
