import * as React from "react";
import { Navigate } from "@tanstack/react-router";

import { SideNav } from "./side-nav";
import { TopBar } from "./top-bar";
import { MobileNavDrawer, MobileTabBar } from "./mobile-nav";
import { CommandPalette, useCommandPalette } from "./command-palette";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FullPageLoading } from "@/components/feedback/loading";
import { ADMIN_ONLY_NAV_IDS } from "@/lib/navigation";
import { useTenant } from "@/lib/tenant";

/**
 * Responsive AppShell.
 * Desktop = persistent command center (rail + dense top bar).
 * Mobile = field surface (thumb tab bar + drawer, no persistent chrome).
 *
 * Security boundary: authenticated does not imply administrative access.
 * Only users with an active organization membership may render AppShell.
 * Grant-only travelers remain on the isolated /my portal.
 * Administrative surfaces are restricted to owner/admin memberships.
 */
export function AppShell({
  activeId,
  title,
  children,
}: {
  activeId: string;
  title: string;
  children: React.ReactNode;
}) {
  const { open, setOpen } = useCommandPalette();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { activeMembership, canManage, loading } = useTenant();

  if (loading) return <FullPageLoading />;

  if (!activeMembership) {
    return <Navigate to="/my" replace />;
  }

  if (ADMIN_ONLY_NAV_IDS.has(activeId) && !canManage) {
    return <Navigate to="/app" replace />;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen w-full bg-background">
        <a
          href="#cobs-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Skip to content
        </a>

        <aside className="sticky top-0 hidden h-screen lg:block">
          <SideNav activeId={activeId} onOpenCommand={() => setOpen(true)} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            title={title}
            onOpenCommand={() => setOpen(true)}
            onOpenMenu={() => setMenuOpen(true)}
          />
          <main id="cobs-main" className="min-w-0 flex-1 px-4 pb-24 pt-5 lg:px-8 lg:pb-10 lg:pt-7">
            {children}
          </main>
        </div>

        <MobileTabBar activeId={activeId} onOpenMenu={() => setMenuOpen(true)} />
        <MobileNavDrawer open={menuOpen} onOpenChange={setMenuOpen} activeId={activeId} />
        <CommandPalette open={open} onOpenChange={setOpen} />
      </div>
    </TooltipProvider>
  );
}
