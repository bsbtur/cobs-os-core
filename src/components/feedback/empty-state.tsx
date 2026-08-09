import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Empty state primitive.
 * Empty is a first-class state: it explains *why* it is empty and what unlocks it.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-dashed border-border-strong bg-elevated/60 px-6 py-10 text-center animate-fade",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] hairline-grid"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
        {Icon ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : null}
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {body ? <p className="text-sm leading-relaxed text-muted-foreground">{body}</p> : null}
        {hint ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
            {hint}
          </p>
        ) : null}
        {action}
      </div>
    </div>
  );
}
