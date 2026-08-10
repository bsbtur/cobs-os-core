import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { DISPATCH_TONE, dispatchLabel, type OperationMobility } from "@/lib/w05";
import { Button } from "@/components/ui/button";

/**
 * Read-only dispatch summary for the W04 Live page.
 * BOUNDARY: shows W05 facts, never writes them — mobility actions live on the Mobility tab.
 */
export function MobilityLiveCard({ operationId }: { operationId: string }) {
  const { t } = useI18n();

  const overview = useQuery({
    queryKey: ["mobility-live-card", operationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("w05_operation_mobility", {
        _operation_id: operationId,
      });
      if (error) throw error;
      return (data ?? null) as unknown as OperationMobility | null;
    },
  });

  const legs = overview.data?.legs ?? [];

  return (
    <section className="surface-panel p-4">
      <div className="flex items-center gap-2">
        <Bus className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("w05.title")}
        </p>
        <Button asChild size="sm" variant="ghost" className="ml-auto min-h-9">
          <Link from="/operations/$operationId" to="/operations/$operationId/mobility">
            {t("w05.tab.mobility")}
          </Link>
        </Button>
      </div>

      {legs.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("w05.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {legs.map((leg) => (
            <li key={leg.transport_leg_id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{leg.title}</span>
              <span className="text-muted-foreground">
                {leg.vehicle_label ?? "—"}
                {leg.driver_name ? ` · ${leg.driver_name}` : ""}
              </span>
              <span
                className={`ml-auto rounded px-1.5 py-0.5 text-[11px] ${
                  DISPATCH_TONE[leg.state.dispatch_state]
                }`}
              >
                {dispatchLabel(leg.state.dispatch_state, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
