import * as React from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";

/** Inline loading indicator — three-phase operational pulse, not a spinner cliché. */
export function LoadingPulse({ label, className }: { label?: string; className?: string }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      <span className="flex items-end gap-[3px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-3 w-[3px] rounded-full bg-primary animate-pulse-dot"
            style={{ animationDelay: `${i * 180}ms` }}
          />
        ))}
      </span>
      <span>{label ?? t("state.loading")}</span>
    </div>
  );
}

/** Skeleton block used while a panel resolves. */
export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function FullPageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <LoadingPulse />
    </div>
  );
}
