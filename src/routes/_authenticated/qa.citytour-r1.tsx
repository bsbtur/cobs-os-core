import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CircleDashed, ExternalLink, ShieldCheck, Users } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";

const OPERATION_CODE = "CITYTO-QA-CLEAN-20260828-01";
const FIXTURE_KEY = "citytour-r1-contract-gates-v1";

export const Route = createFileRoute("/_authenticated/qa/citytour-r1")({
  head: () => ({
    meta: [
      { title: "City Tour R$ 1 — QA Gate Dashboard | COBS OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CityTourQaDashboard,
});

type Slot = {
  orderId: string;
  traveler: string;
  orderStatus: string;
  paid: boolean;
  receivedMinor: number;
  participationConfirmed: boolean;
  invitationIssued: boolean;
  invitationAccepted: boolean;
  grantActive: boolean;
  membershipCount: number | null;
};

function Gate({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      {ok ? (
        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function CityTourQaDashboard() {
  const { tenant, canManage, role } = useTenant();
  const canOperate = canManage || role === "operations_agent";

  const state = useQuery({
    queryKey: ["citytour-r1-qa-gates", tenant?.id],
    enabled: Boolean(tenant?.id) && canOperate,
    queryFn: async () => {
      const { data: operation, error: operationError } = await supabase
        .from("operations")
        .select("id,name,code,status")
        .eq("tenant_id", tenant!.id)
        .eq("code", OPERATION_CODE)
        .maybeSingle();
      if (operationError) throw operationError;
      if (!operation) return { operation: null, slots: [] as Slot[] };

      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id,status,buyer_person_id,buyer_name_snapshot,grand_total_minor,created_at,metadata")
        .eq("tenant_id", tenant!.id)
        .eq("operation_id", operation.id)
        .eq("metadata->>qa_fixture_key", FIXTURE_KEY)
        .order("created_at", { ascending: true });
      if (ordersError) throw ordersError;

      const orderIds = (orders ?? []).map((order) => order.id);
      const personIds = (orders ?? [])
        .map((order) => order.buyer_person_id)
        .filter((id): id is string => Boolean(id));

      const charges = orderIds.length
        ? await supabase
            .from("payment_charges")
            .select("order_id,status,amount_minor,metadata")
            .eq("tenant_id", tenant!.id)
            .in("order_id", orderIds)
        : { data: [], error: null };
      if (charges.error) throw charges.error;

      const facts = orderIds.length
        ? await supabase
            .from("financial_facts")
            .select("order_id,fact_type,amount_minor")
            .eq("tenant_id", tenant!.id)
            .in("order_id", orderIds)
        : { data: [], error: null };
      if (facts.error) throw facts.error;

      const participations = personIds.length
        ? await supabase
            .from("operation_participations")
            .select("person_id,status")
            .eq("tenant_id", tenant!.id)
            .eq("operation_id", operation.id)
            .eq("participation_kind", "participant")
            .in("person_id", personIds)
        : { data: [], error: null };
      if (participations.error) throw participations.error;

      const invitations = personIds.length
        ? await supabase
            .from("participant_access_invitations")
            .select("person_id,accepted_at,revoked_at,expires_at")
            .eq("tenant_id", tenant!.id)
            .eq("operation_id", operation.id)
            .in("person_id", personIds)
        : { data: [], error: null };
      if (invitations.error) throw invitations.error;

      const grants = personIds.length
        ? await supabase
            .from("participant_access_grants")
            .select("person_id,profile_id,status")
            .eq("tenant_id", tenant!.id)
            .eq("operation_id", operation.id)
            .in("person_id", personIds)
        : { data: [], error: null };
      if (grants.error) throw grants.error;

      const profileIds = (grants.data ?? [])
        .filter((grant) => grant.status === "active")
        .map((grant) => grant.profile_id)
        .filter((id): id is string => Boolean(id));

      const memberships = profileIds.length
        ? await supabase
            .from("memberships")
            .select("profile_id,status")
            .in("profile_id", profileIds)
            .eq("status", "active")
        : { data: [], error: null };
      if (memberships.error) throw memberships.error;

      const slots: Slot[] = (orders ?? []).slice(0, 2).map((order) => {
        const fixtureCharges = (charges.data ?? []).filter(
          (charge) =>
            charge.order_id === order.id &&
            (charge.metadata as Record<string, unknown> | null)?.environment === "test" &&
            (charge.metadata as Record<string, unknown> | null)?.qa_fixture_key === FIXTURE_KEY,
        );
        const receivedMinor = (facts.data ?? [])
          .filter((fact) => fact.order_id === order.id)
          .reduce((sum, fact) => {
            const amount = Number(fact.amount_minor ?? 0);
            if (fact.fact_type === "PAYMENT_RECORDED") return sum + amount;
            if (fact.fact_type === "PAYMENT_REVERSED" || fact.fact_type === "REFUND_RECORDED") {
              return sum - amount;
            }
            return sum;
          }, 0);
        const participation = (participations.data ?? []).find(
          (item) => item.person_id === order.buyer_person_id,
        );
        const invitation = (invitations.data ?? [])
          .filter((item) => item.person_id === order.buyer_person_id && !item.revoked_at)
          .sort((a, b) => String(b.expires_at).localeCompare(String(a.expires_at)))[0];
        const grant = (grants.data ?? []).find(
          (item) => item.person_id === order.buyer_person_id && item.status === "active",
        );
        const membershipCount = grant?.profile_id
          ? (memberships.data ?? []).filter((item) => item.profile_id === grant.profile_id).length
          : null;

        return {
          orderId: order.id,
          traveler: order.buyer_name_snapshot || "Viajante QA",
          orderStatus: order.status,
          paid:
            receivedMinor >= Number(order.grand_total_minor ?? 100) ||
            fixtureCharges.some((charge) => charge.status === "paid"),
          receivedMinor: Math.max(receivedMinor, 0),
          participationConfirmed: participation?.status === "confirmed",
          invitationIssued: Boolean(invitation),
          invitationAccepted: Boolean(invitation?.accepted_at),
          grantActive: Boolean(grant),
          membershipCount,
        };
      });

      return { operation, slots };
    },
  });

  if (!canOperate) {
    return (
      <AppShell activeId="operations" title="Validação QA">
        <EmptyState
          icon={ShieldCheck}
          title="Acesso operacional necessário"
          body="Este painel é somente para owner, admin ou operations_agent."
        />
      </AppShell>
    );
  }

  return (
    <AppShell activeId="operations" title="City Tour R$ 1 — Validação QA">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <RequireTenant>
          {state.isLoading ? <PanelSkeleton rows={4} /> : null}
          {state.isError ? (
            <EmptyState
              icon={ShieldCheck}
              title="Não foi possível carregar os gates"
              body="Nenhuma mutação foi executada. Tente novamente a leitura do STAGING."
              action={
                <Button variant="outline" onClick={() => void state.refetch()}>
                  Recarregar
                </Button>
              }
            />
          ) : null}
          {state.data && !state.data.operation ? (
            <EmptyState
              icon={ShieldCheck}
              title="Operação QA não encontrada neste tenant"
              body={`Esperado: ${OPERATION_CODE}`}
            />
          ) : null}
          {state.data?.operation ? (
            <>
              <section className="surface-panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                      Golden Path · TEST · R$ 1,00
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold">{state.data.operation.name}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {state.data.slots.length}/2 slots usados · operação {state.data.operation.status}
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link to="/city-tour-validacao">
                      Abrir página de vendas <ExternalLink className="ml-2 size-4" />
                    </Link>
                  </Button>
                </div>
              </section>

              {state.data.slots.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Aguardando o primeiro viajante real de QA"
                  body="A página de vendas está pronta. Nenhum pedido, Pix ou identidade será fabricado por este painel."
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {state.data.slots.map((slot, index) => (
                    <section key={slot.orderId} className="surface-panel p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            Viajante {index + 1}
                          </p>
                          <h2 className="mt-1 text-lg font-semibold">{slot.traveler}</h2>
                          <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                            {slot.orderId}
                          </p>
                        </div>
                        <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                          {slot.orderStatus}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-2">
                        <Gate ok label="Pedido TEST" detail="Pedido do fixture R$ 1 criado." />
                        <Gate
                          ok={slot.paid}
                          label="Pagamento TEST"
                          detail={`Recebido: R$ ${(slot.receivedMinor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                        />
                        <Gate
                          ok={slot.participationConfirmed}
                          label="Participação"
                          detail="Participação precisa estar confirmada antes do acesso ao portal."
                        />
                        <Gate
                          ok={slot.invitationIssued}
                          label="Convite do viajante"
                          detail="Emitido pelo fluxo canônico em Pessoas; nunca pela página pública."
                        />
                        <Gate
                          ok={slot.invitationAccepted && slot.grantActive}
                          label="Grant do portal"
                          detail="Claim precisa resultar em participant_access_grant ativo."
                        />
                        <Gate
                          ok={slot.grantActive && slot.membershipCount === 0}
                          label="Viajante puro"
                          detail={
                            slot.membershipCount === null
                              ? "Aguardando claim."
                              : `${slot.membershipCount} membership(s) ativa(s); o alvo de QA é 0.`
                          }
                        />
                      </div>
                    </section>
                  ))}
                </div>
              )}

              <section className="surface-panel p-5">
                <h2 className="font-semibold">Próximas ações controladas</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  O painel somente observa. Convite continua sendo uma ação explícita do operador e contrato continua sujeito aos gates jurídicos.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link
                      to="/operations/$operationId/people"
                      params={{ operationId: state.data.operation.id }}
                    >
                      Pessoas e acesso
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link
                      to="/operations/$operationId/contract-readiness"
                      params={{ operationId: state.data.operation.id }}
                    >
                      Prontidão contratual
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link
                      to="/operations/$operationId/contracts"
                      params={{ operationId: state.data.operation.id }}
                    >
                      Contratos
                    </Link>
                  </Button>
                </div>
              </section>
            </>
          ) : null}
        </RequireTenant>
      </div>
    </AppShell>
  );
}
