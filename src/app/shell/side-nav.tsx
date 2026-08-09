import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Command as CommandIcon } from "lucide-react";

import { NAV_SECTIONS, type NavItem } from "@/lib/navigation";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BrandLockup } from "./brand";
import { OrgContext } from "./org-context";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const { t } = useI18n();
  const Icon = item.icon;

  const row = (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200",
        "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-0 w-[2px] -translate-y-1/2 rounded-full bg-sidebar-primary transition-all duration-300",
          active && "h-5",
        )}
        aria-hidden="true"
      />
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
      {item.status === "planned" ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/40">
          {item.activatesIn}
        </span>
      ) : null}
    </Link>
  );

  if (item.status !== "planned") return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right">
        {item.domain} — {item.activatesIn}
      </TooltipContent>
    </Tooltip>
  );
}

export function SideNav({
  activeId,
  onOpenCommand,
}: {
  activeId: string;
  onOpenCommand: () => void;
}) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("nav.section.command")}
      className="flex h-full w-[268px] shrink-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar px-3 py-4 text-sidebar-foreground"
    >
      <div className="px-1">
        <BrandLockup />
      </div>

      <OrgContext />

      <button
        type="button"
        onClick={onOpenCommand}
        className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-ring"
      >
        <CommandIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{t("topbar.searchShort")}</span>
        <kbd className="shrink-0 rounded border border-sidebar-border px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.id} className="space-y-1">
            <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">
              {t(section.labelKey)}
            </p>
            {section.items.map((item) => (
              <NavRow key={item.id} item={item} active={item.id === activeId} />
            ))}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-sidebar-border/70 bg-sidebar-accent/30 px-3 py-2.5">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
          <span className="size-1.5 rounded-full bg-success animate-pulse-dot" aria-hidden="true" />
          W00 · foundation
        </p>
      </div>
    </nav>
  );
}
