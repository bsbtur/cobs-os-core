import {
  Activity,
  BarChart3,
  CalendarRange,
  Globe2,
  LayoutGrid,
  Settings2,
  Users,
  UsersRound,
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
  to: "/app" | "/experiences" | "/operations" | "/people" | "/team" | "/settings" | "/inbox";
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
        to: "/experiences",
        icon: CalendarRange,
        status: "live",
        domain: "experience",
        activatesIn: "W02",
      },
      {
        id: "operations",
        labelKey: "nav.operations",
        to: "/operations",
        icon: Activity,
        status: "live",
        domain: "operation",
        activatesIn: "W02",
        mobile: true,
      },
      {
        id: "people",
        labelKey: "nav.people",
        to: "/people",
        icon: Users,
        status: "live",
        domain: "identity",
        activatesIn: "W01",
        mobile: true,
      },
      {
        id: "team",
        labelKey: "nav.team",
        to: "/team",
        icon: UsersRound,
        status: "live",
        domain: "identity",
        activatesIn: "W01",
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
        to: "/settings",
        icon: Settings2,
        status: "live",
        domain: "platform",
        activatesIn: "W01",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/**
 * Mobile bottom bar holds AT MOST 3 primary destinations; the 4th slot is always
 * the "More" trigger that opens the full drawer. Never exceed 3 here — a 5th cell
 * wraps and overlaps at 390px.
 */
export const MOBILE_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => i.mobile).slice(0, 3);

export type RouteMeta = {
  path: string;
  titleKey: string;
  /** Whether the route sits behind the (structural) authenticated boundary. */
  authenticated: boolean;
  indexable: boolean;
};

export const ROUTE_META: RouteMeta[] = [
  { path: "/", titleKey: "landing.title", authenticated: false, indexable: true },
  { path: "/auth", titleKey: "auth.title", authenticated: false, indexable: false },
  { path: "/app", titleKey: "overview.title", authenticated: true, indexable: false },
  { path: "/onboarding", titleKey: "onboarding.title", authenticated: true, indexable: false },
  { path: "/experiences", titleKey: "exp.title", authenticated: true, indexable: false },
  {
    path: "/experiences/$experienceId",
    titleKey: "exp.title",
    authenticated: true,
    indexable: false,
  },
  { path: "/operations", titleKey: "op.title", authenticated: true, indexable: false },
  { path: "/operations/$operationId", titleKey: "op.title", authenticated: true, indexable: false },
  {
    path: "/operations/$operationId/mobility",
    titleKey: "w05.title",
    authenticated: true,
    indexable: false,
  },
  {
    path: "/operations/$operationId/hospitality",
    titleKey: "w06.title",
    authenticated: true,
    indexable: false,
  },
  { path: "/people", titleKey: "people.title", authenticated: true, indexable: false },
  { path: "/team", titleKey: "team.title", authenticated: true, indexable: false },
  { path: "/settings", titleKey: "settings.title", authenticated: true, indexable: false },
  { path: "/settings/fleet", titleKey: "w05.fleet.title", authenticated: true, indexable: false },
  {
    path: "/settings/properties",
    titleKey: "w06.prop.title",
    authenticated: true,
    indexable: false,
  },
];

