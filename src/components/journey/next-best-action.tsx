import { ArrowRight, CheckCircle2, ClipboardCheck, MapPin, Users } from "lucide-react";

import type { JourneyStepRow, Readiness } from "@/lib/w04";
import { useI18n } from "@/lib/i18n";

type Guidance = {
  key: string;
  count?: number;
  icon: typeof ArrowRight;
  tone: "primary" | "warning" | "success" | "muted";
};

/**
 * PX04 — display-only operational guidance.
 * Mirrors already-loaded runtime facts and existing UI/backend invariants.
 * It never writes, calls RPCs, or creates a parallel lifecycle rule.
 */
function deriveGuidance({
  current,
  next,
  readiness,
  boardingStarted,
  arrived,
  unconfirmedCount,
}: {
  current: JourneyStepRow | null;
  next: JourneyStepRow | null;
  readiness: Readiness | null;
  boardingStarted: boolean;
  arrived: boolean;
  unconfirmedCount: number;
}): Guidance | null {
  if (!current && next) return { key: "startNext", icon: ArrowRight, tone: "primary" };
  if (!current) return null;

  if (unconfirmedCount > 0) {
    return { key: "confirmTravelers", count: unconfirmedCount, icon: Users, tone: "warning" };
  }

  const missingPeople = readiness?.missing_participations.length ?? 0;
  if (missingPeople > 0) {
    return { key: "resolveTravelers", count: missingPeople, icon: Users, tone: "warning" };
  }

  const missingItems = readiness?.missing_required_items.length ?? 0;
  if (missingItems > 0) {
    return { key: "completeChecklist", count: missingItems, icon: ClipboardCheck, tone: "warning" };
  }

  if (current.presence_requirement === "boarded" && !boardingStarted) {
    return { key: "startBoarding", icon: ArrowRight, tone: "primary" };
  }

  const requiresArrival =
    current.step_kind === "movement" ||
    current.step_kind === "return" ||
    current.step_kind === "disembarkation";
  if (readiness?.ready && requiresArrival && !arrived) {
    return { key: "recordArrival", icon: MapPin, tone: "primary" };
  }

  if (readiness?.ready) {
    return { key: "concludeStep", icon: CheckCircle2, tone: "success" };
  }

  return { key: "reviewBlockers", icon: ClipboardCheck, tone: "muted" };
}

export function NextBestAction(props: {
  current: JourneyStepRow | null;
  next: JourneyStepRow | null;
  readiness: Readiness | null;
  boardingStarted: boolean;
  arrived: boolean;
  unconfirmedCount: number;
}) {
  const { t } = useI18n();
  const guidance = deriveGuidance(props);
  if (!guidance) return null;

  const Icon = guidance.icon;
  const toneClass = {
    primary: "border-primary/25 bg-primary/5 text-foreground",
    warning: "border-warning/25 bg-warning-soft text-warning",
    success: "border-success/25 bg-success-soft text-success",
    muted: "border-border bg-muted/60 text-muted-foreground",
  }[guidance.tone];

  const title = t(`w04.guidance.${guidance.key}`);
  const detailKey = `w04.guidance.${guidance.key}Detail`;
  const detail = t(detailKey).replace("{count}", String(guidance.count ?? 0));

  return (
    <div className={`mt-3 rounded-xl border px-3 py-3 ${toneClass}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
        {t("w04.guidance.label")}
      </p>
      <div className="mt-1.5 flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs opacity-80">{detail}</p>
        </div>
      </div>
    </div>
  );
}
