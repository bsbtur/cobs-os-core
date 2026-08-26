import { createFileRoute } from "@tanstack/react-router";
import {
  Award,
  BadgeCheck,
  Check,
  ChevronRight,
  Circle,
  Compass,
  Crown,
  Gift,
  Headphones,
  Lock,
  MapPin,
  Medal,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
  Vibrate,
  Volume2,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  emitHumanExperienceEvent,
  type HumanExperienceEventRecord,
} from "@/lib/humanExperienceOrchestration";

export const Route = createFileRoute("/human-experience-lab-v2")({
  head: () => ({
    meta: [
      { title: "COBS Human Experience Lab V2" },
      {
        name: "description",
        content: "Protótipo gamificado e neuroinclusivo do COBS OS, isolado da main.",
      },
    ],
  }),
  component: HumanExperienceLabV2,
});

type Screen = "mission" | "live" | "success" | "progression";
type ChecklistItem = { id: string; label: string; done: boolean };

const initialChecklist: ChecklistItem[] = [
  { id: "arrival", label: "Confirmar chegada ao ponto", done: false },
  { id: "orient", label: "Orientar o grupo", done: false },
  { id: "interpret", label: "Apresentar o ponto principal", done: false },
];

const levels = [
  { name: "Explorador", min: 0, icon: Compass },
  { name: "Condutor", min: 120, icon: Medal },
  { name: "Especialista", min: 300, icon: Award },
  { name: "Mestre de Operações", min: 600, icon: Crown },
];

