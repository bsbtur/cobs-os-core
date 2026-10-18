import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  LEAD_STAGES,
  filterLeads,
  isLeadStatus,
  leadCounts,
  leadMetadata,
  leadMoveStages,
  leadOriginKey,
  leadQueryKey,
  leadStageAge,
  leadStatusLabel,
  updateLeadPipeline,
  whatsappUrl,
  type CommercialLead,
  type LeadAssignee,
  type LeadStatus,
  type PipelineChange,
} from "@/lib/commercial-leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";

function Choice({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label} className="min-h-11 min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LeadControls({
  lead,
  assignees,
  pending,
  change,
}: {
  lead: CommercialLead;
  assignees: LeadAssignee[];
  pending: boolean;
  change: (lead: CommercialLead, change: PipelineChange) => void;
}) {
  const options = assignees.map((person) => ({
    value: person.profile_id,
    label: person.display_name,
  }));
  if (
    lead.assigned_profile_id &&
    !options.some((option) => option.value === lead.assigned_profile_id)
  ) {
    options.push({
      value: lead.assigned_profile_id,
      label: lead.assigned_profile_name ?? "Responsável atual",
    });
  }
  return (
    <div className="space-y-3">
      <Choice
        label="Responsável"
        value={lead.assigned_profile_id ?? "unassigned"}
        disabled={pending}
        options={[{ value: "unassigned", label: "Sem responsável" }, ...options]}
        onChange={(value) => change(lead, { assignee: value === "unassigned" ? null : value })}
      />
      <Choice
        label="Mover para"
        value={lead.status}
        disabled={pending || lead.status === "converted" || Boolean(lead.converted_person_id)}
        options={leadMoveStages(lead).map((stage) => ({
          value: stage.value,
          label: stage.label,
        }))}
        onChange={(value) => {
          if (isLeadStatus(value)) change(lead, { status: value });
        }}
      />
      {!lead.converted_person_id && lead.status !== "converted" ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          “Convertido” é definido pelo fluxo canônico de criação/vínculo de Pessoa.
        </p>
      ) : null}
    </div>
  );
}

