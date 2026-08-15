import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Clock3, ExternalLink } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";

type InboxMessage = {
  id: string;
  kind: string;
  priority: string;
  status: string;
  title: string;
  body: string;
  locale: string;
  operation_id: string | null;
  published_at: string | null;
  delivered_at: string | null;
  first_read_at: string | null;
};

type InboxPayload = {
  person_id: string | null;
  messages: InboxMessage[];
};

const copy = (locale: string, pt: string, en: string) =>
  locale.toLowerCase().startsWith("pt") ? pt : en;

const priorityWeight: Record<string, number> = { urgent: 0, important: 1, normal: 2 };

function priorityMeta(priority: string, locale: string) {
  if (priority === "urgent") {
    return {
      label: copy(locale, "Crítico", "Critical"),
      className: "border-destructive/35 bg-destructive/10 text-destructive",
    };
  }
  if (priority === "important") {
    return {
      label: copy(locale, "Importante", "Important"),
      className: "border-warning/35 bg-warning-soft text-warning",
    };
  }
  return {
    label: copy(locale, "Normal", "Normal"),
    className: "border-border bg-background text-muted-foreground",
  };
}

/** PX12.5-C/E — canonical W07 inbox projection with operational priority. */
export function PersonalAlerts() {
  const { tenant } = useTenant();
  const { locale } = useI18n();
  const qc = useQueryClient();
  const db = supabase as any;

  const query = useQuery({
    queryKey: ["px12.5-personal-alerts", tenant?.id],
    enabled: Boolean(tenant?.id),
    refetchInterval: 30_000,
    queryFn: async () => {
      const inbox = await db.rpc("get_my_message_inbox", { _tenant_id: tenant!.id, _limit: 50 });
      if (inbox.error) throw inbox.error;
      const payload = (inbox.data ?? { person_id: null, messages: [] }) as InboxPayload;
      const reminders = (payload.messages ?? [])
        .filter((message) => message.kind === "reminder" && !message.first_read_at)
        .sort((a, b) => {
          const priorityDelta = (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9);
          if (priorityDelta !== 0) return priorityDelta;
          return new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime();
        })
        .slice(0, 5);

      const operationIds = [...new Set(reminders.map((message) => message.operation_id).filter(Boolean))] as string[];
      const operations = operationIds.length
        ? await supabase.from("operations").select("id,name,code").in("id", operationIds)
        : { data: [], error: null };
      if (operations.error) throw operations.error;

      const operationById = new Map((operations.data ?? []).map((operation) => [operation.id, operation]));
      return { reminders, operationById };
    },
  });

  const markRead = useMutation({
    mutationFn: async (messageId: string) => {
      const result = await db.rpc("mark_message_read", { _message_id: messageId });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["px12.5-personal-alerts", tenant?.id] });
      await qc.invalidateQueries({ queryKey: ["inbox", tenant?.id] });
    },
  });

  if (query.isLoading || query.isError || !query.data?.reminders.length) return null;

  const { reminders, operationById } = query.data;

  return (
    <section className="overflow-hidden rounded-xl border border-primary/30 bg-primary-soft/20" aria-label={copy(locale, "Alertas para mim", "Alerts for me")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <BellRing className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">PX12.5 · {copy(locale, "Alertas para mim", "Alerts for me")}</p>
            <h3 className="mt-1 text-base font-semibold">{reminders.length} {copy(locale, "lembrete(s) operacional(is)", "operational reminder(s)")}</h3>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/inbox">{copy(locale, "Abrir inbox", "Open inbox")}</Link>
        </Button>
      </div>

      <div className="divide-y divide-primary/15">
        {reminders.map((message) => {
          const operation = message.operation_id ? operationById.get(message.operation_id) : undefined;
          const priority = priorityMeta(message.priority, locale);
          return (
            <article key={message.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{message.title}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${priority.className}`}>
                      {priority.label}
                    </span>
                    <span className="rounded-full border border-primary/25 bg-background px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-primary">
                      {copy(locale, "novo", "new")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{message.body}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {message.published_at ? <span className="inline-flex items-center gap-1"><Clock3 className="size-3" aria-hidden="true" />{new Date(message.published_at).toLocaleString(locale)}</span> : null}
                    {operation ? <span>{operation.name} · {operation.code}</span> : null}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {message.operation_id ? (
                  <Button asChild size="sm">
                    <Link to={`/operations/${message.operation_id}`}>
                      <ExternalLink className="mr-1 size-3.5" aria-hidden="true" />
                      {copy(locale, "Abrir operação", "Open operation")}
                    </Link>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate(message.id)}
                >
                  <Check className="mr-1 size-3.5" aria-hidden="true" />
                  {copy(locale, "Marcar como lido", "Mark as read")}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
