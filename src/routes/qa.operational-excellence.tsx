import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Award,
  CheckCircle2,
  Clock3,
  FileCheck2,
  HelpCircle,
  MessageCircle,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/qa/operational-excellence")({
  head: () => ({
    meta: [
      { title: "COBS V3.1-B4 — Operational Excellence QA" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OperationalExcellenceQa,
});

type DimensionKey =
  | "journey_execution"
  | "temporal_precision"
  | "operational_compliance"
  | "flow_traceability"
  | "communication_readiness";

type EvidenceRow = {
  dimension_key: DimensionKey;
  outcome: "pass" | "partial" | "fail" | "not_applicable" | "missing";
  points_awarded: number;
  points_possible: number;
  evidence: unknown;
};

type QaPayload = {
  operation: { id: string; code: string; name: string; status: string };
  snapshot: {
    id: string;
    score: number;
    rounded_score: number;
    classification: string;
    evaluation_status: string;
    coverage_percent: number;
    dimension_scores: unknown[];
    evaluated_at: string;
    finalized_at: string | null;
    facts_fingerprint: string;
  };
  model: {
    model_key: string;
    version: number;
    weights: Record<string, number>;
    rules: Record<string, unknown>;
  };
  evidence: EvidenceRow[];
};

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const DIMENSIONS: Record<
  DimensionKey,
  { label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }
> = {
  journey_execution: { label: "Execução da jornada", shortLabel: "Jornada", icon: RouteIcon },
  temporal_precision: { label: "Precisão temporal", shortLabel: "Tempo", icon: Clock3 },
  operational_compliance: { label: "Conformidade operacional", shortLabel: "Conformidade", icon: ShieldCheck },
  flow_traceability: { label: "Rastreabilidade do fluxo", shortLabel: "Rastreabilidade", icon: FileCheck2 },
  communication_readiness: { label: "Comunicação operacional", shortLabel: "Comunicação", icon: MessageCircle },
};

function isQaPayload(value: unknown): value is QaPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.operation && record.snapshot && record.model && Array.isArray(record.evidence));
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function classificationLabel(value: string) {
  if (value === "gold") return "Operação Ouro";
  if (value === "silver") return "Operação Prata";
  if (value === "bronze") return "Operação Bronze";
  return "Operação em evolução";
}

function evidenceNarrative(row: EvidenceRow) {
  const evidence = row.evidence;
  if (row.dimension_key === "journey_execution" && evidence && typeof evidence === "object") {
    const e = evidence as Record<string, unknown>;
    return `${number(e.completed_steps)}/${number(e.total_steps)} etapas concluídas com registro operacional.`;
  }
  if (row.dimension_key === "temporal_precision" && Array.isArray(evidence)) {
    const delay = number((evidence[0] as Record<string, unknown> | undefined)?.delay_minutes);
    return delay > 0
      ? `Amostra temporal registrada com ${delay.toLocaleString("pt-BR")} min de desvio na partida.`
      : "Execução dentro da janela temporal registrada.";
  }
  if (row.dimension_key === "operational_compliance" && evidence && typeof evidence === "object") {
    const e = evidence as Record<string, unknown>;
    return `${number(e.required_visited)}/${number(e.required_points)} pontos obrigatórios comprovados.`;
  }
  if (row.dimension_key === "flow_traceability" && evidence && typeof evidence === "object") {
    const e = evidence as Record<string, unknown>;
    return `${number(e.flow_completed)}/${number(e.flow_steps)} etapas de fluxo rastreadas até a conclusão.`;
  }
  if (row.dimension_key === "communication_readiness") {
    return "Dimensão não aplicável neste snapshot: ainda não existe projeção canônica de comunicação por operação.";
  }
  return "Evidência registrada pelo motor operacional.";
}

function OperationalExcellenceQa() {
  const [payload, setPayload] = React.useState<QaPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const client = supabase as unknown as RpcClient;
        const { data, error: rpcError } = await client.rpc("get_v31b_b4_qa_excellence");
        if (rpcError) throw rpcError;
        if (!isQaPayload(data)) throw new Error("Snapshot QA canônico não disponível.");
        if (!active) return;
        setPayload(data);
        window.setTimeout(() => active && setRevealed(true), 80);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o snapshot canônico.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <main className="min-h-screen bg-background px-4 py-10 text-foreground">
        <div className="mx-auto max-w-md rounded-3xl border border-destructive/20 bg-card p-6 text-center shadow-sm">
          <HelpCircle className="mx-auto size-8 text-destructive" />
          <h1 className="mt-3 text-xl font-semibold">Snapshot indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="min-h-screen bg-background px-4 py-10 text-foreground">
        <div className="mx-auto max-w-md animate-pulse space-y-3">
          <div className="h-48 rounded-3xl bg-muted" />
          <div className="h-24 rounded-3xl bg-muted" />
          <div className="h-24 rounded-3xl bg-muted" />
        </div>
      </main>
    );
  }

  const score = payload.snapshot.rounded_score;
  const classification = classificationLabel(payload.snapshot.classification);
  const applicable = payload.evidence.filter((row) => row.outcome !== "not_applicable");
  const earned = applicable.reduce((sum, row) => sum + number(row.points_awarded), 0);
  const possible = applicable.reduce((sum, row) => sum + number(row.points_possible), 0);
  const lost = Math.max(0, possible - earned);

  return (
    <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-6">
      <div className="mx-auto max-w-md pb-8">
        <div className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
            COBS Human Experience V3.1-B4 · QA Mobile
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Operational Excellence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Snapshot canônico real do sandbox · somente leitura
          </p>
        </div>

        <section
          className={`relative overflow-hidden rounded-[2rem] border border-amber-500/25 bg-gradient-to-b from-amber-500/12 via-card to-card p-6 text-center shadow-sm transition-all duration-700 ${
            revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          <div className="pointer-events-none absolute inset-x-8 -top-16 h-40 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="relative mx-auto grid size-20 place-items-center rounded-full border border-amber-500/30 bg-background shadow-lg">
            <Trophy className="size-10 text-amber-500" aria-hidden="true" />
          </div>
          <p className="relative mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
            Excelência operacional
          </p>
          <h2 className="relative mt-1 text-2xl font-semibold">{classification}</h2>
          <div className="relative mt-3 flex items-end justify-center gap-1">
            <span className="text-6xl font-bold tracking-tight tabular-nums">{score}</span>
            <span className="mb-2 text-xl font-semibold text-muted-foreground">%</span>
          </div>
          <p className="relative mt-2 text-sm text-muted-foreground">{payload.operation.name}</p>
          <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-amber-500 transition-[width] duration-1000 ease-out motion-reduce:transition-none"
              style={{ width: revealed ? `${score}%` : "0%" }}
            />
          </div>
          <div className="relative mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" />
            Score final congelado · evidências persistidas
          </div>
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-border/70 bg-card p-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Obtidos</p>
            <p className="mt-1 text-xl font-semibold">{earned.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Possíveis</p>
            <p className="mt-1 text-xl font-semibold">{possible.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Perdidos</p>
            <p className="mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400">-{lost.toFixed(2)}</p>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Dimensões</p>
              <h3 className="mt-1 text-lg font-semibold">Como o score foi formado</h3>
            </div>
            <Award className="size-5 text-primary" />
          </div>

          <div className="space-y-2">
            {payload.evidence.map((row, index) => {
              const meta = DIMENSIONS[row.dimension_key];
              const Icon = meta.icon;
              const possiblePoints = number(row.points_possible);
              const awardedPoints = number(row.points_awarded);
              const ratio = possiblePoints > 0 ? (awardedPoints / possiblePoints) * 100 : 0;
              const na = row.outcome === "not_applicable";
              return (
                <details
                  key={row.dimension_key}
                  className={`group rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-500 ${
                    revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                  }`}
                  style={{ transitionDelay: `${180 + index * 70}ms` }}
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/70 text-primary">
                        <Icon className="size-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold">{meta.label}</p>
                          <p className="font-mono text-xs font-semibold tabular-nums">
                            {na ? "N/A" : `${awardedPoints.toFixed(2)} / ${possiblePoints.toFixed(2)}`}
                          </p>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-700"
                            style={{ width: na ? "0%" : `${Math.max(0, Math.min(100, ratio))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </summary>
                  <div className="mt-3 border-t border-border/60 pt-3 text-sm leading-6 text-muted-foreground">
                    {evidenceNarrative(row)}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-primary shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Por que recebi esta nota?</p>
              <p className="mt-2 text-sm leading-6">
                A operação cumpriu integralmente jornada, pontos obrigatórios e rastreabilidade. A perda veio somente da dimensão temporal: uma partida registrada com 10 minutos de desvio reduziu essa dimensão para 80%.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-border/70 bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
          <div className="flex items-center justify-between gap-3"><span>Modelo</span><strong className="text-foreground">{payload.model.model_key}</strong></div>
          <div className="mt-1 flex items-center justify-between gap-3"><span>Versão</span><strong className="text-foreground">v{payload.model.version}</strong></div>
          <div className="mt-1 flex items-center justify-between gap-3"><span>Status</span><strong className="text-foreground">{payload.snapshot.evaluation_status}</strong></div>
          <div className="mt-1 flex items-center justify-between gap-3"><span>Cobertura</span><strong className="text-foreground">{payload.snapshot.coverage_percent}%</strong></div>
          <p className="mt-3 border-t border-border/60 pt-3 text-[11px]">
            QA isolado. Este painel é read-only e consome um snapshot canônico persistido no sandbox; não altera score, evidências ou operação.
          </p>
        </section>
      </div>
    </main>
  );
}
