import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Fingerprint, Layers, ShieldCheck, Waypoints } from "lucide-react";

import { LOCALE_LABELS, type Locale, useI18n } from "@/lib/i18n";
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

type LandingLocaleCopy = {
  runtimeTitle: string;
  runtimeRows: Array<[string, string]>;
  pillars: Record<PillarKey, { title: string; body: string }>;
};

const LANDING_COPY: Record<Locale, LandingLocaleCopy> = {
  "pt-BR": {
    runtimeTitle: "Postura operacional",
    runtimeRows: [
      ["Tenancy", "Multi-tenant desde o primeiro dia"],
      ["Modelo de verdade", "Fatos em runtime append-only"],
      ["Indicadores", "Somente quando existirem fatos reais"],
      ["Idiomas", "pt-BR · en-US · es-ES"],
    ],
    pillars: {
      planned: {
        title: "PLANEJADO ≠ PREVISTO ≠ REALIZADO",
        body: "Três verdades distintas, nunca reduzidas a um único campo de status.",
      },
      domain: {
        title: "RESPONSABILIDADE POR DOMÍNIO",
        body: "Cada fato tem um único responsável. Não há estado mutável compartilhado entre domínios.",
      },
      person: {
        title: "PESSOA ≠ LOGIN ≠ FUNÇÃO",
        body: "Uma pessoa existe sem uma conta. Identidade não é autorização.",
      },
      security: {
        title: "SEGURANÇA POR PADRÃO",
        body: "Isolamento multi-tenant, auditabilidade e idempotência desde o primeiro dia.",
      },
    },
  },
  "en-US": {
    runtimeTitle: "Runtime posture",
    runtimeRows: [
      ["Tenancy", "Multi-tenant from day one"],
      ["Truth model", "Facts, append-only runtime"],
      ["Analytics", "Only when real facts exist"],
      ["Locales", "pt-BR · en-US · es-ES"],
    ],
    pillars: {
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
    },
  },
  "es-ES": {
    runtimeTitle: "Postura operativa",
    runtimeRows: [
      ["Tenancy", "Multi-tenant desde el primer día"],
      ["Modelo de verdad", "Hechos en runtime append-only"],
      ["Indicadores", "Solo cuando existan hechos reales"],
      ["Idiomas", "pt-BR · en-US · es-ES"],
    ],
    pillars: {
      planned: {
        title: "PLANIFICADO ≠ PREVISTO ≠ REALIZADO",
        body: "Tres verdades distintas, nunca reducidas a un único campo de estado.",
      },
      domain: {
        title: "RESPONSABILIDAD POR DOMINIO",
        body: "Cada hecho tiene un único responsable. No existe estado mutable compartido entre dominios.",
      },
      person: {
        title: "PERSONA ≠ LOGIN ≠ ROL",
        body: "Una persona existe sin una cuenta. La identidad no es autorización.",
      },
      security: {
        title: "SEGURIDAD POR DEFECTO",
        body: "Aislamiento multi-tenant, auditabilidad e idempotencia desde el primer día.",
      },
    },
  },
};

function Landing() {
  const { locale, setLocale, t } = useI18n();
  const copy = LANDING_COPY[locale];

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

      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 lg:px-8">
        <BrandLockup />
        <div className="flex shrink-0 items-center gap-2">
          <label className="sr-only" htmlFor="landing-locale">
            {t("topbar.language")}
          </label>
          <select
            id="landing-locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            className="h-8 max-w-[9rem] rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-none"
            aria-label={t("topbar.language")}
          >
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((option) => (
              <option key={option} value={option}>
                {LOCALE_LABELS[option]}
              </option>
            ))}
          </select>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link to="/auth" search={{ redirect: undefined }}>
              {t("landing.primary")}
            </Link>
          </Button>
        </div>
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
                <Link to="/auth" search={{ redirect: undefined }}>
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
                {copy.runtimeTitle}
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                {copy.runtimeRows.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-4 border-b border-sidebar-border/60 pb-2 last:border-0"
                  >
                    <dt className="min-w-0 text-sidebar-foreground/55">{key}</dt>
                    <dd className="max-w-[62%] text-right font-medium leading-snug">{value}</dd>
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
                  {copy.pillars[key].title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{copy.pillars[key].body}</p>
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
