import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { JourneyStepRow, Readiness, RuntimeState } from "@/lib/w04";

type GuidanceTarget = "people" | "checklist" | null;

type Guidance = {
  title: string;
  detail: string;
  icon: typeof ArrowRight;
  tone: "primary" | "warning" | "success" | "muted";
  target: GuidanceTarget;
};

function copy(locale: string, pt: string, en: string) {
  return locale.toLowerCase().startsWith("pt") ? pt : en;
}

/**
 * Display-only operational guidance.
 * It reads canonical runtime facts and never writes, calls an action RPC, or
 * creates an alternative lifecycle. JourneyStepActions remains the execution
 * layer. Live and Cockpit reuse this exact guidance so there is only one
 * recommendation engine across operational surfaces.
 */
export function LiveNextBestAction({ operationId }: { operationId: string }) {
  const location = useLocation();
  const { locale } = useI18n();
  const isLive = location.pathname.endsWith(`/operations/${operationId}/live`);
  const isCockpitV2 = location.pathname.endsWith(`/operations/${operationId}/cockpit-v2`);
  const isGuidanceSurface = isLive || isCockpitV2;

  const guidanceQuery = useQuery({
    queryKey: ["px04-next-best-action", operationId],
    enabled: isGuidanceSurface,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [steps, state, roster, facts] = await Promise.all([
        supabase
          .from("journey_steps")
          .select("*")
          .eq("operation_id", operationId)
          .order("sequence"),
        supabase.rpc("w04_operation_runtime_state", { _operation_id: operationId }),
        supabase
          .from("operation_participations")
          .select("id, participation_kind, status")
          .eq("operation_id", operationId)
          .neq("status", "cancelled"),
        supabase
          .from("journey_events")
          .select("journey_step_id, event_type")
          .eq("operation_id", operationId)
          .in("event_type", ["BOARDING_STARTED", "ARRIVED"]),
      ]);

      if (steps.error) throw steps.error;
      if (state.error) throw state.error;
      if (roster.error) throw roster.error;
      if (facts.error) throw facts.error;

      const runtime = (state.data ?? null) as RuntimeState | null;
      const stepRows = (steps.data ?? []) as JourneyStepRow[];
      const current = stepRows.find((step) => step.id === runtime?.current_step_id) ?? null;
      const next = stepRows.find((step) => step.id === runtime?.next_step_id) ?? null;
      const relevantRoster = (roster.data ?? []).filter((row) =>
        current?.presence_population === "participants"
          ? row.participation_kind === "participant"
          : true,
      );
      const unconfirmedCount = current
        ? relevantRoster.filter((row) => row.status !== "confirmed").length
        : 0;
      const boardingStarted = Boolean(
        current &&
          (facts.data ?? []).some(
            (row) => row.journey_step_id === current.id && row.event_type === "BOARDING_STARTED",
          ),
      );
      const arrived = Boolean(
        current &&
          (facts.data ?? []).some(
            (row) => row.journey_step_id === current.id && row.event_type === "ARRIVED",
          ),
      );

      return {
        current,
        next,
        readiness: runtime?.readiness ?? null,
        unconfirmedCount,
        boardingStarted,
        arrived,
      };
    },
  });

  if (!isGuidanceSurface || guidanceQuery.isLoading || guidanceQuery.isError || !guidanceQuery.data)
    return null;

  const { current, next, readiness, unconfirmedCount, boardingStarted, arrived } =
    guidanceQuery.data;
  const guidance = deriveGuidance({
    locale,
    current,
    next,
    readiness,
    unconfirmedCount,
    boardingStarted,
    arrived,
  });
  if (!guidance) return null;

  const Icon = guidance.icon;
  const toneClass = {
    primary: "border-primary/30 bg-primary-soft/45",
    warning: "border-warning/30 bg-warning-soft text-warning",
    success: "border-success/30 bg-success-soft text-success",
    muted: "border-border bg-muted/60 text-muted-foreground",
  }[guidance.tone];

  return (
    <section className={`rounded-xl border px-4 py-3 ${toneClass}`} aria-live="polite">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
        {copy(locale, "Próxima ação recomendada", "Recommended next action")}
      </p>
      <div className="mt-1.5 flex items-start gap-2.5">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{guidance.title}</p>
          <p className="mt-0.5 text-xs opacity-80">{guidance.detail}</p>
        </div>
      </div>

      {isCockpitV2 && guidance.target ? (
        <Button
          asChild
          size="sm"
          variant="outline"
          className="mt-3 min-h-10 w-full bg-background/60"
        >
          <Link
            to={
              guidance.target === "people"
                ? "/operations/$operationId/people"
                : "/operations/$operationId/live"
            }
            params={{ operationId }}
          >
            {guidance.target === "people"
              ? copy(locale, "Resolver viajantes", "Resolve travelers")
              : copy(locale, "Abrir checklist", "Open checklist")}
            <ArrowRight className="ml-2 size-4" aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
    </section>
  );
}

function deriveGuidance({
  locale,
  current,
  next,
  readiness,
  boardingStarted,
  arrived,
  unconfirmedCount,
}: {
  locale: string;
  current: JourneyStepRow | null;
  next: JourneyStepRow | null;
  readiness: Readiness | null;
  boardingStarted: boolean;
  arrived: boolean;
  unconfirmedCount: number;
}): Guidance | null {
  if (!current && next) {
    return {
      title: copy(locale, "Inicie a próxima etapa", "Start the next step"),
      detail: copy(locale, `Próxima: ${next.title}.`, `Next: ${next.title}.`),
      icon: ArrowRight,
      tone: "primary",
      target: null,
    };
  }
  if (!current) return null;

  if (unconfirmedCount > 0) {
    return {
      title: copy(locale, "Revise e confirme os viajantes", "Review and confirm travelers"),
      detail: copy(
        locale,
        `${unconfirmedCount} viajante(s) ainda não contam no readiness desta etapa.`,
        `${unconfirmedCount} traveler(s) are not yet counted in this step readiness.`,
      ),
      icon: Users,
      tone: "warning",
      target: "people",
    };
  }

  const missingPeople = readiness?.missing_participations.length ?? 0;
  if (missingPeople > 0) {
    return {
      title: copy(locale, "Resolva os viajantes pendentes", "Resolve pending travelers"),
      detail: copy(
        locale,
        `Faltam ${missingPeople} viajante(s) para liberar esta etapa.`,
        `${missingPeople} traveler(s) still block this step.`,
      ),
      icon: Users,
      tone: "warning",
      target: "people",
    };
  }

  const missingItems = readiness?.missing_required_items.length ?? 0;
  if (missingItems > 0) {
    return {
      title: copy(locale, "Conclua os itens obrigatórios", "Complete required checklist items"),
      detail: copy(
        locale,
        `${missingItems} item(ns) obrigatório(s) ainda estão pendentes.`,
        `${missingItems} required checklist item(s) are still pending.`,
      ),
      icon: ClipboardCheck,
      tone: "warning",
      target: "checklist",
    };
  }

  if (current.presence_requirement === "boarded" && !boardingStarted) {
    return {
      title: copy(locale, "Inicie o embarque", "Start boarding"),
      detail: copy(
        locale,
        "Abra o embarque antes de registrar passageiros embarcados.",
        "Open boarding before recording boarded travelers.",
      ),
      icon: ArrowRight,
      tone: "primary",
      target: null,
    };
  }

  const requiresArrival =
    current.step_kind === "movement" ||
    current.step_kind === "return" ||
    current.step_kind === "disembarkation";
  if ((readiness?.ready ?? true) && requiresArrival && !arrived) {
    return {
      title: copy(locale, "Registre a chegada", "Record arrival"),
      detail: copy(
        locale,
        "A chegada é necessária antes de concluir esta etapa.",
        "Arrival is required before this step can be completed.",
      ),
      icon: MapPin,
      tone: "primary",
      target: null,
    };
  }

  if (readiness?.ready ?? true) {
    return {
      title: copy(locale, "Etapa pronta para conclusão", "Step ready to complete"),
      detail: copy(
        locale,
        "Os bloqueios conhecidos estão resolvidos. Confirme a ação principal abaixo.",
        "Known blockers are resolved. Confirm the main action below.",
      ),
      icon: CheckCircle2,
      tone: "success",
      target: null,
    };
  }

  return {
    title: copy(locale, "Revise os bloqueios da etapa", "Review step blockers"),
    detail: copy(
      locale,
      "Consulte pessoas, checklist e fatos operacionais antes de avançar.",
      "Review people, checklist, and operational facts before advancing.",
    ),
    icon: ClipboardCheck,
    tone: "muted",
    target: null,
  };
}
