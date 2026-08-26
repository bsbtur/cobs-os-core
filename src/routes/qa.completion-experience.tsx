import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Smartphone, Volume2, Vibrate } from "lucide-react";

import {
  CompletionExperience,
  type CompletionAward,
} from "@/components/journey/completion-experience";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/qa/completion-experience")({
  head: () => ({
    meta: [
      { title: "COBS V3.1-A — Completion Experience QA" },
      {
        name: "robots",
        content: "noindex,nofollow",
      },
    ],
  }),
  component: CompletionExperienceQa,
});

const QA_AWARDS: CompletionAward[] = [
  {
    achievementKey: "first_mission",
    achievementName: "Primeira Missão",
    description: "Sua primeira etapa operacional foi concluída com fatos registrados.",
    rarity: "common",
    xpReward: 120,
    iconKey: "trophy",
  },
  {
    achievementKey: "explorer",
    achievementName: "Explorador",
    description: "Você apresentou o mínimo configurado de pontos da visita.",
    rarity: "rare",
    xpReward: 80,
    iconKey: "compass",
  },
];

function CompletionExperienceQa() {
  const [open, setOpen] = React.useState(false);
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [hapticEnabled, setHapticEnabled] = React.useState(true);
  const [run, setRun] = React.useState(0);

  const start = () => {
    setRun((value) => value + 1);
    setOpen(true);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
            COBS Human Experience V3.1-A
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Completion Experience · QA Mobile</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Laboratório isolado da tela pós-conclusão. Nenhuma operação real é alterada e nenhum XP é persistido por esta rota.
          </p>

          <div className="mt-5 grid gap-2">
            <button
              type="button"
              className="flex min-h-12 items-center justify-between rounded-2xl border border-border/70 bg-muted/30 px-4 text-left"
              onClick={() => setSoundEnabled((value) => !value)}
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <Volume2 className="size-4 text-primary" aria-hidden="true" />
                Som da recompensa
              </span>
              <span className="font-mono text-xs text-muted-foreground">{soundEnabled ? "ON" : "OFF"}</span>
            </button>

            <button
              type="button"
              className="flex min-h-12 items-center justify-between rounded-2xl border border-border/70 bg-muted/30 px-4 text-left"
              onClick={() => setHapticEnabled((value) => !value)}
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <Vibrate className="size-4 text-primary" aria-hidden="true" />
                Feedback háptico
              </span>
              <span className="font-mono text-xs text-muted-foreground">{hapticEnabled ? "ON" : "OFF"}</span>
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Smartphone className="size-4 text-primary" aria-hidden="true" />
              Cenário controlado
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>Etapa</span><strong className="text-right text-foreground">Catedral Metropolitana</strong>
              <span>XP anterior</span><strong className="text-right text-foreground">1.240</strong>
              <span>XP conquistado</span><strong className="text-right text-foreground">+200</strong>
              <span>Progresso</span><strong className="text-right text-foreground">60%</strong>
              <span>Badges novos</span><strong className="text-right text-foreground">2</strong>
            </div>
          </div>

          <Button className="mt-5 min-h-14 w-full text-base font-semibold" onClick={start}>
            {run > 0 ? <RotateCcw className="mr-2 size-4" aria-hidden="true" /> : null}
            {run > 0 ? "Repetir experiência" : "Iniciar experiência animada"}
          </Button>

          <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">
            QA somente visual/sonoro/háptico. Os números desta página são um cenário de demonstração claramente identificado e não entram em analytics ou registros operacionais.
          </p>
        </div>
      </div>

      <CompletionExperience
        key={run}
        open={open}
        stageTitle="Catedral Metropolitana · Visita guiada"
        awards={QA_AWARDS}
        previousXp={1240}
        totalXp={1440}
        journeyProgressPercent={60}
        soundEnabled={soundEnabled}
        hapticEnabled={hapticEnabled}
        onContinue={() => setOpen(false)}
      />
    </main>
  );
}
