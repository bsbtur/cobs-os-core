import { cn } from "@/lib/utils";

/** COBS mark: an operational aperture — four quadrants converging on one signal. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[0.7rem] bg-primary text-primary-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <span className="absolute inset-0 opacity-70 command-canvas animate-sheen" />
      <svg viewBox="0 0 24 24" className="relative size-5" fill="none" stroke="currentColor">
        <path d="M12 3a9 9 0 1 0 9 9" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3.2" strokeWidth="2" />
        <path d="M12 12 20 4" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <BrandMark />
      {compact ? null : (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-display text-[0.95rem] font-semibold tracking-tight">
            COBS OS
          </span>
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Experience Ops
          </span>
        </span>
      )}
    </span>
  );
}
