import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckSquare, MapPin, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { feedback } from "@/components/feedback/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Biblioteca Operacional — COBS OS" }, { name: "robots", content: "noindex" }] }),
  component: OperationalLibraryPage,
});

type Operation = { id: string; code: string; name: string; status: string };
type Step = { id: string; operation_id: string; sequence: number; title: string; step_kind: string };
type ChecklistLibraryItem = { id: string; title: string; description: string | null; category: string | null; requirement: string };
type VisitPointLibraryItem = { id: string; attraction_name: string | null; title: string; interpretation: string | null; guide_tip: string | null; estimated_minutes: number | null; is_required: boolean };

const SELECT_CLASS = "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function OperationalLibraryPage() {
  const { tenant } = useTenant();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [operationId, setOperationId] = React.useState("");
  const [stepId, setStepId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selectedChecklists, setSelectedChecklists] = React.useState<string[]>([]);
  const [selectedPoints, setSelectedPoints] = React.useState<string[]>([]);

  const operations = useQuery({
    queryKey: ["library-operations", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client.from("operations").select("id,code,name,status").eq("tenant_id", tenant!.id).is("archived_at", null).order("planned_start", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Operation[];
    },
  });

  const steps = useQuery({
    queryKey: ["library-operation-steps", operationId],
    enabled: Boolean(operationId),
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client.from("journey_steps").select("id,operation_id,sequence,title,step_kind").eq("operation_id", operationId).is("archived_at", null).order("sequence");
      if (error) throw error;
      return (data ?? []) as Step[];
    },
  });

  const checklists = useQuery({
    queryKey: ["library-checklists", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client.from("library_checklist_items").select("id,title,description,category,requirement").eq("tenant_id", tenant!.id).eq("is_active", true).order("category").order("title");
      if (error) throw error;
      return (data ?? []) as ChecklistLibraryItem[];
    },
  });

  const visitPoints = useQuery({
    queryKey: ["library-visit-points", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client.from("library_visit_points").select("id,attraction_name,title,interpretation,guide_tip,estimated_minutes,is_required").eq("tenant_id", tenant!.id).eq("is_active", true).order("attraction_name").order("title");
      if (error) throw error;
      return (data ?? []) as VisitPointLibraryItem[];
    },
  });

  React.useEffect(() => { setStepId(""); setSelectedChecklists([]); setSelectedPoints([]); }, [operationId]);
  React.useEffect(() => { setSelectedChecklists([]); setSelectedPoints([]); }, [stepId]);

  const filteredChecklists = React.useMemo(() => {
    const needle = normalize(search);
    return (checklists.data ?? []).filter((item) => !needle || normalize(`${item.title} ${item.description ?? ""} ${item.category ?? ""}`).includes(needle));
  }, [checklists.data, search]);

  const filteredPoints = React.useMemo(() => {
    const needle = normalize(search);
    return (visitPoints.data ?? []).filter((item) => !needle || normalize(`${item.title} ${item.attraction_name ?? ""} ${item.interpretation ?? ""}`).includes(needle));
  }, [visitPoints.data, search]);

  const addChecklists = useMutation({
    mutationFn: async () => {
      const client = supabase as any;
      const { error } = await client.rpc("add_library_checklist_items_to_step", { _journey_step_id: stepId, _library_item_ids: selectedChecklists });
      if (error) throw error;
    },
    onSuccess: async () => {
      feedback.success(`${selectedChecklists.length} checklist(s) adicionado(s) à etapa.`);
      setSelectedChecklists([]);
      await queryClient.invalidateQueries({ queryKey: ["journey", operationId] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const addPoints = useMutation({
    mutationFn: async () => {
      const client = supabase as any;
      const { error } = await client.rpc("add_library_visit_points_to_step", { _journey_step_id: stepId, _library_point_ids: selectedPoints });
      if (error) throw error;
    },
    onSuccess: async () => {
      feedback.success(`${selectedPoints.length} ponto(s) de visita adicionado(s) à etapa.`);
      setSelectedPoints([]);
      await queryClient.invalidateQueries({ queryKey: ["visit-points", operationId] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const toggle = (current: string[], id: string, checked: boolean, setter: React.Dispatch<React.SetStateAction<string[]>>) => setter(checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));

  const pointGroups = React.useMemo(() => {
    const map = new Map<string, VisitPointLibraryItem[]>();
    for (const point of filteredPoints) { const key = point.attraction_name || "Sem atrativo"; map.set(key, [...(map.get(key) ?? []), point]); }
    return [...map.entries()];
  }, [filteredPoints]);

  return (
    <section className="space-y-5">
      <header>
        <div className="flex items-center gap-2"><BookOpen className="size-5 text-primary" aria-hidden="true" /><h1 className="text-xl font-semibold">COBS Library</h1></div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Reutilize checklists e Pontos da Visita em novas operações sem redigitar. A Biblioteca é mestre; ao adicionar, o COBS cria uma cópia independente na etapa escolhida.</p>
      </header>

      <div className="surface-panel grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="library-operation">Operação</label><select id="library-operation" className={SELECT_CLASS} value={operationId} onChange={(event) => setOperationId(event.target.value)}><option value="">Selecione uma operação</option>{(operations.data ?? []).map((operation) => <option key={operation.id} value={operation.id}>{operation.code} — {operation.name}</option>)}</select></div>
        <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="library-step">Etapa</label><select id="library-step" className={SELECT_CLASS} value={stepId} onChange={(event) => setStepId(event.target.value)} disabled={!operationId}><option value="">Selecione uma etapa</option>{(steps.data ?? []).map((step) => <option key={step.id} value={step.id}>{step.sequence}. {step.title}</option>)}</select></div>
      </div>

      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar checklist, atrativo ou ponto da visita" className="min-h-11 pl-9" /></div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="surface-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-semibold"><CheckSquare className="size-4" aria-hidden="true" />Checklists</h2><p className="text-xs text-muted-foreground">{checklists.data?.length ?? 0} itens reutilizáveis</p></div><Button disabled={!stepId || selectedChecklists.length === 0 || addChecklists.isPending} onClick={() => addChecklists.mutate()}>Adicionar {selectedChecklists.length || "selecionados"}</Button></div>
          <div className="mt-3 max-h-[58vh] overflow-y-auto"><ul className="space-y-1">{filteredChecklists.map((item) => <li key={item.id}><label className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted/50"><Checkbox checked={selectedChecklists.includes(item.id)} onCheckedChange={(value) => toggle(selectedChecklists, item.id, value === true, setSelectedChecklists)} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{item.category ?? "Sem categoria"} · {item.requirement === "required" ? "Obrigatório" : "Opcional"}</span>{item.description ? <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span> : null}</span></label></li>)}</ul></div>
        </article>

        <article className="surface-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 font-semibold"><MapPin className="size-4" aria-hidden="true" />Pontos da Visita</h2><p className="text-xs text-muted-foreground">{visitPoints.data?.length ?? 0} pontos reutilizáveis</p></div><Button disabled={!stepId || selectedPoints.length === 0 || addPoints.isPending} onClick={() => addPoints.mutate()}>Adicionar {selectedPoints.length || "selecionados"}</Button></div>
          <div className="mt-3 max-h-[58vh] overflow-y-auto space-y-3">{pointGroups.map(([attraction, points]) => <section key={attraction}><p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{attraction}</p><ul className="space-y-1">{points.map((point) => <li key={point.id}><label className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted/50"><Checkbox checked={selectedPoints.includes(point.id)} onCheckedChange={(value) => toggle(selectedPoints, point.id, value === true, setSelectedPoints)} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{point.title}</span><span className="block text-xs text-muted-foreground">{point.estimated_minutes ? `${point.estimated_minutes} min · ` : ""}{point.is_required ? "Obrigatório" : "Opcional"}</span>{point.interpretation ? <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{point.interpretation}</span> : null}</span></label></li>)}</ul></section>)}</div>
        </article>
      </div>

      {!stepId ? <p className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">Selecione uma operação e uma etapa. Depois marque os itens que deseja reutilizar e clique em Adicionar.</p> : null}
    </section>
  );
}