function WhatsAppLink({ phone }: { phone: string }) {
  const url = whatsappUrl(phone);
  return url ? (
    <Button asChild variant="outline" size="sm" className="min-h-11 w-full gap-2">
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${phone}`}>
        <MessageCircle className="size-4 text-success" aria-hidden="true" />
        WhatsApp
      </a>
    </Button>
  ) : (
    <p className="break-all text-xs text-muted-foreground">{phone || "WhatsApp não informado"}</p>
  );
}

export function OperationLeadsBoard({ operationId }: { operationId: string }) {
  const { tenant, canManage, loading, activeMembership } = useTenant();
  const { user } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [stage, setStage] = useState<LeadStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tenantId = tenant?.id ?? "";
  const profileId = user?.id ?? "";
  const scope = useQuery({
    queryKey: ["commercial-lead-operation", tenantId, profileId, operationId],
    enabled: Boolean(tenantId && profileId && canManage),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("id, name, code, timezone")
        .eq("id", operationId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Operation unavailable");
      return data;
    },
    retry: false,
  });
  const queryKey = leadQueryKey(tenantId, profileId, operationId);
  const enabled = Boolean(canManage && scope.data && tenantId && profileId);
  const leads = useQuery({
    queryKey,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_operation_commercial_leads", {
        _operation_id: operationId,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as CommercialLead[];
      return rows.filter((lead) => isLeadStatus(lead.status));
    },
  });
  const assignees = useQuery({
    queryKey: ["commercial-lead-assignees", tenantId, profileId, operationId],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_commercial_lead_assignees", {
        _operation_id: operationId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const mutation = useMutation({
    mutationKey: ["commercial-lead-pipeline", tenantId, operationId],
    mutationFn: async ({ lead, change }: { lead: CommercialLead; change: PipelineChange }) => {
      if (
        !enabled ||
        !canManage ||
        activeMembership?.tenant_id !== tenantId ||
        !leads.data?.some((row) => row.id === lead.id)
      )
        throw new Error("Lead unavailable");
      return updateLeadPipeline((name, args) => supabase.rpc(name, args), lead.id, change);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<CommercialLead[]>(queryKey, (rows) =>
        rows?.map((lead) => (lead.id === updated.id ? { ...lead, ...updated } : lead)),
      );
      void queryClient.invalidateQueries({ queryKey });
      feedback.success("Lead atualizado.");
    },
    onError: () =>
      feedback.error("Não foi possível atualizar o lead. Nenhuma aprovação foi iniciada."),
  });
  const rows = leads.data ?? [];
  const visible = useMemo(
    () => filterLeads(rows, { search, assignee, origin }),
    [rows, search, assignee, origin],
  );
  const counts = leadCounts(visible);
  const totalActive = visible.filter((lead) => lead.status !== "lost").length;
  const selected =
    visible.find((lead) => lead.id === selectedId) ?? rows.find((lead) => lead.id === selectedId);
  const sourceOptions = Array.from(
    new Map(
      rows.map((lead) => [
        leadOriginKey(lead),
        {
          value: leadOriginKey(lead),
          label: [lead.source, lead.campaign].filter(Boolean).join(" · ") || "Sem origem",
        },
      ]),
    ).values(),
  );
  const change = (lead: CommercialLead, values: PipelineChange) => {
    if (mutation.isPending) return;
    if (
      values.status === lead.status ||
      (values.assignee !== undefined && values.assignee === lead.assigned_profile_id)
    )
      return;
    mutation.mutate({ lead, change: values });
  };
  const time = (value: string) =>
    Number.isFinite(Date.parse(value))
      ? formatDateTime(value, { locale, timeZone: scope.data?.timezone ?? "UTC" })
      : "—";

  if (loading) return <PanelSkeleton rows={4} />;
  if (!canManage)
    return (
      <section className="py-8">
        <h1 className="text-2xl font-semibold">Leads comerciais</h1>
        <p className="mt-3 text-muted-foreground">
          Acesso disponível somente para proprietários e administradores.
        </p>
      </section>
    );
  const failed = scope.isError || leads.isError || assignees.isError;
  const waiting = scope.isPending || (enabled && (leads.isPending || assignees.isPending));
  const renderCard = (lead: CommercialLead) => (
    <article
      key={lead.id}
      className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong"
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.currentTarget.contains(event.target) &&
          !event.target.closest("button,a,[role=combobox],[role=option]")
        )
          setSelectedId(lead.id);
      }}
    >
      <div className="space-y-1">
        <Button
          variant="link"
          className="h-auto max-w-full justify-start whitespace-normal break-all p-0 text-left text-base font-semibold text-foreground"
          onClick={() => setSelectedId(lead.id)}
        >
          {lead.full_name}
        </Button>
        <p className="break-all text-xs text-muted-foreground">{lead.phone}</p>
        {lead.converted_person_id ? (
          <span className="inline-flex rounded border border-success/30 px-2 py-0.5 text-[10px] text-success">
            Pessoa criada
          </span>
        ) : null}
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="break-words">
          {leadMetadata(lead, "city") || "Cidade não informada"}
          {leadMetadata(lead, "party_size")
            ? ` · ${leadMetadata(lead, "party_size")} pessoa(s)`
            : ""}
        </p>
        <p className="break-words">
          {[lead.source, lead.campaign].filter(Boolean).join(" · ") || "Origem não informada"}
        </p>
        <p>{time(lead.created_at)}</p>
        <p>{leadStageAge(lead.status_changed_at)} na etapa</p>
      </div>
      <WhatsAppLink phone={lead.phone} />
      <LeadControls
        lead={lead}
        assignees={assignees.data ?? []}
        pending={mutation.isPending}
        change={change}
      />
    </article>
  );

  return (
    <section className="min-w-0 space-y-6">
      <header className="border-b border-border pb-5">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-primary">
          <SlidersHorizontal className="size-4" />
          Comercial
        </p>
        <h1 className="text-2xl font-semibold">Leads comerciais</h1>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {scope.data ? `${scope.data.name} · ${scope.data.code}` : "Fila da operação"}
        </p>
      </header>
      {failed ? (
        <div role="alert" className="space-y-3 border-l-2 border-destructive py-3 pl-4">
          <h2 className="font-medium">Não foi possível carregar a fila comercial.</h2>
          <p className="text-sm text-muted-foreground">
            Verifique o acesso e a disponibilidade do serviço de Leads nesta operação.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void scope.refetch();
              if (enabled) {
                void leads.refetch();
                void assignees.refetch();
              }
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : waiting ? (
        <PanelSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Total ativo", count: totalActive },
              ...LEAD_STAGES.map((item) => ({
                label: item.plural,
                count: counts[item.value] ?? 0,
              })),
            ].map((item) => (
              <div key={item.label} className="border-l border-border pl-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{item.count}</p>
              </div>
            ))}
          </div>
          <div className="grid min-w-0 gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="lead-search" className="text-xs font-medium text-muted-foreground">
                Buscar lead
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <Input
                  id="lead-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, telefone ou e-mail"
                  className="min-h-11 pl-9"
                />
              </div>
            </div>
            <Choice
              label="Filtrar responsável"
              value={assignee}
              onChange={setAssignee}
              options={[
                { value: "all", label: "Todos os responsáveis" },
                { value: "unassigned", label: "Sem responsável" },
                ...(assignees.data ?? []).map((person) => ({
                  value: person.profile_id,
                  label: person.display_name,
                })),
              ]}
            />
            <Choice
              label="Origem / campanha"
              value={origin}
              onChange={setOrigin}
              options={[{ value: "all", label: "Todas as origens" }, ...sourceOptions]}
            />
            <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground">
                {visible.length} de {rows.length} leads
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={!search && assignee === "all" && origin === "all" && stage === "all"}
                onClick={() => {
                  setSearch("");
                  setAssignee("all");
                  setOrigin("all");
                  setStage("all");
                }}
              >
                <X className="mr-2 size-4" />
                Limpar filtros
              </Button>
            </div>
          </div>
          <div className="lg:hidden">
            <Choice
              label="Etapa"
              value={stage}
              onChange={(value) => {
                if (value === "all" || isLeadStatus(value)) setStage(value);
              }}
              options={[
                { value: "all", label: `Todas (${visible.length})` },
                ...LEAD_STAGES.map((item) => ({
                  value: item.value,
                  label: `${item.label} (${counts[item.value] ?? 0})`,
                })),
              ]}
            />
          </div>
          {visible.length === 0 ? (
            <div className="py-10 text-center">
              <UserRound className="mx-auto mb-3 size-6 text-muted-foreground" />
              <h2 className="font-medium">
                {rows.length
                  ? "Nenhum lead corresponde aos filtros."
                  : "Nenhum lead nesta operação."}
              </h2>
            </div>
          ) : (
            <>
              <div className="hidden min-w-0 grid-cols-5 gap-3 lg:grid">
                {LEAD_STAGES.map((item) => (
                  <section key={item.value} className="min-w-0" aria-label={item.label}>
                    <header
                      className={`mb-3 flex items-center justify-between border-t-2 py-3 text-sm font-medium ${item.tone}`}
                    >
                      <h2>{item.label}</h2>
                      <span className="tabular-nums">{counts[item.value] ?? 0}</span>
                    </header>
                    <div className="space-y-3">
                      {visible.filter((lead) => lead.status === item.value).map(renderCard)}
                      {!counts[item.value] ? (
                        <p className="py-5 text-center text-xs text-muted-foreground">Sem leads</p>
                      ) : null}
                    </div>
                  </section>
                ))}
              </div>
              <div className="space-y-3 lg:hidden">
                {visible
                  .filter((lead) => stage === "all" || lead.status === stage)
                  .map((lead) => (
                    <div key={lead.id}>
                      <p className="mb-1 text-xs font-medium text-primary">
                        {leadStatusLabel(lead.status)}
                      </p>
                      {renderCard(lead)}
                    </div>
                  ))}
                {stage !== "all" && !counts[stage] ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum lead nesta etapa.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
      <Sheet
        open={Boolean(selected && enabled && !failed)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent className="w-full max-w-full overflow-y-auto sm:max-w-lg motion-reduce:transition-none">
          <SheetHeader>
            <SheetTitle>Detalhes do lead</SheetTitle>
            <SheetDescription className="break-all">{selected?.full_name}</SheetDescription>
          </SheetHeader>
          {selected && !failed && enabled ? (
            <div className="mt-6 space-y-6">
              <dl className="grid grid-cols-1 gap-4 text-sm">
                {[
                  ["Nome", selected.full_name],
                  ["E-mail", selected.email],
                  ["WhatsApp", selected.phone],
                  ["Cidade", leadMetadata(selected, "city")],
                  ["Quantidade de pessoas", leadMetadata(selected, "party_size")],
                  ["Origem", selected.source],
                  ["Campanha", selected.campaign],
                  ["Observação", leadMetadata(selected, "observation")],
                  ["Criado em", time(selected.created_at)],
                  ["Atualizado em", time(selected.updated_at)],
                  ["Responsável", selected.assigned_profile_name],
                  ["Status", leadStatusLabel(selected.status)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words">
                      {value || "Não informado"}
                    </dd>
                  </div>
                ))}
              </dl>
              {selected.converted_person_id ? (
                <p className="text-xs text-success">Pessoa criada</p>
              ) : null}
              <WhatsAppLink phone={selected.phone} />
              <LeadControls
                lead={selected}
                assignees={assignees.data ?? []}
                pending={mutation.isPending}
                change={change}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}