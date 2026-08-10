import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass, MapPin } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useMyOperations, type PortalOperationCard } from "@/lib/w10";
import { PortalFrame } from "@/app/portal/portal-shell";
import { PortalQueryGate, PortalTag } from "@/app/portal/portal-states";
import { EmptyState } from "@/components/feedback/empty-state";

export const Route = createFileRoute("/_authenticated/my/")({
  head: () => ({
    meta: [
      { title: "My trips — COBS OS traveler portal" },
      {
        name: "description",
        content: "Every experience you have been given access to, in one participant-safe place.",
      },
      { property: "og:title", content: "My trips — COBS OS traveler portal" },
      { property: "og:description", content: "Your schedule, transport, stay and notices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyOperationsPage,
});

function place(op: PortalOperationCard) {
  return [op.city, op.region, op.country].filter(Boolean).join(" · ");
}

function OperationCard({ op }: { op: PortalOperationCard }) {
  const { t, locale } = useI18n();
  const start = op.expectedStart ?? op.plannedStart;
  const end = op.expectedEnd ?? op.plannedEnd;
  const ctx = op.timezone ? { locale, timeZone: op.timezone } : { locale };

  return (
    <Link
      to="/my/$operationId"
      params={{ operationId: op.operationId }}
      className="block rounded-xl border border-border bg-elevated/60 p-4 transition-colors hover:border-border-strong"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <h2 className="min-w-0 break-words text-base font-semibold text-foreground">{op.name}</h2>
        {op.historical ? <PortalTag>{t("w10.home.historical")}</PortalTag> : null}
      </div>
      {place(op) ? (
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{place(op)}</span>
        </p>
      ) : null}
      {start ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {formatDate(start, ctx)}
          {end ? ` – ${formatDate(end, ctx)}` : ""}
        </p>
      ) : null}
    </Link>
  );
}

function MyOperationsPage() {
  const { t } = useI18n();
  const operations = useMyOperations();

  return (
    <PortalFrame title={t("w10.list.title")}>
      <p className="mb-4 text-sm text-muted-foreground">{t("w10.list.subtitle")}</p>
      <PortalQueryGate
        isLoading={operations.isLoading}
        error={operations.error}
        onRetry={() => void operations.refetch()}
      >
        {(operations.data ?? []).length === 0 ? (
          <EmptyState
            icon={Compass}
            title={t("w10.list.empty.title")}
            body={t("w10.list.empty.body")}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {(operations.data ?? []).map((op) => (
              <OperationCard key={op.operationId} op={op} />
            ))}
          </div>
        )}
      </PortalQueryGate>
    </PortalFrame>
  );
}
