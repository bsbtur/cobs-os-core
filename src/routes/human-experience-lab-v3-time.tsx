import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Circle,
  Clock3,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Trophy,
  Vibrate,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  emitHumanExperienceEvent,
  type HumanExperienceEventRecord,
} from "@/lib/humanExperienceOrchestration";

export const Route = createFileRoute("/human-experience-lab-v3-time")({
  head: () => ({
    meta: [
      { title: "COBS Human Experience Lab V3 — Time First" },
      {
        name: "description",
        content: "Protótipo isolado com relógio sincronizado e tempo operacional em destaque.",
      },
    ],
  }),
  component: HumanExperienceLabV3Time,
});

type Screen = "mission" | "live" | "success";
type ChecklistItem = { id: string; label: string; done: boolean };

const initialChecklist: ChecklistItem[] = [
  { id: "arrival", label: "Confirmar chegada ao ponto", done: false },
  { id: "orient", label: "Orientar o grupo", done: false },
  { id: "interpret", label: "Apresentar o ponto principal", done: false },
];

function formatClock(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatRemaining(ms: number) {
  const absolute = Math.abs(ms);
  const totalSeconds = Math.floor(absolute / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (ms >= 0) return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function HumanExperienceLabV3Time() {
  const [screen, setScreen] = useState<Screen>("mission");
  const [checklist, setChecklist] = useState(initialChecklist);
  const [pressed, setPressed] = useState<string | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"syncing" | "server" | "device">("syncing");
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [stageEndAt, setStageEndAt] = useState(() => Date.now() + 30 * 60 * 1000);
  const [events, setEvents] = useState<HumanExperienceEventRecord[]>([]);

  const now = useMemo(() => new Date(tick + serverOffsetMs), [tick, serverOffsetMs]);
  const remainingMs = stageEndAt - now.getTime();
  const completed = checklist.filter((item) => item.done).length;
  const allDone = completed === checklist.length;

  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void syncClock();
    const interval = window.setInterval(() => void syncClock(), 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  async function syncClock() {
    if (typeof window === "undefined") return;
    setSyncStatus("syncing");
    try {
      const before = Date.now();
      const response = await fetch(window.location.href, { method: "HEAD", cache: "no-store" });
      const after = Date.now();
      const serverDate = response.headers.get("date");
      if (!serverDate) throw new Error("Server Date header unavailable");
      const midpoint = before + (after - before) / 2;
      const serverNow = new Date(serverDate).getTime();
      const offset = serverNow - midpoint;
      setServerOffsetMs(offset);
      setLastSyncAt(new Date(serverNow));
      setStageEndAt((current) => current + offset);
      setSyncStatus("server");
    } catch {
      setServerOffsetMs(0);
      setLastSyncAt(new Date());
      setSyncStatus("device");
    }
  }

  async function recordEvent(
    event: Parameters<typeof emitHumanExperienceEvent>[0],
    payload: Record<string, unknown>,
  ) {
    const record = await emitHumanExperienceEvent(event, {
      ...payload,
      displayTime: now.toISOString(),
      clockSource: syncStatus === "server" ? "server-synchronized" : "device-fallback",
      timeZone: "America/Sao_Paulo",
    });
    setEvents((current) => [record, ...current].slice(0, 5));
  }

  function flash(id: string) {
    setPressed(id);
    window.setTimeout(() => setPressed(null), 260);
  }

  function vibrate(pattern: number | number[] = [20, 30, 40]) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
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
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);
    gain.connect(ctx.destination);
    [650, 860].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(ctx.currentTime + index * 0.12);
      oscillator.stop(ctx.currentTime + 0.2 + index * 0.12);
    });
    window.setTimeout(() => void ctx.close(), 550);
  }

  async function startMission() {
    flash("start");
    vibrate(20);
    const start = now.getTime();
    setStageEndAt(start + 30 * 60 * 1000);
    await recordEvent("operation.started", {
      operation: "City Tour Brasília — Time First Lab",
      startedAtAuthoritativePreview: now.toISOString(),
    });
    window.setTimeout(() => setScreen("live"), 220);
  }

  async function toggleItem(item: ChecklistItem) {
    flash(item.id);
    const done = !item.done;
    setChecklist((current) => current.map((entry) => (entry.id === item.id ? { ...entry, done } : entry)));
    if (done) {
      vibrate(18);
      await recordEvent("checklist.completed", { itemId: item.id, label: item.label });
    }
  }

  async function concludeStage() {
    if (!allDone) return;
    flash("conclude");
    playSuccess();
    vibrate([25, 40, 55]);
    await recordEvent("stage.completed", {
      operation: "City Tour Brasília — Time First Lab",
      stage: "Catedral Metropolitana",
      completedAtAuthoritativePreview: now.toISOString(),
      varianceMs: -remainingMs,
    });
    window.setTimeout(() => setScreen("success"), 280);
  }

  function reset() {
    setScreen("mission");
    setChecklist(initialChecklist);
    setPressed(null);
    setEvents([]);
    setStageEndAt(now.getTime() + 30 * 60 * 1000);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950 sm:px-4 sm:py-6">
      <div className="mx-auto min-h-screen max-w-[430px] overflow-hidden bg-slate-50 shadow-2xl sm:min-h-[900px] sm:rounded-[34px]">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">COBS Human Experience V3</p>
            <p className="mt-0.5 text-sm font-bold">Time First · Brasília</p>
          </div>
          <button onClick={reset} className="grid size-11 place-items-center rounded-2xl border border-slate-200 bg-white transition active:rotate-[-12deg] active:scale-90">
            <RotateCcw className="size-4" />
          </button>
        </header>

        <div className="px-4 py-4">
          <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock3 className="size-5 text-indigo-300" />
                  <span className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-400">Horário operacional</span>
                </div>
                <p className="mt-2 font-mono text-[42px] font-black leading-none tracking-[-0.06em] tabular-nums sm:text-[46px]">{formatClock(now)}</p>
                <p className="mt-2 text-xs font-semibold text-slate-400">{formatDate(now)} · America/Sao_Paulo</p>
              </div>
              <div className={`rounded-2xl px-3 py-2 text-right ${syncStatus === "server" ? "bg-emerald-500/15 text-emerald-300" : syncStatus === "syncing" ? "bg-amber-400/15 text-amber-300" : "bg-slate-700 text-slate-300"}`}>
                <div className="flex items-center justify-end gap-1"><ShieldCheck className="size-4" /><span className="text-[10px] font-black uppercase">{syncStatus === "server" ? "Sincronizado" : syncStatus === "syncing" ? "Sincronizando" : "Relógio local"}</span></div>
                {lastSyncAt && <p className="mt-1 text-[9px] opacity-80">sync {formatClock(lastSyncAt)}</p>}
              </div>
            </div>
          </section>

          {screen !== "success" && (
            <section className={`mt-4 rounded-[28px] border p-5 shadow-lg transition-all duration-500 ${remainingMs < 0 ? "border-rose-200 bg-rose-50" : remainingMs < 5 * 60 * 1000 ? "border-amber-200 bg-amber-50" : "border-indigo-100 bg-white"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500">{remainingMs >= 0 ? "Tempo restante" : "Atraso da etapa"}</p>
                  <p className={`mt-1 font-mono text-[46px] font-black leading-none tracking-[-0.05em] tabular-nums ${remainingMs < 0 ? "text-rose-600" : remainingMs < 5 * 60 * 1000 ? "text-amber-600" : "text-indigo-700"}`}>{formatRemaining(remainingMs)}</p>
                </div>
                <div className={`grid size-14 place-items-center rounded-2xl ${remainingMs < 0 ? "bg-rose-100 text-rose-600" : remainingMs < 5 * 60 * 1000 ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-700"}`}>
                  <TimerReset className="size-7" />
                </div>
              </div>
              <div className="mt-4 flex justify-between text-xs font-semibold text-slate-500">
                <span>Janela da etapa: 30 min</span>
                <span>Fim previsto {formatClock(new Date(stageEndAt))}</span>
              </div>
            </section>
          )}

          {screen === "mission" && (
            <section className="mt-4 animate-in fade-in slide-in-from-right-3 duration-300">
              <div className="rounded-[30px] bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-5 text-white shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">Nova missão</span>
                  <span className="text-xs font-bold text-violet-100">Etapa 4 de 8</span>
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <div className="grid size-14 place-items-center rounded-2xl bg-white/15"><MapPin className="size-7" /></div>
                  <div><p className="text-xs font-bold text-violet-100">Visita</p><h1 className="text-2xl font-black">Catedral Metropolitana</h1></div>
                </div>
                <p className="mt-4 text-sm leading-6 text-violet-100">O relógio acompanha a operação. Ao iniciar, o COBS cria uma janela real de 30 minutos para esta etapa.</p>
              </div>

              <button onClick={() => void startMission()} className={`mt-4 flex min-h-16 w-full items-center justify-between rounded-[24px] px-5 text-left text-white shadow-lg transition-all duration-200 active:scale-[0.97] ${pressed === "start" ? "bg-emerald-500 ring-4 ring-emerald-200" : "bg-slate-950 hover:bg-indigo-700"}`}>
                <span><span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">Próxima ação</span><span className="mt-1 block text-base font-black">Iniciar missão agora</span></span>
                <ChevronRight className={`size-6 transition-transform ${pressed === "start" ? "translate-x-2" : ""}`} />
              </button>
            </section>
          )}

          {screen === "live" && (
            <section className="mt-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="rounded-[28px] bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-lg">
                <div className="flex items-center justify-between"><span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">Agora</span><span className="text-xs font-bold text-blue-100">{completed}/3 marcos</span></div>
                <h1 className="mt-4 text-2xl font-black">Catedral Metropolitana</h1>
                <p className="mt-2 text-sm text-blue-100">Conclua os marcos mantendo o olho no tempo operacional.</p>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-emerald-300 transition-all duration-500" style={{ width: `${(completed / 3) * 100}%` }} /></div>
              </div>

              <div className="mt-4 space-y-2">
                {checklist.map((item, index) => (
                  <button key={item.id} onClick={() => void toggleItem(item)} className={`flex min-h-16 w-full items-center gap-3 rounded-[22px] border px-4 text-left shadow-sm transition-all duration-200 active:scale-[0.98] ${pressed === item.id ? "border-indigo-400 bg-indigo-100 ring-4 ring-indigo-100" : item.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:bg-indigo-50"}`}>
                    <span className={`grid size-9 place-items-center rounded-full transition-all duration-300 ${item.done ? "rotate-[360deg] bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>{item.done ? <Check className="size-5" strokeWidth={3} /> : <Circle className="size-4" />}</span>
                    <span className="flex-1"><span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Marco {index + 1}</span><span className={`mt-1 block text-sm font-bold ${item.done ? "text-emerald-900" : "text-slate-800"}`}>{item.label}</span></span>
                    {item.done && <Sparkles className="size-4 text-emerald-600" />}
                  </button>
                ))}
              </div>

              <button disabled={!allDone} onClick={() => void concludeStage()} className={`mt-4 flex min-h-16 w-full items-center justify-between rounded-[24px] px-5 text-white shadow-lg transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none ${pressed === "conclude" ? "bg-emerald-500 ring-4 ring-emerald-200" : "bg-violet-700 hover:bg-fuchsia-700"}`}>
                <span><span className="block text-[10px] font-black uppercase tracking-[0.16em] opacity-75">Ação principal</span><span className="mt-1 block text-base font-black">Concluir etapa</span></span>
                <ChevronRight className={`size-6 transition-transform ${pressed === "conclude" ? "translate-x-2" : ""}`} />
              </button>
            </section>
          )}

          {screen === "success" && (
            <section className="mt-4 animate-in zoom-in-95 fade-in duration-500">
              <div className="rounded-[32px] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-6 text-center text-white shadow-xl">
                <div className="mx-auto grid size-20 place-items-center rounded-full bg-white/20 ring-8 ring-white/10"><Trophy className="size-10" /></div>
                <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-50">Etapa concluída</p>
                <h1 className="mt-2 text-3xl font-black">Tempo registrado.</h1>
                <p className="mt-2 text-sm leading-6 text-emerald-50">Conclusão registrada no laboratório em {formatClock(now)} · America/Sao_Paulo.</p>
              </div>
              <button onClick={reset} className="mt-4 min-h-14 w-full rounded-[22px] bg-indigo-700 px-4 text-sm font-black text-white transition hover:bg-fuchsia-700 active:scale-[0.97]">Testar novamente</button>
            </section>
          )}

          <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Como o tempo funciona neste laboratório</p>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              <p><strong>Display:</strong> atualiza a cada segundo e mostra Brasília em 24h.</p>
              <p><strong>Sincronização:</strong> tenta calcular diferença entre o aparelho e o horário do servidor do próprio preview. Se indisponível, usa o relógio local como fallback.</p>
              <p><strong>Produção futura:</strong> o fato oficial deve ser gravado pelo backend/PostgreSQL em UTC e convertido apenas na apresentação. Assim alterar o relógio do celular não altera a verdade operacional.</p>
            </div>
            <button onClick={() => void syncClock()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-700 transition active:scale-[0.98]"><Clock3 className="size-4" /> Sincronizar agora</button>
          </section>

          <section className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-600">
            <Mini icon={Sparkles} label="Visual" />
            <Mini icon={Volume2} label="Áudio" />
            <Mini icon={Vibrate} label="Haptic" />
          </section>

          {events.length > 0 && (
            <section className="mt-4 rounded-[24px] border border-slate-200 bg-slate-100 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Eventos de teste</p>
              <div className="mt-2 space-y-1.5">{events.map((event, index) => <div key={`${event.event}-${index}`} className="rounded-xl bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">{event.event} · {new Date(event.at).toLocaleTimeString("pt-BR")}</div>)}</div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function Mini({ icon: Icon, label }: { icon: typeof Sparkles; label: string }) {
  return <div className="rounded-2xl bg-white py-3 shadow-sm"><Icon className="mx-auto size-4 text-indigo-600" /><p className="mt-1">{label}</p></div>;
}
