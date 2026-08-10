import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Bus,
  BedDouble,
  Home,
  Megaphone,
  MoreHorizontal,
  Ticket,
  Globe,
  LogOut,
  Moon,
  Sun,
  ChevronLeft,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useI18n, LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * COBS OS · W10 — PortalShell.
 *
 * A participant surface, deliberately NOT the operator AppShell:
 * no rail, no command palette, no tenant switcher, no admin destinations.
 * Mobile-first; on desktop it stays a centered reading surface.
 */

type TabId = "home" | "journey" | "mobility" | "stay" | "events" | "messages";

const PRIMARY: Array<{ id: TabId; icon: typeof Home; labelKey: string; to: string }> = [
  { id: "home", icon: Home, labelKey: "w10.nav.home", to: "/my/$operationId" },
  { id: "journey", icon: CalendarDays, labelKey: "w10.nav.journey", to: "/my/$operationId/journey" },
  { id: "mobility", icon: Bus, labelKey: "w10.nav.mobility", to: "/my/$operationId/mobility" },
  { id: "stay", icon: BedDouble, labelKey: "w10.nav.stay", to: "/my/$operationId/stay" },
];

const SECONDARY: Array<{ id: TabId; icon: typeof Home; labelKey: string; to: string }> = [
  { id: "events", icon: Ticket, labelKey: "w10.nav.events", to: "/my/$operationId/events" },
  { id: "messages", icon: Megaphone, labelKey: "w10.nav.messages", to: "/my/$operationId/messages" },
];

function AccountMenu() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={t("w10.nav.language")}
          >
            <Globe className="size-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {LOCALES.map((l: Locale) => (
            <DropdownMenuItem key={l} onSelect={() => setLocale(l)}>
              {LOCALE_LABELS[l]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={t("w10.nav.theme")}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? (
          <Sun className="size-5" aria-hidden="true" />
        ) : (
          <Moon className="size-5" aria-hidden="true" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={t("w10.nav.signOut")}
        onClick={() => void signOut()}
      >
        <LogOut className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function PortalFrame({
  title,
  back,
  children,
}: {
  title: string;
  back?: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {back ? (
              <Link
                to={back.to}
                aria-label={back.label}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Link>
            ) : null}
            <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
          </div>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4 lg:pb-12">{children}</main>
    </div>
  );
}

export function PortalShell({
  operationId,
  title,
  active,
  children,
}: {
  operationId: string;
  title: string;
  active: TabId;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const navigate = useNavigate();

  const tabClass = (isActive: boolean) =>
    cn(
      "flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px]",
      isActive ? "text-primary" : "text-muted-foreground",
    );

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/my"
              aria-label={t("w10.portal.back")}
              className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
            <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
          </div>
          <AccountMenu />
        </div>

        {/* Desktop: inline tabs instead of a bottom bar. No admin destinations. */}
        <nav className="mx-auto hidden w-full max-w-3xl gap-1 px-4 pb-2 lg:flex">
          {[...PRIMARY, ...SECONDARY].map((tab) => (
            <Link
              key={tab.id}
              to={tab.to}
              params={{ operationId }}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                active === tab.id
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tab.labelKey)}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4 lg:pb-12">{children}</main>

      {/* Mobile: 4 primary destinations + Mais. Never the operator tab bar. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label={t("w10.portal.brand")}
      >
        <div className="mx-auto flex w-full max-w-3xl items-stretch gap-0.5 px-1 py-1">
          {PRIMARY.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                to={tab.to}
                params={{ operationId }}
                className={tabClass(active === tab.id)}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="w-full truncate text-center">{t(tab.labelKey)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={tabClass(active === "events" || active === "messages")}
          >
            <MoreHorizontal className="size-5 shrink-0" aria-hidden="true" />
            <span className="w-full truncate text-center">{t("w10.nav.more")}</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <SheetHeader>
            <SheetTitle>{t("w10.nav.more")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">
            {SECONDARY.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className="flex min-h-[52px] items-center gap-3 rounded-lg border border-border px-4 text-left text-sm text-foreground"
                  onClick={() => {
                    setMoreOpen(false);
                    void navigate({ to: tab.to, params: { operationId } });
                  }}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{t(tab.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
