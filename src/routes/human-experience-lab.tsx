import { createFileRoute } from "@tanstack/react-router";
import {
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Focus,
  Gauge,
  Headphones,
  Settings2,
  Sparkles,
  Vibrate,
  Volume2,
  VolumeX,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  emitHumanExperienceEvent,
  type HumanExperienceEventRecord,
} from "@/lib/humanExperienceOrchestration";

export const Route = createFileRoute("/human-experience-lab")({
  head: () => ({
    meta: [
      { title: "COBS Human Experience Lab" },
      {
        name: "description",
        content: "Protótipo isolado de UX operacional neuroinclusiva do COBS OS.",
      },
    ],
  }),
  component: HumanExperienceLab,
});

type ExperienceMode = "default" | "focus" | "calm" | "expressive";
type SoundMode = "on" | "critical" | "off";
type HapticMode = "full" | "essential" | "off";
type MotionMode = "full" | "reduced";

type ChecklistItem = { id: string; label: string; done: boolean };

const initialChecklist: ChecklistItem[] = [
  { id: "orient", label: "Orientar grupo", done: false },
  { id: "architecture", label: "Apresentar arquitetura externa", done: false },
  { id: "meeting", label: "Confirmar ponto de encontro", done: false },
];

const modeLabels: Record<ExperienceMode, string> = {
  default: "Padrão",
  focus: "Foco",
  calm: "Calmo",
  expressive: "Expressivo",
};

