import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BedDouble,
  Bus,
  CalendarDays,
  CarFront,
  CheckSquare2,
  MapPin,
  MessageSquareText,
  Route,
  UserRound,
} from "lucide-react";

import { NAV_ITEMS } from "@/lib/navigation";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

/**
 * PX10.1 — tenant-scoped universal operational search.
 * Read-only projection over canonical domain tables; navigation never mutates domain state.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const navigate = useNavigate();

  const operational = useQuery({
    queryKey: ["px10-deep-command-search", tenant?.id],
    enabled: open && Boolean(tenant?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const [
        operations,
        people,
        steps,
        vehicles,
        drivers,
        legs,
        stays,
        events,
        sessions,
        messages,
        playbooks,
      ] = await Promise.all([
        supabase
          .from("operations")
          .select("id,name,code,status,primary_city,primary_region")
          .eq("tenant_id", tenant!.id)
          .order("planned_start", { ascending: false })
          .limit(50),
        supabase
          .from("people")
          .select("id,full_name,email")
          .eq("tenant_id", tenant!.id)
          .order("full_name")
          .limit(80),
        supabase
          .from("journey_steps")
          .select("id,title,operation_id,location_label,sequence,operations(name,code)")
          .eq("tenant_id", tenant!.id)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(80),
        supabase
          .from("vehicles")
          .select("id,label,identifier,operator_name,vehicle_kind")
          .eq("tenant_id", tenant!.id)
          .eq("is_active", true)
          .order("label")
          .limit(60),
        supabase
          .from("drivers")
          .select("id,driver_code,operator_name,people(full_name,email)")
          .eq("tenant_id", tenant!.id)
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(60),
        supabase
          .from("transport_legs")
          .select(
            "id,title,operation_id,origin_label,destination_label,sequence,operations(name,code)",
          )
          .eq("tenant_id", tenant!.id)
          .order("updated_at", { ascending: false })
          .limit(80),
        supabase
          .from("hospitality_stays")
          .select(
            "id,name,operation_id,status,hospitality_properties!hospitality_stays_property_id_fkey(name,city,region),operations!hospitality_stays_operation_id_fkey(name,code)",
          )
          .eq("tenant_id", tenant!.id)
          .order("updated_at", { ascending: false })
          .limit(60),
        supabase
          .from("events")
          .select("id,name,operation_id,status,external_producer_name,operations(name,code)")
          .eq("tenant_id", tenant!.id)
          .order("updated_at", { ascending: false })
          .limit(60),
        supabase
          .from("event_sessions")
          .select("id,title,event_id,session_kind,events(name,operation_id,operations(name,code))")
          .eq("tenant_id", tenant!.id)
          .order("updated_at", { ascending: false })
          .limit(80),
        supabase
          .from("messages")
          .select("id,title,kind,priority,status,operation_id,operations(name,code)")
          .eq("tenant_id", tenant!.id)
          .order("updated_at", { ascending: false })
          .limit(80),
        supabase
          .from("playbook_items")
          .select(
            "id,title,operation_id,journey_step_id,requirement,is_active,operations(name,code),journey_steps(title)",
          )
          .eq("tenant_id", tenant!.id)
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(80),
      ]);

      const results = {
        operations,
        people,
        steps,
        vehicles,
        drivers,
        legs,
        stays,
        events,
        sessions,
        messages,
        playbooks,
      };
      for (const result of Object.values(results)) {
        if (result.error) throw result.error;
      }

      return {
        operations: operations.data ?? [],
        people: people.data ?? [],
        steps: steps.data ?? [],
        vehicles: vehicles.data ?? [],
        drivers: drivers.data ?? [],
        legs: legs.data ?? [],
        stays: stays.data ?? [],
        events: events.data ?? [],
        sessions: sessions.data ?? [],
        messages: messages.data ?? [],
        playbooks: playbooks.data ?? [],
      };
    },
  });

  const closeAndNavigate = React.useCallback(
    (to: string) => {
      onOpenChange(false);
      void navigate({ to });
    },
    [navigate, onOpenChange],
  );

  const data = operational.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">{t("topbar.search")}</DialogTitle>
        <Command>
          <CommandInput
            placeholder={copy(
              locale,
              "Buscar operação, pessoa, veículo, hotel, evento, mensagem, checklist…",
              "Search operation, person, vehicle, hotel, event, message, checklist…",
            )}
          />
          <CommandList className="max-h-[70vh]">
            <CommandEmpty>{t("command.empty")}</CommandEmpty>

            {data?.operations.length ? (
              <CommandGroup heading={copy(locale, "Operações", "Operations")}>
                {data.operations.slice(0, 20).map((op) => (
                  <CommandItem
                    key={`op-${op.id}`}
                    value={`${op.name} ${op.code} ${op.primary_city ?? ""} ${op.primary_region ?? ""} operação`}
                    onSelect={() => closeAndNavigate(`/operations/${op.id}`)}
                  >
                    <Activity className="mr-2 size-4 text-primary" aria-hidden="true" />
                    <ResultText
                      title={op.name}
                      detail={`${op.code} · ${op.status}${op.primary_city ? ` · ${op.primary_city}` : ""}`}
                      mono
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {data?.people.length ? (
              <SearchGroup heading={copy(locale, "Pessoas", "People")}>
                {data.people.slice(0, 20).map((person) => (
                  <CommandItem
                    key={`person-${person.id}`}
                    value={`${person.full_name} ${person.email ?? ""} pessoa viajante`}
                    onSelect={() => closeAndNavigate("/people")}
                  >
                    <UserRound className="mr-2 size-4 text-primary" aria-hidden="true" />
                    <ResultText
                      title={person.full_name}
                      detail={person.email ?? copy(locale, "Cadastro de pessoa", "Person record")}
                    />
                  </CommandItem>
                ))}
              </SearchGroup>
            ) : null}

            {data?.steps.length ? (
              <SearchGroup heading={copy(locale, "Etapas", "Journey steps")}>
                {data.steps.slice(0, 20).map((step) => {
                  const operation = one(step.operations);
                  return (
                    <CommandItem
                      key={`step-${step.id}`}
                      value={`${step.title} ${step.location_label ?? ""} ${operation?.name ?? ""} ${operation?.code ?? ""} etapa roteiro`}
                      onSelect={() => closeAndNavigate(`/operations/${step.operation_id}/journey`)}
                    >
                      <Route className="mr-2 size-4 text-primary" aria-hidden="true" />
                      <ResultText
                        title={step.title}
                        detail={`${operation?.name ?? copy(locale, "Operação", "Operation")}${step.location_label ? ` · ${step.location_label}` : ""}`}
                        {...(step.location_label ? { icon: MapPin } : {})}
                      />
                    </CommandItem>
                  );
                })}
              </SearchGroup>
            ) : null}

            {data?.vehicles.length || data?.drivers.length || data?.legs.length ? (
              <SearchGroup heading={copy(locale, "Mobilidade", "Mobility")}>
                {data.vehicles.slice(0, 12).map((vehicle) => (
                  <CommandItem
                    key={`vehicle-${vehicle.id}`}
                    value={`${vehicle.label} ${vehicle.identifier ?? ""} ${vehicle.operator_name ?? ""} ${vehicle.vehicle_kind} veículo van ônibus carro`}
                    onSelect={() => closeAndNavigate("/operations")}
                  >
                    <CarFront className="mr-2 size-4 text-primary" aria-hidden="true" />
                    <ResultText
                      title={vehicle.label}
                      detail={`${vehicle.vehicle_kind}${vehicle.identifier ? ` · ${vehicle.identifier}` : ""}${vehicle.operator_name ? ` · ${vehicle.operator_name}` : ""}`}
                    />
                  </CommandItem>
                ))}
                {data.drivers.slice(0, 12).map((driver) => {
                  const person = one(driver.people);
                  return (
                    <CommandItem
                      key={`driver-${driver.id}`}
                      value={`${person?.full_name ?? ""} ${person?.email ?? ""} ${driver.driver_code ?? ""} ${driver.operator_name ?? ""} motorista`}
                      onSelect={() => closeAndNavigate("/operations")}
                    >
                      <UserRound className="mr-2 size-4 text-primary" aria-hidden="true" />
                      <ResultText
                        title={person?.full_name ?? copy(locale, "Motorista", "Driver")}
                        detail={`${driver.driver_code ?? copy(locale, "Motorista ativo", "Active driver")}${driver.operator_name ? ` · ${driver.operator_name}` : ""}`}
                      />
                    </CommandItem>
                  );
                })}
                {data.legs.slice(0, 16).map((leg) => {
                  const operation = one(leg.operations);
                  return (
                    <CommandItem
                      key={`leg-${leg.id}`}
                      value={`${leg.title} ${leg.origin_label ?? ""} ${leg.destination_label ?? ""} ${operation?.name ?? ""} ${operation?.code ?? ""} trecho transporte mobilidade`}
                      onSelect={() => closeAndNavigate(`/operations/${leg.operation_id}/mobility`)}
                    >
                      <Bus className="mr-2 size-4 text-primary" aria-hidden="true" />
                      <ResultText
                        title={leg.title}
                        detail={`${operation?.name ?? copy(locale, "Operação", "Operation")}${leg.origin_label || leg.destination_label ? ` · ${leg.origin_label ?? "?"} → ${leg.destination_label ?? "?"}` : ""}`}
                      />
                    </CommandItem>
                  );
                })}
              </SearchGroup>
            ) : null}

            {data?.stays.length ? (
              <SearchGroup heading={copy(locale, "Hospedagem", "Hospitality")}>
                {data.stays.slice(0, 18).map((stay) => {
                  const property = one(stay.hospitality_properties);
                  const operation = one(stay.operations);
                  return (
                    <CommandItem
                      key={`stay-${stay.id}`}
                      value={`${stay.name} ${property?.name ?? ""} ${property?.city ?? ""} ${property?.region ?? ""} ${operation?.name ?? ""} ${operation?.code ?? ""} hotel hospedagem`}
                      onSelect={() =>
                        closeAndNavigate(`/operations/${stay.operation_id}/hospitality`)
                      }
                    >
                      <BedDouble className="mr-2 size-4 text-primary" aria-hidden="true" />
                      <ResultText
                        title={stay.name}
                        detail={`${property?.name ?? copy(locale, "Hospedagem", "Stay")} · ${operation?.name ?? stay.status}`}
                      />
                    </CommandItem>
                  );
                })}
              </SearchGroup>
            ) : null}

            {data?.events.length || data?.sessions.length ? (
              <SearchGroup heading={copy(locale, "Eventos e sessões", "Events & sessions")}>
                {data.events.slice(0, 14).map((event) => {
                  const operation = one(event.operations);
                  return (
                    <CommandItem
                      key={`event-${event.id}`}
                      value={`${event.name} ${event.external_producer_name ?? ""} ${operation?.name ?? ""} ${operation?.code ?? ""} evento`}
                      onSelect={() => closeAndNavigate(`/operations/${event.operation_id}/events`)}
                    >
                      <CalendarDays className="mr-2 size-4 text-primary" aria-hidden="true" />
                      <ResultText
                        title={event.name}
                        detail={`${operation?.name ?? copy(locale, "Operação", "Operation")} · ${event.status}`}
                      />
                    </CommandItem>
                  );
                })}
                {data.sessions.slice(0, 14).map((session) => {
                  const event = one(session.events);
                  const operation = event ? one(event.operations) : undefined;
                  return (
                    <CommandItem
                      key={`session-${session.id}`}
                      value={`${session.title} ${session.session_kind} ${event?.name ?? ""} ${operation?.name ?? ""} ${operation?.code ?? ""} sessão palestra programação`}
                      onSelect={() =>
                        event?.operation_id &&
                        closeAndNavigate(`/operations/${event.operation_id}/events`)
                      }
                    >
                      <CalendarDays className="mr-2 size-4 text-primary" aria-hidden="true" />
                      <ResultText
                        title={session.title}
                        detail={`${event?.name ?? copy(locale, "Sessão", "Session")}${operation?.name ? ` · ${operation.name}` : ""}`}
                      />
                    </CommandItem>
                  );
                })}
              </SearchGroup>
            ) : null}

            {data?.messages.length ? (
              <SearchGroup heading={copy(locale, "Comunicação", "Communication")}>
                {data.messages.slice(0, 18).map((message) => {
                  const operation = one(message.operations);
                  return (
                    <CommandItem
                      key={`message-${message.id}`}
                      value={`${message.title} ${message.kind} ${message.priority} ${message.status} ${operation?.name ?? ""} ${operation?.code ?? ""} mensagem comunicação aviso`}
                      onSelect={() =>
                        message.operation_id &&
                        closeAndNavigate(`/operations/${message.operation_id}/communication`)
                      }
                    >
                      <MessageSquareText className="mr-2 size-4 text-primary" aria-hidden="true" />
                      <ResultText
                        title={message.title}
                        detail={`${operation?.name ?? copy(locale, "Comunicação", "Communication")} · ${message.priority} · ${message.status}`}
                      />
                    </CommandItem>
                  );
                })}
              </SearchGroup>
            ) : null}

            {data?.playbooks.length ? (
              <SearchGroup heading={copy(locale, "Checklists", "Checklists")}>
                {data.playbooks.slice(0, 18).map((item) => {
                  const operation = one(item.operations);
                  const step = one(item.journey_steps);
                  return (
                    <CommandItem
                      key={`playbook-${item.id}`}
                      value={`${item.title} ${item.requirement} ${operation?.name ?? ""} ${operation?.code ?? ""} ${step?.title ?? ""} checklist playbook`}
                      onSelect={() => closeAndNavigate(`/operations/${item.operation_id}/journey`)}
                    >
                      <CheckSquare2 className="mr-2 size-4 text-primary" aria-hidden="true" />
                      <ResultText
                        title={item.title}
                        detail={`${operation?.name ?? copy(locale, "Operação", "Operation")}${step?.title ? ` · ${step.title}` : ""} · ${item.requirement}`}
                      />
                    </CommandItem>
                  );
                })}
              </SearchGroup>
            ) : null}

            <CommandSeparator />
            <CommandGroup heading={t("command.group.navigate")}>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.id}
                    value={`${t(item.labelKey)} ${item.domain} ${item.activatesIn}`}
                    onSelect={() => {
                      onOpenChange(false);
                      void navigate({ to: item.to });
                    }}
                  >
                    <Icon className="mr-2 size-4" aria-hidden="true" />
                    <span>{t(item.labelKey)}</span>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {item.activatesIn}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function SearchGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <>
      <CommandSeparator />
      <CommandGroup heading={heading}>{children}</CommandGroup>
    </>
  );
}

function ResultText({
  title,
  detail,
  mono = false,
  icon: Icon,
}: {
  title: string;
  detail: string;
  mono?: boolean;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{title}</p>
      <p
        className={`flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground ${mono ? "font-mono uppercase tracking-[0.08em]" : ""}`}
      >
        {Icon ? <Icon className="size-3 shrink-0" aria-hidden="true" /> : null}
        <span className="truncate">{detail}</span>
      </p>
    </div>
  );
}

function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
