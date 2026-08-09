import { createFileRoute } from "@tanstack/react-router";
import { Compass, Database, Radar, ShieldCheck } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS } from "@/lib/navigation";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Command center — COBS OS" },
      {
        name: "description",
        content:
          "COBS OS command center shell: multi-tenant experience operations foundation with no operational data yet.",
      },
      { property: "og:title", content: "Command center — COBS OS" },
      {
        property: "og:description",
        content: "COBS OS command center shell for global experience operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandCenter,
});

const POSTURE = [
  { icon: Database, label: "Business tables", value: "0" },
  { icon: Radar, label: "Operational facts", value: "0" },
  { icon: ShieldCheck, label: "Tenant isolation", value: "By design" },
  { icon: Compass, label: "Active workflow", value: "W00" },
] as const;

function CommandCenter() {
  const { t } = useI18n();
  const planned = NAV_ITEMS.filter((i) => i.status === "planned");

  return (
    <AppShell activeId="overview" title={t("overview.title")}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="animate-rise">
          <h2 className="text-2xl font-semibold lg:text-3xl">{t("overview.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("overview.subtitle")}</p>
        </section>

        <section
          className="animate-rise grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          style={{ animationDelay: "80ms" }}
          aria-label="Runtime posture"
        >
          {POSTURE.map(({ icon: Icon, label, value }) => (
            <article key={label} className="surface-panel flex items-center gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {label}
                </p>
                <p className="truncate text-lg font-semibold">{value}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="animate-rise" style={{ animationDelay: "140ms" }}>
          <EmptyState
            icon={Radar}
            title={t("overview.noAnalytics")}
            body={t("overview.noAnalyticsBody")}
            hint="NO FAKE ANALYTICS · FACTS OVER MANUAL STATUS"
          />
        </section>

        <section className="animate-rise space-y-3" style={{ animationDelay: "200ms" }}>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("nav.section.domains")}
          </h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {planned.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.id}
                  className="surface-panel flex items-center gap-3 p-3.5 transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t(item.labelKey)}</p>
                    <p className="truncate text-xs text-muted-foreground">domain: {item.domain}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {item.activatesIn}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