function HumanExperienceLab() {
  const [mode, setMode] = useState<ExperienceMode>("default");
  const [sound, setSound] = useState<SoundMode>("on");
  const [haptic, setHaptic] = useState<HapticMode>("full");
  const [motion, setMotion] = useState<MotionMode>("full");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [stageDone, setStageDone] = useState(false);
  const [progress, setProgress] = useState(3);
  const [celebrate, setCelebrate] = useState(false);
  const [events, setEvents] = useState<HumanExperienceEventRecord[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setMotion("reduced");
    }
  }, []);

  useEffect(() => {
    if (mode === "calm") {
      setSound("off");
      setMotion("reduced");
    }
  }, [mode]);

  const completedChecklist = useMemo(
    () => checklist.filter((item) => item.done).length,
    [checklist],
  );

  const isFocus = mode === "focus";
  const isCalm = mode === "calm";
  const isExpressive = mode === "expressive";
  const reducedMotion = motion === "reduced" || isCalm;

  async function recordEvent(
    event: Parameters<typeof emitHumanExperienceEvent>[0],
    payload: Record<string, unknown>,
  ) {
    const record = await emitHumanExperienceEvent(event, payload);
    setEvents((current) => [record, ...current].slice(0, 6));
  }

  function vibrate(kind: "light" | "success" | "warning") {
    if (haptic === "off" || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    if (haptic === "essential" && kind === "light") return;
    const pattern = kind === "light" ? 18 : kind === "success" ? [28, 35, 48] : [80, 50, 80];
    navigator.vibrate(pattern);
  }

  function playTone(kind: "success" | "critical") {
    if (sound === "off" || (sound === "critical" && kind !== "critical") || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.36);
    gain.connect(ctx.destination);

    const first = ctx.createOscillator();
    first.type = "sine";
    first.frequency.setValueAtTime(kind === "success" ? 620 : 240, ctx.currentTime);
    first.connect(gain);
    first.start();
    first.stop(ctx.currentTime + 0.16);

    if (kind === "success") {
      const second = ctx.createOscillator();
      second.type = "sine";
      second.frequency.setValueAtTime(820, ctx.currentTime + 0.13);
      second.connect(gain);
      second.start(ctx.currentTime + 0.13);
      second.stop(ctx.currentTime + 0.34);
    }

    window.setTimeout(() => void ctx.close(), 500);
  }

  async function toggleChecklist(item: ChecklistItem) {
    const nextDone = !item.done;
    setChecklist((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, done: nextDone } : entry)),
    );
    if (nextDone) {
      vibrate("light");
      await recordEvent("checklist.completed", { itemId: item.id, label: item.label });
    }
  }

  async function completeStage() {
    if (stageDone) return;
    setStageDone(true);
    setProgress(4);
    setCelebrate(true);
    playTone("success");
    vibrate("success");
    await recordEvent("stage.completed", {
      operation: "Piloto City Tour Brasília",
      stage: "Catedral Metropolitana",
    });
    window.setTimeout(() => setCelebrate(false), reducedMotion ? 350 : 1100);
  }

  function testFeedback() {
    playTone("success");
    vibrate("success");
    setCelebrate(true);
    window.setTimeout(() => setCelebrate(false), reducedMotion ? 350 : 900);
  }

  function resetPrototype() {
    setChecklist(initialChecklist);
    setStageDone(false);
    setProgress(3);
    setEvents([]);
    setCelebrate(false);
  }

  return (
    <main
      className={`min-h-screen bg-slate-950 text-slate-950 ${
        reducedMotion ? "[&_*]:!transition-none [&_*]:!animate-none" : ""
      }`}
    >
      <div className="mx-auto min-h-screen max-w-[430px] bg-slate-50 shadow-2xl sm:min-h-[900px] sm:my-6 sm:rounded-[32px] sm:border sm:border-slate-800/10">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">COBS Human Experience Lab</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-950">Piloto City Tour Brasília</p>
          </div>
          <button
            type="button"
            aria-label="Abrir preferências de experiência"
            onClick={() => setSettingsOpen((value) => !value)}
            className="grid min-h-11 min-w-11 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
          >
            <Settings2 className="size-5" />
          </button>
        </header>

        {settingsOpen && (
          <section className="border-b border-slate-200 bg-white px-4 py-4" aria-label="Preferências de experiência">
            <div className="mb-4 flex items-start gap-3 rounded-2xl bg-blue-50 p-3">
              <WandSparkles className="mt-0.5 size-5 text-blue-700" />
              <div>
                <h2 className="text-sm font-bold text-slate-950">Como você prefere trabalhar?</h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">A regra operacional não muda. Só muda como o COBS apresenta e confirma cada ação.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["default", "focus", "calm", "expressive"] as ExperienceMode[]).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setMode(value)}
                  className={`min-h-12 rounded-2xl border px-3 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${
                    mode === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {modeLabels[value]}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <PreferenceRow icon={sound === "off" ? VolumeX : Volume2} label="Som">
                <select aria-label="Preferência de som" value={sound} onChange={(event) => setSound(event.target.value as SoundMode)} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold">
                  <option value="on">Ligado</option>
                  <option value="critical">Apenas crítico</option>
                  <option value="off">Desligado</option>
                </select>
              </PreferenceRow>
              <PreferenceRow icon={Vibrate} label="Vibração">
                <select aria-label="Preferência de vibração" value={haptic} onChange={(event) => setHaptic(event.target.value as HapticMode)} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold">
                  <option value="full">Completa</option>
                  <option value="essential">Essencial</option>
                  <option value="off">Desligada</option>
                </select>
              </PreferenceRow>
              <PreferenceRow icon={Sparkles} label="Movimento">
                <select aria-label="Preferência de movimento" value={motion} onChange={(event) => setMotion(event.target.value as MotionMode)} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold">
                  <option value="full">Completo</option>
                  <option value="reduced">Reduzido</option>
                </select>
              </PreferenceRow>
            </div>

            <button type="button" onClick={testFeedback} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300">
              <Headphones className="size-4" /> Testar feedback
            </button>
          </section>
        )}

        <div className="space-y-4 px-4 py-4">
          <section className={`overflow-hidden rounded-[28px] border bg-white shadow-sm ${isCalm ? "border-slate-200" : "border-blue-100"}`}>
            <div className={`px-5 py-4 ${isCalm ? "bg-slate-100" : "bg-gradient-to-br from-blue-600 to-indigo-700 text-white"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] ${isCalm ? "bg-white text-slate-700" : "bg-white/15 text-white"}`}>Agora</span>
                <span className={`text-xs font-semibold ${isCalm ? "text-slate-600" : "text-blue-100"}`}>09:30–10:00</span>
              </div>
              <p className={`mt-5 text-xs font-bold uppercase tracking-[0.16em] ${isCalm ? "text-slate-500" : "text-blue-100"}`}>Visita</p>
              <h1 className={`mt-1 text-2xl font-black tracking-tight ${isCalm ? "text-slate-950" : "text-white"}`}>Catedral Metropolitana</h1>
              {!isFocus && <p className={`mt-2 text-sm ${isCalm ? "text-slate-600" : "text-blue-100"}`}>Etapa em andamento · operação de campo</p>}
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Progresso da jornada</p>
                  <p className="mt-1 text-lg font-black">{progress}/8 etapas</p>
                </div>
                <div className="flex items-center gap-1.5" aria-label={`${progress} de 8 etapas concluídas`}>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <span key={index} className={`h-2.5 w-2.5 rounded-full ${index < progress ? "bg-emerald-500" : "bg-slate-200"}`} />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {!isFocus && (
            <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Checklist</p>
                  <h2 className="mt-1 text-base font-black">{completedChecklist}/3 concluídos</h2>
                </div>
                <CheckCircle2 className="size-6 text-emerald-600" />
              </div>
              <div className="mt-3 space-y-2">
                {checklist.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => void toggleChecklist(item)}
                    aria-pressed={item.done}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${item.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${item.done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {item.done ? <Check className="size-4" strokeWidth={3} /> : <Circle className="size-4" />}
                    </span>
                    <span className={`text-sm font-semibold ${item.done ? "text-emerald-900" : "text-slate-800"}`}>{item.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!isFocus && (
            <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Pontos da visita</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["Vitrais", "Altar", "Batistério"].map((point) => (
                  <span key={point} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{point}</span>
                ))}
              </div>
            </section>
          )}

          <section className={`relative overflow-hidden rounded-[28px] border p-4 shadow-sm ${stageDone ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-white"}`}>
            {celebrate && !reducedMotion && (
              <div className={`pointer-events-none absolute inset-0 ${isExpressive ? "animate-pulse bg-gradient-to-r from-emerald-100/70 via-blue-100/70 to-violet-100/70" : "bg-emerald-100/50"}`} />
            )}
            <div className="relative">
              <div className="flex items-center gap-2">
                {stageDone ? <CheckCircle2 className="size-5 text-emerald-700" /> : <Gauge className="size-5 text-blue-700" />}
                <p className={`text-[11px] font-extrabold uppercase tracking-[0.16em] ${stageDone ? "text-emerald-700" : "text-blue-700"}`}>{stageDone ? "Etapa concluída" : "Ação principal"}</p>
              </div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">{stageDone ? "Boa. Próxima etapa liberada." : "Concluir ponto da visita"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{stageDone ? "O COBS registrou o marco e destacou o que vem depois." : "Finalize quando o grupo estiver pronto para seguir. A velocidade não gera recompensa."}</p>

              <button
                type="button"
                onClick={() => void completeStage()}
                disabled={stageDone}
                className={`mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-black transition focus-visible:outline-none focus-visible:ring-4 ${stageDone ? "cursor-default bg-emerald-600 text-white focus-visible:ring-emerald-200" : "bg-blue-600 text-white shadow-lg shadow-blue-600/20 active:scale-[0.98] focus-visible:ring-blue-200"}`}
              >
                {stageDone ? <><CheckCircle2 className="size-5" /> Concluído</> : <><Check className="size-5" /> Concluir etapa</>}
              </button>
            </div>
          </section>

          <section className={`rounded-[26px] border p-4 ${stageDone ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-3">
              <span className={`grid size-10 place-items-center rounded-2xl ${stageDone ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}><ChevronRight className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Próximo</p>
                <p className="mt-1 font-black text-slate-950">Praça dos Três Poderes</p>
                <p className="text-sm text-slate-600">10:15</p>
              </div>
            </div>
          </section>

          {!isFocus && (
            <section className="rounded-[26px] border border-dashed border-slate-300 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BellRing className="size-4 text-slate-500" />
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Eventos de orquestração</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">n8n-ready · mock</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">Neste laboratório nada é enviado para fora. Em produção, os eventos passam por backend/Edge Function antes do n8n.</p>
              <div className="mt-3 space-y-2">
                {events.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Interaja com checklist ou etapa para ver eventos.</p>
                ) : (
                  events.map((event) => (
                    <div key={`${event.at}-${event.event}`} className="rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-slate-200">
                      <span className="font-bold text-emerald-300">{event.event}</span>
                      <span className="ml-2 text-slate-500">{new Date(event.at).toLocaleTimeString("pt-BR")}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          <footer className="flex items-center justify-between gap-3 pb-6 pt-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {mode === "focus" ? <Focus className="size-4" /> : <Sparkles className="size-4" />}
              Perfil: <strong className="text-slate-700">{modeLabels[mode]}</strong>
            </div>
            <button type="button" onClick={resetPrototype} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200">Resetar teste</button>
          </footer>
        </div>
      </div>
    </main>
  );
}

function PreferenceRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Volume2;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3">
      <div className="flex items-center gap-2 font-semibold text-slate-700"><Icon className="size-4" /> {label}</div>
      {children}
    </div>
  );
}
