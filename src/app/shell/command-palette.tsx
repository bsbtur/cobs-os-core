import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, MapPin, Route, UserRound } from "lucide-react";

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
 * PX10 — global command palette.
 * Navigation remains static; operational search is tenant-scoped and read-only.
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
    queryKey: ["px10-command-search", tenant?.id],
    enabled: open && Boolean(tenant?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const [operations, people, steps] = await Promise.all([
        supabase
          .from("operations")
          .select("id,name,code,status,primary_city,primary_region")
          .eq("tenant_id", tenant!.id)
          .order("planned_start", { ascending: false })
          .limit(40),
        supabase
          .from("people")
          .select("id,full_name,email")
          .eq("tenant_id", tenant!.id)
          .order("full_name")
          .limit(60),
        supabase
          .from("journey_steps")
          .select("id,title,operation_id,location_label,sequence,operations(name,code)")
          .eq("tenant_id", tenant!.id)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(60),
      ]);

      if (operations.error) throw operations.error;
      if (people.error) throw people.error;
      if (steps.error) throw steps.error;

      return {
        operations: operations.data ?? [],
        people: people.data ?? [],
        steps: steps.data ?? [],
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
          <CommandInput placeholder={copy(locale, "Buscar operação, pessoa, etapa ou comando…", "Search operation, person, step or command…")} />
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
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{op.name}</p>
                      <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {op.code} · {op.status}
                        {op.primary_city ? ` · ${op.primary_city}` : ""}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {data?.people.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={copy(locale, "Pessoas", "People")}>
                  {data.people.slice(0, 20).map((person) => (
                    <CommandItem
                      key={`person-${person.id}`}
                      value={`${person.full_name} ${person.email ?? ""} pessoa viajante`}
                      onSelect={() => closeAndNavigate("/people")}
                    >
                      <UserRound className="mr-2 size-4 text-primary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{person.full_name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {person.email ?? copy(locale, "Cadastro de pessoa", "Person record")}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {data?.steps.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={copy(locale, "Etapas", "Journey steps")}>
                  {data.steps.slice(0, 25).map((step) => {
                    const operation = Array.isArray(step.operations) ? step.operations[0] : step.operations;
                    return (
                      <CommandItem
                        key={`step-${step.id}`}
                        value={`${step.title} ${step.location_label ?? ""} ${operation?.name ?? ""} ${operation?.code ?? ""} etapa roteiro`}
                        onSelect={() => closeAndNavigate(`/operations/${step.operation_id}/journey`)}
                      >
                        <Route className="mr-2 size-4 text-primary" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{step.title}</p>
                          <p className="flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
                            {step.location_label ? <MapPin className="size-3 shrink-0" aria-hidden="true" /> : null}
                            <span className="truncate">
                              {operation?.name ?? copy(locale, "Operação", "Operation")}
                              {step.location_label ? ` · ${step.location_label}` : ""}
                            </span>
                          </p>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
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
                      navigate({ to: item.to });
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