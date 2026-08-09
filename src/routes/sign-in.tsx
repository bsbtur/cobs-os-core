import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LockKeyhole } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { BrandLockup } from "@/app/shell/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedback } from "@/components/feedback/feedback";

export const Route = createFileRoute("/sign-in")({
  head: () => ({
    meta: [
      { title: "Sign in — COBS OS" },
      {
        name: "description",
        content: "Structural authentication boundary for COBS OS experience operations.",
      },
      { property: "og:title", content: "Sign in — COBS OS" },
      {
        property: "og:description",
        content: "Structural authentication boundary for COBS OS experience operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const { t } = useI18n();

  // W00: presentational only. No credentials are transmitted, stored or validated.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    feedback.info(t("signin.notice"));
  };

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1fr_minmax(0,520px)]">
      <section className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 command-canvas animate-sheen" aria-hidden="true" />
        <div className="relative">
          <BrandLockup />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">{t("brand.tagline")}</h2>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/65">
            {t("landing.body")}
          </p>
        </div>
        <p className="relative font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">
          {t("footer.rights")}
        </p>
      </section>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm animate-rise">
          <div className="lg:hidden">
            <BrandLockup />
          </div>
          <h1 className="mt-6 text-2xl font-semibold lg:mt-0">{t("signin.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("signin.body")}</p>

          <form className="mt-7 space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="cobs-email">{t("signin.email")}</Label>
              <Input
                id="cobs-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@organization.com"
                className="min-h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cobs-password">{t("signin.password")}</Label>
              <Input
                id="cobs-password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="min-h-11"
              />
            </div>
            <Button type="submit" className="min-h-11 w-full">
              {t("signin.submit")}
            </Button>
          </form>

          <p className="mt-4 flex items-start gap-2 rounded-lg border border-dashed border-border-strong bg-elevated/70 px-3 py-2.5 text-xs text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{t("signin.notice")}</span>
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t("signin.back")}
            </Link>
            <Link to="/app" className="font-medium text-primary hover:underline">
              {t("signin.preview")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