function HumanExperienceLabV2() {
  const [screen, setScreen] = useState<Screen>("mission");
  const [checklist, setChecklist] = useState(initialChecklist);
  const [xp, setXp] = useState(84);
  const [operations, setOperations] = useState(7);
  const [pressed, setPressed] = useState<string | null>(null);
  const [events, setEvents] = useState<HumanExperienceEventRecord[]>([]);

  const completed = useMemo(() => checklist.filter((item) => item.done).length, [checklist]);
  const allDone = completed === checklist.length;
  const currentLevelIndex = levels.reduce((acc, level, index) => (xp >= level.min ? index : acc), 0);
  const currentLevel = levels[currentLevelIndex];
  const nextLevel = levels[currentLevelIndex + 1];
  const progressToNext = nextLevel
    ? Math.min(100, Math.round(((xp - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100))
    : 100;

  async function recordEvent(
    event: Parameters<typeof emitHumanExperienceEvent>[0],
    payload: Record<string, unknown>,
  ) {
    const record = await emitHumanExperienceEvent(event, payload);
    setEvents((current) => [record, ...current].slice(0, 5));
  }

  function playSuccess() {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    gain.connect(ctx.destination);
    [660, 880].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(ctx.currentTime + index * 0.12);
      oscillator.stop(ctx.currentTime + 0.2 + index * 0.12);
    });
    window.setTimeout(() => void ctx.close(), 600);
  }

  function vibrate(pattern: number | number[] = [25, 30, 45]) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  }

  function flash(id: string) {
    setPressed(id);
    window.setTimeout(() => setPressed(null), 260);
  }

  async function startMission() {
    flash("start");
    vibrate(20);
    await recordEvent("operation.started", { operation: "City Tour Brasília — Missão 08" });
    window.setTimeout(() => setScreen("live"), 220);
  }

  async function toggleItem(item: ChecklistItem) {
    flash(item.id);
    const done = !item.done;
    setChecklist((current) => current.map((entry) => (entry.id === item.id ? { ...entry, done } : entry)));
    if (done) {
      setXp((value) => value + 6);
      vibrate(18);
      await recordEvent("checklist.completed", { itemId: item.id, label: item.label });
    }
  }

  async function concludeStage() {
    if (!allDone) return;
    flash("conclude");
    playSuccess();
    vibrate([25, 40, 55]);
    setXp((value) => value + 30);
    setOperations((value) => value + 1);
    await recordEvent("stage.completed", {
      operation: "City Tour Brasília — Missão 08",
      stage: "Catedral Metropolitana",
    });
    window.setTimeout(() => setScreen("success"), 280);
  }

  function reset() {
    setScreen("mission");
    setChecklist(initialChecklist);
    setXp(84);
    setOperations(7);
    setEvents([]);
    setPressed(null);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-0 text-slate-950 sm:px-4 sm:py-6">
      <div className="mx-auto min-h-screen max-w-[430px] overflow-hidden bg-slate-50 shadow-2xl sm:min-h-[900px] sm:rounded-[34px]">
        <header className="flex items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">COBS Human Experience V2</p>
            <p className="mt-0.5 text-sm font-bold text-slate-950">Missão City Tour Brasília</p>
          </div>
          <button onClick={reset} className="grid size-11 place-items-center rounded-2xl border border-slate-200 bg-white transition active:rotate-[-12deg] active:scale-90">
            <RotateCcw className="size-4" />
          </button>
        </header>

        <div className="px-4 py-4">
          {screen === "mission" && (
            <section className="animate-in fade-in slide-in-from-right-3 duration-300">
              <div className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-5 text-white shadow-xl">
                <div className="absolute -right-10 -top-10 size-36 rounded-full bg-white/10 blur-sm" />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">Nova missão</span>
                    <span className="flex items-center gap-1 text-xs font-bold text-violet-100"><Zap className="size-4" /> +60 XP possíveis</span>
                  </div>
                  <div className="mt-7 flex items-center gap-3">
                    <div className="grid size-14 place-items-center rounded-2xl bg-white/15"><MapPin className="size-7" /></div>
                    <div>
                      <p className="text-xs font-bold text-violet-100">Etapa 4 de 8</p>
                      <h1 className="text-2xl font-black">Catedral Metropolitana</h1>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-violet-100">Sua missão é conduzir esta etapa com clareza, segurança e todos os pontos essenciais registrados.</p>
                </div>
              </div>

              <div className="mt-4 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Seu progresso</p>
                    <p className="mt-1 text-lg font-black">{currentLevel.name}</p>
                  </div>
                  <currentLevel.icon className="size-7 text-indigo-600" />
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-700" style={{ width: `${progressToNext}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs font-semibold text-slate-500">
                  <span>{xp} XP</span>
                  <span>{nextLevel ? `${nextLevel.min} XP para ${nextLevel.name}` : "Nível máximo"}</span>
                </div>
              </div>

              <button
                onClick={() => void startMission()}
                className={`mt-4 flex min-h-16 w-full items-center justify-between rounded-[24px] px-5 text-left text-white shadow-lg transition-all duration-200 active:scale-[0.97] ${pressed === "start" ? "bg-emerald-500 ring-4 ring-emerald-200" : "bg-slate-950 hover:bg-indigo-700"}`}
              >
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">Próxima ação</span>
                  <span className="mt-1 block text-base font-black">Iniciar missão</span>
                </span>
                <ChevronRight className={`size-6 transition-transform ${pressed === "start" ? "translate-x-2" : ""}`} />
              </button>
            </section>
          )}

          {screen === "live" && (
            <section className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="rounded-[28px] bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">Agora</span>
                  <span className="text-xs font-bold text-blue-100">09:30–10:00</span>
                </div>
                <h1 className="mt-5 text-2xl font-black">Catedral Metropolitana</h1>
                <p className="mt-2 text-sm text-blue-100">Complete os três marcos para revelar a próxima etapa.</p>
                <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-emerald-300 transition-all duration-500" style={{ width: `${(completed / 3) * 100}%` }} />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {checklist.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => void toggleItem(item)}
                    className={`flex min-h-16 w-full items-center gap-3 rounded-[22px] border px-4 text-left shadow-sm transition-all duration-200 active:scale-[0.98] ${
                      pressed === item.id
                        ? "border-indigo-400 bg-indigo-100 ring-4 ring-indigo-100"
                        : item.done
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/50"
                    }`}
                  >
                    <span className={`grid size-9 place-items-center rounded-full transition-all duration-300 ${item.done ? "rotate-[360deg] bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {item.done ? <Check className="size-5" strokeWidth={3} /> : <Circle className="size-4" />}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Marco {index + 1}</span>
                      <span className={`mt-1 block text-sm font-bold ${item.done ? "text-emerald-900" : "text-slate-800"}`}>{item.label}</span>
                    </span>
                    {item.done && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">+6 XP</span>}
                  </button>
                ))}
              </div>

              <div className={`mt-4 rounded-[24px] border p-4 transition-all duration-500 ${allDone ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-100"}`}>
                <div className="flex items-center gap-3">
                  <div className={`grid size-10 place-items-center rounded-2xl ${allDone ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-400"}`}>
                    {allDone ? <Sparkles className="size-5" /> : <Lock className="size-5" />}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Próximo mistério</p>
                    <p className="mt-1 text-sm font-black">{allDone ? "Liberado: Praça dos Três Poderes" : "Conclua os marcos para revelar"}</p>
                  </div>
                </div>
              </div>

              <button
                disabled={!allDone}
                onClick={() => void concludeStage()}
                className={`mt-4 flex min-h-16 w-full items-center justify-between rounded-[24px] px-5 text-white shadow-lg transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none ${
                  pressed === "conclude" ? "bg-emerald-500 ring-4 ring-emerald-200" : "bg-violet-700 hover:bg-fuchsia-700"
                }`}
              >
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.16em] opacity-75">Ação principal</span>
                  <span className="mt-1 block text-base font-black">Concluir etapa</span>
                </span>
                <ChevronRight className={`size-6 transition-transform ${pressed === "conclude" ? "translate-x-2" : ""}`} />
              </button>
            </section>
          )}

          {screen === "success" && (
            <section className="animate-in zoom-in-95 fade-in duration-500">
              <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-6 text-center text-white shadow-xl">
                <div className="mx-auto grid size-20 place-items-center rounded-full bg-white/20 ring-8 ring-white/10">
                  <Trophy className="size-10" />
                </div>
                <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-50">Etapa concluída</p>
                <h1 className="mt-2 text-3xl font-black">Muito bem.</h1>
                <p className="mt-2 text-sm leading-6 text-emerald-50">Você concluiu a Catedral com todos os marcos essenciais registrados.</p>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <Stat value="+48" label="XP" />
                  <Stat value="3/3" label="Marcos" />
                  <Stat value="100%" label="Completo" />
                </div>
              </div>

              <div className="mt-4 rounded-[26px] border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-400 text-amber-950"><Gift className="size-5" /></div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-700">Recompensa revelada</p>
                    <p className="mt-1 text-sm font-black text-amber-950">Selo “Roteiro sem pendências”</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">Reconhecimento por qualidade operacional — não por velocidade.</p>
                  </div>
                </div>
              </div>

              <button onClick={() => setScreen("progression")} className="mt-4 flex min-h-16 w-full items-center justify-between rounded-[24px] bg-slate-950 px-5 text-white shadow-lg transition-all duration-200 hover:bg-indigo-700 active:scale-[0.97]">
                <span className="text-left"><span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">Descobrir</span><span className="mt-1 block text-base font-black">Ver minha evolução</span></span>
                <ChevronRight className="size-6" />
              </button>
            </section>
          )}

          {screen === "progression" && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-400">
              <div className="rounded-[30px] bg-slate-950 p-5 text-white shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.17em] text-indigo-300">Perfil operacional</p>
                    <h1 className="mt-1 text-2xl font-black">Sua jornada no COBS</h1>
                  </div>
                  <BadgeCheck className="size-8 text-emerald-400" />
                </div>
                <div className="mt-5 flex items-center gap-4 rounded-[22px] bg-white/10 p-4">
                  <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500"><currentLevel.icon className="size-7" /></div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-300">Nível atual</p>
                    <p className="mt-1 text-lg font-black">{currentLevel.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{xp} XP · {operations} operações registradas</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {levels.map((level, index) => {
                  const unlocked = xp >= level.min;
                  const Icon = level.icon;
                  return (
                    <div key={level.name} className={`flex items-center gap-3 rounded-[22px] border p-4 ${unlocked ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white"}`}>
                      <div className={`grid size-11 place-items-center rounded-2xl ${unlocked ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                        {unlocked ? <Icon className="size-5" /> : <Lock className="size-4" />}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-black ${unlocked ? "text-indigo-950" : "text-slate-600"}`}>{level.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{level.min} XP necessários</p>
                      </div>
                      {unlocked && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">LIBERADO</span>}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex gap-3">
                  <Star className="mt-0.5 size-5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-black">Como isso pode influenciar futuras oportunidades?</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">Experiência no COBS pode compor um índice de prontidão junto com treinamento, avaliações, pontualidade, segurança e competências validadas. Nunca “mais cliques = mais trabalhos”.</p>
                  </div>
                </div>
              </div>

              <button onClick={reset} className="mt-4 min-h-14 w-full rounded-[22px] bg-indigo-700 px-4 text-sm font-black text-white transition hover:bg-fuchsia-700 active:scale-[0.97]">Jogar a missão novamente</button>
            </section>
          )}

          <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Feedback disponível</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-600">
              <Mini icon={Sparkles} label="Visual" />
              <Mini icon={Volume2} label="Áudio" />
              <Mini icon={Vibrate} label="Haptic" />
            </div>
          </section>

          {events.length > 0 && (
            <section className="mt-4 rounded-[24px] border border-slate-200 bg-slate-100 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Eventos para orquestração futura</p>
              <div className="mt-2 space-y-1.5">
                {events.map((event, index) => (
                  <div key={`${event.event}-${index}`} className="rounded-xl bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">{event.event}</div>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-slate-500">No produto real, estes eventos podem seguir por backend seguro para n8n. Este laboratório não envia webhooks reais.</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl bg-white/15 px-2 py-3"><p className="text-lg font-black">{value}</p><p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-50">{label}</p></div>;
}

function Mini({ icon: Icon, label }: { icon: typeof Headphones; label: string }) {
  return <div className="rounded-2xl bg-slate-50 py-3"><Icon className="mx-auto size-4 text-indigo-600" /><p className="mt-1">{label}</p></div>;
}
