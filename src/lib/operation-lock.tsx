import { Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function isOperationClosed(status: string | null | undefined): boolean {
  return status === "completed" || status === "cancelled";
}

export function ReadOnlyNotice({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground ${className}`} role="note">
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span><strong className="font-medium text-foreground">{t("op.readOnly")}</strong>{" "}{t("op.readOnlyBody")}</span>
    </div>
  );
}
