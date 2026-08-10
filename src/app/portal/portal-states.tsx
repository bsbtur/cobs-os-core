import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ShieldOff, WifiOff } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { isDenied } from "@/lib/w10";

/**
 * COBS OS · W10 — participant-safe states.
 * "denied" is ONE generic state for every authorization outcome:
 * revoked grant, cancelled participation, cancelled operation, wrong id,
 * cross-tenant id, profile mismatch. No enumeration signal, ever.
 */

export function PortalDenied() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={ShieldOff}
      title={t("w10.denied.title")}
      body={t("w10.denied.body")}
      action={
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/my">{t("w10.denied.back")}</Link>
        </Button>
      }
    />
  );
}

export function PortalLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={WifiOff}
      title={t("w10.error.title")}
      body={t("w10.error.body")}
      action={
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          {t("w10.error.retry")}
        </Button>
      }
    />
  );
}

/** Uniform loading / denied / transport-error gate for every portal query. */
export function PortalQueryGate({
  isLoading,
  error,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (isLoading) return <PanelSkeleton rows={4} />;
  if (error) return isDenied(error) ? <PortalDenied /> : <PortalLoadError onRetry={onRetry} />;
  return <>{children}</>;
}

export function PortalCard({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-elevated/60 p-4 ${className}`}>
      {title ? (
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

/** Planned baseline vs updated forecast — never exposes internal state machines. */
export function PortalTime({
  planned,
  expected,
  timeZone,
}: {
  planned: string | null;
  expected: string | null;
  timeZone?: string | null;
}) {
  const { t, locale } = useI18n();
  const ctx = { locale, timeZone: timeZone ?? undefined };
  if (!planned && !expected) {
    return <span className="text-xs text-muted-foreground">{t("w10.time.tbd")}</span>;
  }
  if (expected && planned && expected !== planned) {
    return (
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
        <span className="font-medium text-foreground">
          {t("w10.time.expected")}: {formatDateTime(expected, ctx)}
        </span>
        <span className="text-muted-foreground line-through">{formatDateTime(planned, ctx)}</span>
      </span>
    );
  }
  return (
    <span className="text-xs text-foreground">
      {formatDateTime((expected ?? planned)!, ctx)}
    </span>
  );
}

export function PortalTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
      {children}
    </span>
  );
}

export function PortalEmpty({ body }: { body: string }) {
  return <EmptyState title={body} />;
}
