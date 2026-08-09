import {
  Activity,
  BarChart3,
  CalendarRange,
  Globe2,
  LayoutGrid,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Typed navigation registry + route metadata (W00).
 * Single source of truth for desktop nav, mobile nav, command palette and breadcrumbs.
 * `status: "planned"` items are architectural placeholders — they render, but carry no data.
 */

export type NavStatus = "live" | "planned";

export type NavItem = {
  id: string;
  /** i18n key for the label */
  labelKey: string;
  /** Route path — planned routes intentionally resolve to the shell overview in W00. */
  to: "/app";
  icon: LucideIcon;
  status: NavStatus;
  /** Domain owner — enforces the DOMAIN OWNERSHIP rule. */
  domain: string;
  /** Workflow that activates this domain. */
  activatesIn: string;
  mobile?: boolean;
};

export type NavSection = {
  id: string;
  labelKey: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "command",
    labelKey: "nav.section.command",
    items: [
      {
        id: "overview",
        labelKey: "nav.overview",
        to: "/app",
        icon: LayoutGrid,
        status: "live",
        domain: "shell",
        activatesIn: "W00",
        mobile: true,
      },
    ],
  },
  {
    id: "domains",
    labelKey: "nav.section.domains",
    items: [
      {
        id: "experiences",
        labelKey: "nav.experiences",
        to: "/app",
        icon: CalendarRange,
        status: "planned",
        domain: "experience",
        activatesIn: "W02",
        mobile: true,
      },
      {
        id: "operations",
        labelKey: "nav.operations",
        to: "/app",
        icon: Activity,
        status: "planned",
        domain: "operation",
        activatesIn: "W03",
        mobile: true,
      },
      {
        id: "people",
        labelKey: "nav.people",
        to: "/app",
        icon: Users,
        status: "planned",
        domain: "identity",
        activatesIn: "W01",
        mobile: true,
      },
      {
        id: "network",
        labelKey: "nav.network",
        to: "/app",
        icon: Globe2,
        status: "planned",
        domain: "network",
        activatesIn: "W04",
      },
      {
        id: "insights",
        labelKey: "nav.insights",
        to: "/app",
        icon: BarChart3,
        status: "planned",
        domain: "insight",
        activatesIn: "W05",
      },
    ],
  },
  {
    id: "system",
    labelKey: "nav.section.system",
    items: [
      {
        id: "settings",
        labelKey: "nav.settings",
        to: "/app",
        icon: Settings2,
        status: "planned",
        domain: "platform",
        activatesIn: "W01",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export const MOBILE_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => i.mobile);

export type RouteMeta = {
  path: string;
  titleKey: string;
  /** Whether the route sits behind the (structural) authenticated boundary. */
  authenticated: boolean;
  indexable: boolean;
};

export const ROUTE_META: RouteMeta[] = [
  { path: "/", titleKey: "landing.title", authenticated: false, indexable: true },
  { path: "/sign-in", titleKey: "signin.title", authenticated: false, indexable: false },
  { path: "/app", titleKey: "overview.title", authenticated: true, indexable: false },
];
