import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Languages, Menu, Moon, Search, Sun, UserRound } from "lucide-react";

import { useI18n, LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { formatTimeZoneLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/feedback/empty-state";
import { BrandLockup } from "./brand";

export function TopBar({
  title,
  onOpenCommand,
  onOpenMenu,
}: {
  title: string;
  onOpenCommand: () => void;
  onOpenMenu: () => void;
}) {
  const { t, locale, setLocale, timeZone } = useI18n();
  const { theme, toggle } = useTheme();
  const [clock, setClock] = React.useState("");

  React.useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(new Date()),
      );
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [locale, timeZone]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 lg:hidden"
            aria-label={t("topbar.menu")}
            onClick={onOpenMenu}
          >
            <Menu className="size-5" />
          </Button>
          <span className="lg:hidden">
            <BrandLockup compact />
          </span>
          <div className="hidden min-w-0 lg:block">
            <h1 className="truncate text-base font-semibold">{title}</h1>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {clock} · {formatTimeZoneLabel(timeZone, locale)} · {timeZone}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpenCommand}
            className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground md:flex focus-ring"
          >
            <Search className="size-4" aria-hidden="true" />
            <span className="w-44 text-left">{t("topbar.search")}</span>
            <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 md:hidden"
            aria-label={t("topbar.search")}
            onClick={onOpenCommand}
          >
            <Search className="size-5" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative min-h-11 min-w-11"
                aria-label={t("topbar.notifications")}
              >
                <Bell className="size-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-3">
              <EmptyState
                icon={Bell}
                title={t("notifications.empty")}
                body={t("notifications.emptyHint")}
                className="border-none bg-transparent px-2 py-4"
              />
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label={t("topbar.language")}
              >
                <Languages className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("topbar.language")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {LOCALES.map((l: Locale) => (
                <DropdownMenuItem key={l} onSelect={() => setLocale(l)}>
                  <span className={l === locale ? "font-semibold text-primary" : undefined}>
                    {LOCALE_LABELS[l]}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t("topbar.theme")}
            onClick={toggle}
          >
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label={t("topbar.account")}
              >
                <span className="grid size-7 place-items-center rounded-full bg-primary-soft text-primary">
                  <UserRound className="size-4" aria-hidden="true" />
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("account.signedOut")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>{t("account.profile")}</DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/sign-in">{t("account.signIn")}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
