import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BedDouble } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { STAY_STATUS_TONE, type OperationHospitality } from "@/lib/w06";
import { Button } from "@/components/ui/button";

/**
 * Read-only hospitality summary for the W04 Live page.
 * BOUNDARY: shows W06 facts, never writes them — and never touches Journey,
 * Presence or Mobility. Hospitality actions live on the Hospitality tab.
 */
export function HospitalityLiveCard({ operationId }: { operationId: string }) {
  const { t } = useI18n();

  const overview = useQuery({
    queryKey: ["hospitality-live-card", operationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("w06_operation_hospitality", {
        _operation_id: operationId,
      });
      if (error) throw error;
      return (data ?? null) as unknown as OperationHospitality | null;
    },
  });

  const stays = overview.data?.stays ?? [];
  /* The card only exists when the operation actually has hospitality context. */
  if (stays.length === 0) return null;

  return (
    <section className="surface-panel p-4">
      <div className="flex items-center gap-2">
        <BedDouble className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("w06.live.title")}
        </p>
        <Button asChild size="sm" variant="ghost" className="ml-auto min-h-9">
          <Link from="/operations/$operationId" to="/operations/$operationId/hospitality">
            {t("w06.live.open")}
          </Link>
        </Button>
      </div>

      <ul className="mt-3 space-y-2">
        {stays.map((stay) => (
          <li key={stay.stay_id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{stay.property_name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${STAY_STATUS_TONE[stay.status]}`}>
              {t(`w06.status.${stay.status}`)}
            </span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              {stay.with_room}/{stay.guests} {t("w06.live.allocated")} · {stay.checked_in}{" "}
              {t("w06.live.checkins")} · {Math.max(0, stay.guests - stay.with_room)}{" "}
              {t("w06.live.withoutRoom")}
              {stay.issues > 0 ? ` · ${stay.issues} ${t("w06.live.issues")}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
