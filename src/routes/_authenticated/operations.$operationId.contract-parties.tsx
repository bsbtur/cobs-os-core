import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUser, ShieldAlert, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { feedback } from "@/components/feedback/feedback";
import { PanelSkeleton } from "@/components/feedback/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

export const Route = createFileRoute("/_authenticated/operations/$operationId/contract-parties")({
  component: ContractPartiesPage,
});

type DocumentType = "cpf" | "passport" | "other";

type ContractPartyRow = {
  order_id: string;
  buyer_person_id: string;
  buyer_name: string;
  order_status: string;
  reservation_status: string;
  document_type: DocumentType | null;
  document_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  district: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country_code: string | null;
  contract_party_profile_complete: boolean;
};

function ContractPartyDialog({ party, onDone }: { party: ContractPartyRow; onDone: () => void }) {
  const { locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [documentType, setDocumentType] = React.useState<DocumentType>(party.document_type ?? "cpf");
  const [documentNumber, setDocumentNumber] = React.useState(party.document_number ?? "");
  const [addressLine1, setAddressLine1] = React.useState(party.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = React.useState(party.address_line2 ?? "");
  const [district, setDistrict] = React.useState(party.district ?? "");
  const [city, setCity] = React.useState(party.city ?? "");
  const [stateRegion, setStateRegion] = React.useState(party.state_region ?? "");
  const [postalCode, setPostalCode] = React.useState(party.postal_code ?? "");
  const [countryCode, setCountryCode] = React.useState(party.country_code ?? "BR");

  React.useEffect(() => {
    if (!open) return;
    setDocumentType(party.document_type ?? "cpf");
    setDocumentNumber(party.document_number ?? "");
    setAddressLine1(party.address_line1 ?? "");
    setAddressLine2(party.address_line2 ?? "");
    setDistrict(party.district ?? "");
    setCity(party.city ?? "");
    setStateRegion(party.state_region ?? "");
    setPostalCode(party.postal_code ?? "");
    setCountryCode(party.country_code ?? "BR");
  }, [open, party]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("upsert_order_contract_party_profile", {
        _order_id: party.order_id,
        _document_type: documentType,
        _document_number: documentNumber.trim(),
        _address_line1: addressLine1.trim(),
        _address_line2: addressLine2.trim() || null,
        _district: district.trim() || null,
        _city: city.trim(),
        _state_region: stateRegion.trim(),
        _postal_code: postalCode.trim(),
        _country_code: countryCode.trim().toUpperCase(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Dados contratuais atualizados.");
      setOpen(false);
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const requiredComplete =
    documentNumber.trim().length >= 3 &&
    addressLine1.trim().length >= 3 &&
    city.trim().length >= 2 &&
    stateRegion.trim().length >= 2 &&
    postalCode.trim().length >= 3 &&
    countryCode.trim().length === 2;

  return (
    <>
      <Button size="sm" variant="outline" className="min-h-10" onClick={() => setOpen(true)}>
        <FileUser className="mr-2 size-4" aria-hidden="true" />
        Dados contratuais
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dados contratuais de {party.buyer_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/40 bg-warning-soft/30 p-3 text-sm text-muted-foreground">
              Informe somente dados reais fornecidos ou documentalmente confirmados pelo viajante. O COBS não consulta CPF, endereço ou documento em fontes externas e não preenche esses campos automaticamente.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`document-type-${party.order_id}`}>Tipo de documento</Label>
                <select
                  id={`document-type-${party.order_id}`}
                  className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value as DocumentType)}
                >
                  <option value="cpf">CPF</option>
                  <option value="passport">Passaporte</option>
                  <option value="other">Outro documento</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`document-number-${party.order_id}`}>Número do documento</Label>
                <Input
                  id={`document-number-${party.order_id}`}
                  value={documentNumber}
                  onChange={(event) => setDocumentNumber(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`address-line1-${party.order_id}`}>Endereço</Label>
                <Input
                  id={`address-line1-${party.order_id}`}
                  value={addressLine1}
                  onChange={(event) => setAddressLine1(event.target.value)}
                  autoComplete="street-address"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`address-line2-${party.order_id}`}>Complemento</Label>
                <Input
                  id={`address-line2-${party.order_id}`}
                  value={addressLine2}
                  onChange={(event) => setAddressLine2(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`district-${party.order_id}`}>Bairro</Label>
                <Input id={`district-${party.order_id}`} value={district} onChange={(event) => setDistrict(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`city-${party.order_id}`}>Cidade</Label>
                <Input id={`city-${party.order_id}`} value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`state-${party.order_id}`}>UF/Estado</Label>
                <Input id={`state-${party.order_id}`} value={stateRegion} onChange={(event) => setStateRegion(event.target.value)} autoComplete="address-level1" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`postal-${party.order_id}`}>CEP/Código postal</Label>
                <Input id={`postal-${party.order_id}`} value={postalCode} onChange={(event) => setPostalCode(event.target.value)} autoComplete="postal-code" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`country-${party.order_id}`}>País ISO-2</Label>
                <Input id={`country-${party.order_id}`} maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} autoComplete="country" />
              </div>
            </div>

            <Button className="min-h-11 w-full" disabled={save.isPending || !requiredComplete} onClick={() => save.mutate()}>
              {save.isPending ? "Salvando…" : "Salvar dados contratuais"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ContractPartiesPage() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/contract-parties" });
  const { canManage } = useTenant();
  const queryClient = useQueryClient();

  const parties = useQuery({
    queryKey: ["operation-contract-parties", operationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_operation_contract_parties", {
        _operation_id: operationId,
      });
      if (error) throw error;
      return (data ?? []) as ContractPartyRow[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["operation-contract-parties", operationId] });
    void queryClient.invalidateQueries({ queryKey: ["contract-readiness", operationId] });
  };

  if (parties.isLoading) return <PanelSkeleton />;

  return (
    <section className="space-y-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Contrato · viajante</p>
        <h1 className="mt-1 text-2xl font-semibold">Dados contratuais do viajante</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Somente pedidos com reserva ativa aparecem aqui. O cadastro é evidência para o preflight e não gera nem envia contrato.
        </p>
      </header>

      {parties.isError ? (
        <div className="surface-panel border-destructive/40 p-4 text-sm text-destructive">Não foi possível carregar os dados contratuais.</div>
      ) : (parties.data ?? []).length === 0 ? (
        <EmptyState icon={FileUser} title="Nenhum pedido contratável" body="Não há pedido com reserva ativa elegível para preparação contratual nesta operação." />
      ) : (
        <div className="space-y-3">
          {(parties.data ?? []).map((party) => (
            <article key={party.order_id} className="surface-panel p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{party.buyer_name}</h2>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${party.contract_party_profile_complete ? "border-success/40 text-success" : "border-warning/40 text-warning"}`}>
                      {party.contract_party_profile_complete ? <ShieldCheck className="size-3" aria-hidden="true" /> : <ShieldAlert className="size-3" aria-hidden="true" />}
                      {party.contract_party_profile_complete ? "Cadastro contratual completo" : "Cadastro contratual pendente"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Pedido {party.order_status} · reserva {party.reservation_status}</p>
                  {party.contract_party_profile_complete ? (
                    <p className="mt-2 text-sm text-muted-foreground">Documento e endereço estão registrados para o preflight contratual.</p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Documento e/ou endereço ainda precisam ser registrados com evidência real.</p>
                  )}
                </div>
                {canManage ? <ContractPartyDialog party={party} onDone={refresh} /> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
