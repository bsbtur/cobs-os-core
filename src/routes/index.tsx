import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Fingerprint, Layers, ShieldCheck, Waypoints } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { BrandLockup } from "@/app/shell/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "COBS OS — Global Experience Operations System" },
      {
        name: "description",
        content:
          "COBS OS is a multi-tenant operating system for global experience operations: planned, expected and actual, separated by design.",
      },
      { property: "og:title", content: "COBS OS — Global Experience Operations System" },
      {
        property: "og:description",
        content:
          "Multi-tenant experience operations from day one. Facts over manual status. No fake analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  { icon: Layers, key: "planned" },
  { icon: Waypoints, key: "domain" },
  { icon: Fingerprint, key: "person" },
  { icon: ShieldCheck, key: "security" },
] as const;

type PillarKey = (typeof PILLARS)[number]["key"];

const PILLAR_COPY: Record<PillarKey, { title: string; body: string }> = {
  planned: {
    title: "PLANNED ≠ EXPECTED ≠ ACTUAL",
    body: "Three distinct truths, never collapsed into one status field.",
  },
  domain: {
    title: "DOMAIN OWNERSHIP",
    body: "Every fact has one owner. No shared mutable state across domains.",
  },
  person: {
    title: "PERSON ≠ LOGIN ≠ ROLE",
    body: "A person exists without an account. Identity is not authorization.",
  },
  security: {
    title: "SECURITY BY DEFAULT",
    body: "Multi-tenant isolation, auditability and idempotency from day one.",
  },
};

function Landing() {
  const { t } = useI18n();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 command-canvas animate-sheen"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22] hairline-grid"
        aria-hidden="true"
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 lg:px-8">
        <BrandLockup />
        <Button asChild size="sm">
          <Link to="/sign-in">{t("landing.primary")}</Link>
        </Button>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-20 lg:px-8">
        <section className="grid gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-20">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span
                className="size-1.5 rounded-full bg-success animate-pulse-dot"
                aria-hidden="true"
              />
              {t("landing.eyebrow")}
            </p>
            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
              {t("landing.title")}
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
              {t("landing.body")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="group min-h-11">
                <Link to="/sign-in">
                  {t("landing.primary")}
                  <ArrowRight className="ml-2 size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Button>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {t("landing.status")}
              </span>
            </div>
          </div>

          <div
            className="animate-rise surface-panel relative overflow-hidden p-1"
            style={{ animationDelay: "120ms" }}
          >
            <div className="rounded-[calc(var(--radius-xl)-4px)] bg-sidebar p-5 text-sidebar-foreground">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/50">
                Runtime posture
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ["Tenancy", "Multi-tenant, day one"],
                  ["Truth model", "Facts, append-only runtime"],
                  ["Analytics", "None until real facts exist"],
                  ["Locale", "pt-BR · en-US · es-ES"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-4 border-b border-sidebar-border/60 pb-2 last:border-0"
                  >
                    <dt className="text-sidebar-foreground/55">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section aria-label={t("principles.title")} className="grid gap-3 sm:grid-cols-2">
          {PILLARS.map(({ icon: Icon, key }, i) => (
            <article
              key={key}
              className="animate-rise surface-panel flex gap-3 p-4 transition-transform duration-300 hover:-translate-y-0.5"
              style={{ animationDelay: `${160 + i * 70}ms` }}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.14em]">
                  {PILLAR_COPY[key].title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{PILLAR_COPY[key].body}</p>
              </div>
            </article>
          ))}
        </section>
      </main>

      <footer className="relative border-t border-border px-5 py-6 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground lg:px-8">
        COBS OS · {t("footer.rights")}
      </footer>
    </div>
  );
}
