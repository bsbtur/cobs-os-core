import * as React from "react";
import {
  Award,
  CheckCircle2,
  Clock3,
  Compass,
  Crown,
  Flag,
  Route,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type CompletionAward = {
  awardId?: string | null;
  achievementKey: string;
  achievementName?: string | null;
  description?: string | null;
  rarity?: "common" | "rare" | "epic" | string | null;
  xpReward: number;
  iconKey?: string | null;
  duplicate?: boolean;
};

type CompletionExperienceProps = {
  open: boolean;
  stageTitle: string;
  awards: CompletionAward[];
  previousXp: number;
  totalXp: number;
  journeyProgressPercent: number;
  soundEnabled: boolean;
  hapticEnabled?: boolean;
  onContinue: () => void;
};

const ICONS = {
  award: Award,
  clock: Clock3,
  compass: Compass,
  crown: Crown,
  flag: Flag,
  route: Route,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  trophy: Trophy,
} as const;

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return reduced;
}

function playCompletionChime() {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.7);
    gain.connect(context.destination);

    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.09);
      oscillator.stop(context.currentTime + 0.32 + index * 0.09);
    });

    window.setTimeout(() => void context.close(), 900);
  } catch {
    // Progressive enhancement: completion never depends on audio availability.
  }
}

function CountUp({ from, to, active, reduced }: { from: number; to: number; active: boolean; reduced: boolean }) {
  const [value, setValue] = React.useState(from);

  React.useEffect(() => {
    if (!active) {
      setValue(from);
      return;
    }
    if (reduced || to <= from) {
      setValue(to);
      return;
    }

    const startedAt = performance.now();
    const duration = 720;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, from, reduced, to]);

  return <span className="tabular-nums">{value.toLocaleString("pt-BR")}</span>;
}

export function CompletionExperience({
  open,
  stageTitle,
  awards,
  previousXp,
  totalXp,
  journeyProgressPercent,
  soundEnabled,
  hapticEnabled = true,
  onContinue,
}: CompletionExperienceProps) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = React.useState(0);
  const playedForOpenRef = React.useRef(false);

  const newAwards = React.useMemo(() => awards.filter((award) => !award.duplicate), [awards]);
  const xpEarned = React.useMemo(
    () => newAwards.reduce((sum, award) => sum + Math.max(0, award.xpReward || 0), 0),
    [newAwards],
  );
  const featuredAward = newAwards[0] ?? null;
  const progress = clampPercent(journeyProgressPercent);

  React.useEffect(() => {
    if (!open) {
      setPhase(0);
      playedForOpenRef.current = false;
      return;
    }

    if (reducedMotion) {
      setPhase(4);
      return;
    }

    const timers = [
      window.setTimeout(() => setPhase(1), 80),
      window.setTimeout(() => setPhase(2), 430),
      window.setTimeout(() => setPhase(3), 900),
      window.setTimeout(() => setPhase(4), 1350),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, reducedMotion]);

  React.useEffect(() => {
    if (!open || phase < 3 || playedForOpenRef.current) return;
    playedForOpenRef.current = true;
    if (soundEnabled) playCompletionChime();
    if (hapticEnabled && "vibrate" in navigator) navigator.vibrate?.([35, 35, 70]);
  }, [hapticEnabled, open, phase, soundEnabled]);

  const iconName = featuredAward?.iconKey ?? "award";
  const BadgeIcon = ICONS[iconName as keyof typeof ICONS] ?? Award;

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md overflow-hidden border-primary/20 p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Etapa concluída</DialogTitle>
        <div className="relative overflow-hidden bg-background px-5 pb-5 pt-7 text-center sm:px-7 sm:pb-7">
          <div
            className={`pointer-events-none absolute inset-x-8 -top-20 h-52 rounded-full bg-primary/10 blur-3xl transition-opacity duration-700 ${
              phase >= 1 ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden="true"
          />

          <div
            className={`relative mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success shadow-sm transition-all duration-500 ${
              phase >= 1 ? "scale-100 opacity-100" : "scale-75 opacity-0"
            }`}
          >
            <CheckCircle2 className="size-9" strokeWidth={2.2} aria-hidden="true" />
          </div>

          <p className="relative mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Missão registrada
          </p>
          <h2 className="relative mt-1 text-2xl font-semibold tracking-tight">Etapa concluída</h2>
          <p className="relative mt-1 text-sm text-muted-foreground">{stageTitle}</p>

          <div
            className={`relative mt-5 grid grid-cols-2 gap-2 transition-all duration-500 ${
              phase >= 2 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            <div className="rounded-2xl border border-border/70 bg-muted/40 px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">XP conquistado</p>
              <p className="mt-1 text-2xl font-semibold text-primary">+{xpEarned.toLocaleString("pt-BR")}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/40 px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">XP total</p>
              <p className="mt-1 text-2xl font-semibold">
                <CountUp from={previousXp} to={totalXp} active={phase >= 2} reduced={reducedMotion} />
              </p>
            </div>
          </div>

          <div
            className={`relative mt-4 rounded-2xl border border-border/70 bg-muted/30 p-3 text-left transition-all duration-500 ${
              phase >= 2 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium">Progresso da jornada</span>
              <span className="font-mono tabular-nums text-muted-foreground">{progress}% completo</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: phase >= 2 ? `${progress}%` : "0%" }}
              />
            </div>
          </div>

          <div
            className={`relative mt-5 transition-all duration-500 ${
              phase >= 3 ? "scale-100 opacity-100" : "scale-90 opacity-0"
            }`}
          >
            {featuredAward ? (
              <div className="rounded-3xl border border-primary/25 bg-primary/5 px-4 py-5 shadow-sm">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Recompensa revelada</p>
                <div className="mx-auto mt-3 grid size-20 place-items-center rounded-full border border-primary/25 bg-background shadow-lg">
                  <BadgeIcon className="size-10 text-primary" aria-hidden="true" />
                </div>
                <p className="mt-3 text-xl font-semibold">{featuredAward.achievementName ?? featuredAward.achievementKey}</p>
                {featuredAward.description ? (
                  <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{featuredAward.description}</p>
                ) : null}
                {newAwards.length > 1 ? (
                  <p className="mt-3 text-xs font-medium text-muted-foreground">
                    +{newAwards.length - 1} {newAwards.length === 2 ? "outra conquista" : "outras conquistas"} nesta etapa
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-4">
                <Sparkles className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium">Etapa registrada com sucesso</p>
                <p className="mt-1 text-xs text-muted-foreground">Nenhuma nova recompensa foi concedida nesta etapa.</p>
              </div>
            )}
          </div>

          <Button
            className={`relative mt-5 min-h-14 w-full text-base font-semibold transition-all duration-300 ${
              phase >= 4 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
            disabled={phase < 4}
            onClick={onContinue}
          >
            Continuar jornada
          </Button>

          <p className="relative mt-3 text-[11px] text-muted-foreground">
            XP e recompensas refletem apenas fatos registrados pelo COBS.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
