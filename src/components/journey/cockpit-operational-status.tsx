import * as React from "react";
import { AlertTriangle, CheckCircle2, Clock3, PauseCircle } from "lucide-react";

import { deriveTimingSnapshot, formatDuration } from "@/components/journey/live-timing-strip";
import type { JourneyStepRow, Readiness } from "@/lib/w04";

type StatusTone = "success" | "warning" | "critical" | "muted";

type OperationalStatus = {
  label: string;
  title: string;
  detail: string;
  tone: StatusTone;
  icon: typeof CheckCircle2;
};

const TICK_MS = 30_000;

function useNow() {
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return now;
}

function deriveOperationalStatus({
  current,
  readiness,
  unconfirmedCount,
  now,
}: {
  current: JourneyStepRow | null;
  readiness: Readiness | null;
  unconfirmedCount: number;
  now: number;
}): OperationalStatus {
  if (!current) {
    return {
      label: "Aguardando",
      title: "Sem etapa ativa",
      detail: "O COBS aguarda o início da próxima etapa ou o encerramento da jornada.",
      tone: "muted",
      icon: PauseCircle,
    };
  }

  const timing = deriveTimingSnapshot(current, now);
  if (timing.lateMs > 0) {
    return {
      label: "Atraso",
      title: `+${formatDuration(timing.lateMs)}`,
      detail: "A etapa atual ultrapassou o horário previsto. Priorize a próxima ação abaixo.",
      tone: "critical",
      icon: Clock3,
    };
  }

  const missingPeople = readiness?.missing_participations.length ?? 0;
  const missingItems = readiness?.missing_required_items.length ?? 0;
  const pendingCount = unconfirmedCount + missingPeople + missingItems;

  if (pendingCount > 0 || readiness?.ready === false) {
    return {
      label: "Atenção",
      title: `${Math.max(1, pendingCount)} pendência(s)`,
      detail: "Resolva os bloqueios indicados antes de avançar a operação.",
      tone: "warning",
      icon: AlertTriangle,
    };
  }

  return {
    label: "No horário",
    title: "Operação no ritmo",
    detail: "Nenhum bloqueio conhecido na etapa atual.",
    tone: "success",
    icon: CheckCircle2,
  };
}

export function CockpitOperationalStatus({
  current,
  readiness,
  unconfirmedCount,
}: {
  current: JourneyStepRow | null;
  readiness: Readiness | null;
  unconfirmedCount: number;
}) {
  const now = useNow();
  if (now === null) return null;

  const status = deriveOperationalStatus({ current, readiness, unconfirmedCount, now });
  const Icon = status.icon;
  const toneClass = {
    success: "border-success/35 bg-success-soft text-success",
    warning: "border-warning/35 bg-warning-soft text-warning",
    critical: "border-destructive/35 bg-destructive/10 text-destructive",
    muted: "border-border bg-muted/60 text-muted-foreground",
  }[status.tone];

  return (
    <section className={`rounded-2xl border px-4 py-3.5 ${toneClass}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-background/55">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
            {status.label}
          </p>
          <p className="mt-0.5 text-lg font-semibold leading-tight">{status.title}</p>
          <p className="mt-1 text-xs leading-relaxed opacity-80">{status.detail}</p>
        </div>
      </div>
    </section>
  );
}
