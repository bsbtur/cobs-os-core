import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckSquare, MapPin, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

type LibraryChecklistItem = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  requirement: string;
};

type LibraryVisitPoint = {
  id: string;
  attraction_name: string | null;
  category: string | null;
  title: string;
  interpretation: string | null;
  estimated_minutes: number | null;
  is_required: boolean;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function PickerShell({
  open,
  onOpenChange,
  title,
  search,
  onSearch,
  count,
  pending,
  onAdd,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  search: string;
  onSearch: (value: string) => void;
  count: number;
  pending: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Pesquisar na biblioteca" className="min-h-11 pl-9" />
        </div>
        <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-border/70 p-2">{children}</div>
        <Button className="min-h-11 w-full" disabled={count === 0 || pending} onClick={onAdd}>
          Adicionar {count > 0 ? `${count} selecionado${count === 1 ? "" : "s"}` : "selecionados"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function ChecklistLibraryPicker({ stepId, operationId }: { stepId: string; operationId: string }) {
  const { tenant } = useTenant();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);

  const catalog = useQuery({
    queryKey: ["library-checklists", tenant?.id],
    enabled: open && Boolean(tenant?.id),
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client.from("library_checklist_items").select("id,title,description,category,requirement").eq("tenant_id", tenant!.id).eq("is_active", true).order("category").order("title");
      if (error) throw error;
      return (data ?? []) as LibraryChecklistItem[];
    },
  });

  const rows = React.useMemo(() => {
    const needle = normalize(search);
    return (catalog.data ?? []).filter((item) => !needle || normalize(`${item.title} ${item.description ?? ""} ${item.category ?? ""}`).includes(needle));
  }, [catalog.data, search]);

  const add = useMutation({
    mutationFn: async () => {
      const client = supabase as any;
      const { error } = await client.rpc("add_library_checklist_items_to_step", { _journey_step_id: stepId, _library_item_ids: selected });
      if (error) throw error;
    },
    onSuccess: async () => {
      feedback.success(`${selected.length} item(ns) adicionado(s) da Biblioteca.`);
      setSelected([]); setSearch(""); setOpen(false);
      await queryClient.refetchQueries({ queryKey: ["journey", operationId] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const toggle = (id: string, checked: boolean) => setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));

  return <>
    <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}><BookOpen className="mr-1.5 size-4" aria-hidden="true" />Adicionar da Biblioteca</Button>
    <PickerShell open={open} onOpenChange={setOpen} title="Biblioteca de Checklists" search={search} onSearch={setSearch} count={selected.length} pending={add.isPending} onAdd={() => add.mutate()}>
      {catalog.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando biblioteca…</p> : rows.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhum checklist encontrado.</p> : <ul className="space-y-1">{rows.map((item) => <li key={item.id}><label className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted/50"><Checkbox checked={selected.includes(item.id)} onCheckedChange={(value) => toggle(item.id, value === true)} /><CheckSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{item.category ?? "Sem categoria"} · {item.requirement === "required" ? "Obrigatório" : "Opcional"}</span>{item.description ? <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span> : null}</span></label></li>)}</ul>}
    </PickerShell>
  </>;
}

export function VisitPointLibraryPicker({ stepId, operationId }: { stepId: string; operationId: string }) {
  const { tenant } = useTenant();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);

  const catalog = useQuery({
    queryKey: ["library-visit-points", tenant?.id],
    enabled: open && Boolean(tenant?.id),
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client.from("library_visit_points").select("id,attraction_name,category,title,interpretation,estimated_minutes,is_required").eq("tenant_id", tenant!.id).eq("is_active", true).order("attraction_name").order("title");
      if (error) throw error;
      return (data ?? []) as LibraryVisitPoint[];
    },
  });

  const rows = React.useMemo(() => {
    const needle = normalize(search);
    return (catalog.data ?? []).filter((item) => !needle || normalize(`${item.title} ${item.attraction_name ?? ""} ${item.interpretation ?? ""}`).includes(needle));
  }, [catalog.data, search]);

  const groups = React.useMemo(() => {
    const map = new Map<string, LibraryVisitPoint[]>();
    for (const item of rows) { const key = item.attraction_name || "Sem atrativo"; map.set(key, [...(map.get(key) ?? []), item]); }
    return [...map.entries()];
  }, [rows]);

  const add = useMutation({
    mutationFn: async () => {
      const client = supabase as any;
      const { error } = await client.rpc("add_library_visit_points_to_step", { _journey_step_id: stepId, _library_point_ids: selected });
      if (error) throw error;
    },
    onSuccess: async () => {
      feedback.success(`${selected.length} ponto(s) adicionado(s) da Biblioteca.`);
      setSelected([]); setSearch(""); setOpen(false);
      await queryClient.refetchQueries({ queryKey: ["visit-points", operationId] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const toggle = (id: string, checked: boolean) => setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));

  return <>
    <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}><BookOpen className="mr-1.5 size-4" aria-hidden="true" />Adicionar da Biblioteca</Button>
    <PickerShell open={open} onOpenChange={setOpen} title="Biblioteca de Pontos da Visita" search={search} onSearch={setSearch} count={selected.length} pending={add.isPending} onAdd={() => add.mutate()}>
      {catalog.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando biblioteca…</p> : groups.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhum ponto encontrado.</p> : <div className="space-y-3">{groups.map(([attraction, items]) => <section key={attraction}><p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{attraction}</p><ul className="space-y-1">{items.map((item) => <li key={item.id}><label className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted/50"><Checkbox checked={selected.includes(item.id)} onCheckedChange={(value) => toggle(item.id, value === true)} /><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{item.estimated_minutes ? `${item.estimated_minutes} min · ` : ""}{item.is_required ? "Obrigatório" : "Opcional"}</span>{item.interpretation ? <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{item.interpretation}</span> : null}</span></label></li>)}</ul></section>)}</div>}
    </PickerShell>
  </>;
}
