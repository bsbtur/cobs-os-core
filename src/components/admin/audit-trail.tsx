import { History } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { useI18n } from "@/lib/i18n";

export type AdminAuditEvent = {
  id: string;
  action: string;
  actor_profile_id: string | null;
  correlation_id: string | null;
  occurred_at: string;
  subject_id: string | null;
  subject_type: string | null;
};

function shortId(value: string | null | undefined) {
  if (!value) return null;
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export function AdminAuditTrail({
  events,
  loading = false,
  error = false,
}: {
  events: AdminAuditEvent[];
  loading?: boolean;
  error?: boolean;
}) {
  const { t, locale } = useI18n();

  return (
    <section className="surface-panel p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <History className="size-4 text-primary" aria-hidden="true" />
        {t("settings.audit")}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{t("settings.auditHint")}</p>
      <div className="mt-4">
        {loading ? (
          <PanelSkeleton rows={3} />
        ) : error ? (
          <EmptyState icon={History} title={t("state.error.title")} body={t("state.error.body")} />
        ) : events.length === 0 ? (
          <EmptyState icon={History} title={t("settings.auditEmpty")} />
        ) : (
          <ul className="divide-y divide-border/70">
            {events.map((event) => {
              const subjectId = shortId(event.subject_id);
              const actorId = shortId(event.actor_profile_id);
              const correlationId = shortId(event.correlation_id);

              return (
                <li key={event.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(event.occurred_at))}
                    </span>
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
                      {event.action}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {event.subject_type ?? "—"}
                    </span>
                  </div>
                  {subjectId || actorId || correlationId ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
                      {subjectId ? <span title={event.subject_id ?? undefined}>subject_id · {subjectId}</span> : null}
                      {actorId ? (
                        <span title={event.actor_profile_id ?? undefined}>actor_profile_id · {actorId}</span>
                      ) : null}
                      {correlationId ? (
                        <span title={event.correlation_id ?? undefined}>correlation_id · {correlationId}</span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
