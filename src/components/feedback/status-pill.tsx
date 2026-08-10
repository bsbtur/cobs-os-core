import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_BY_STATUS: Record<string, Tone> = {
  draft: "neutral",
  planning: "info",
  ready: "warning",
  active: "success",
  completed: "info",
  cancelled: "danger",
  paused: "warning",
  archived: "neutral",
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border-strong bg-elevated text-muted-foreground",
  info: "border-primary/30 bg-primary-soft text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Status is derived truth, never decoration: one visual language across all domains. */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const { t } = useI18n();
  const tone = TONE_BY_STATUS[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {t(`status.${status}`)}
    </span>
  );
}
