import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";

export const CITYTOUR_QA_OPERATION_CODE = "CITYTO-QA-CLEAN-20260828-01";

export function CityTourR1QaEntry() {
  const { tenant, canManage } = useTenant();
  const tenantId = tenant?.id;

  const qaOperation = useQuery({
    queryKey: ["citytour-r1-admin-entrypoint", tenantId],
    enabled: Boolean(tenantId) && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("id,name,status")
        .eq("tenant_id", tenantId!)
        .eq("code", CITYTOUR_QA_OPERATION_CODE)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!canManage || qaOperation.isLoading || qaOperation.isError || !qaOperation.data) return null;

  return (
    <section className="surface-panel border-primary/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-primary/30 bg-primary-soft p-2 text-primary">
            <FlaskConical className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              QA · TEST · R$ 1,00
            </p>
            <h3 className="mt-1 text-sm font-semibold">City Tour — Golden Path</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Acompanhe os dois slots de validação: pedido, pagamento, participação, convite, grant e viajante puro.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/qa/citytour-r1">
            <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
            Abrir validação QA
          </Link>
        </Button>
      </div>
    </section>
  );
}
