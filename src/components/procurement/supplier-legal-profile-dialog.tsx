import * as React from "react";
import { Building2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export type SupplierLegalProfile = {
  supplier_id: string;
  supplier_name: string;
  supplier_legal_name: string | null;
  supplier_document_number: string | null;
  supplier_address_line1: string | null;
  supplier_address_line2: string | null;
  supplier_district: string | null;
  supplier_city: string | null;
  supplier_state_region: string | null;
  supplier_postal_code: string | null;
  supplier_country_code: string | null;
  supplier_legal_evidence_complete: boolean;
};

export function SupplierLegalProfileDialog({
  supplier,
  onDone,
}: {
  supplier: SupplierLegalProfile;
  onDone: () => void;
}) {
  const { locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [legalName, setLegalName] = React.useState(supplier.supplier_legal_name ?? "");
  const [documentNumber, setDocumentNumber] = React.useState(
    supplier.supplier_document_number ?? "",
  );
  const [addressLine1, setAddressLine1] = React.useState(supplier.supplier_address_line1 ?? "");
  const [addressLine2, setAddressLine2] = React.useState(supplier.supplier_address_line2 ?? "");
  const [district, setDistrict] = React.useState(supplier.supplier_district ?? "");
  const [city, setCity] = React.useState(supplier.supplier_city ?? "");
  const [stateRegion, setStateRegion] = React.useState(supplier.supplier_state_region ?? "");
  const [postalCode, setPostalCode] = React.useState(supplier.supplier_postal_code ?? "");
  const [countryCode, setCountryCode] = React.useState(supplier.supplier_country_code ?? "BR");

  React.useEffect(() => {
    if (!open) return;
    setLegalName(supplier.supplier_legal_name ?? "");
    setDocumentNumber(supplier.supplier_document_number ?? "");
    setAddressLine1(supplier.supplier_address_line1 ?? "");
    setAddressLine2(supplier.supplier_address_line2 ?? "");
    setDistrict(supplier.supplier_district ?? "");
    setCity(supplier.supplier_city ?? "");
    setStateRegion(supplier.supplier_state_region ?? "");
    setPostalCode(supplier.supplier_postal_code ?? "");
    setCountryCode(supplier.supplier_country_code ?? "BR");
  }, [open, supplier]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("update_supplier_contract_legal_profile", {
        _supplier_id: supplier.supplier_id,
        _legal_name: legalName.trim(),
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
      feedback.success("Cadastro jurídico do fornecedor atualizado.");
      setOpen(false);
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const complete =
    legalName.trim() &&
    documentNumber.trim() &&
    addressLine1.trim() &&
    city.trim() &&
    stateRegion.trim() &&
    postalCode.trim() &&
    countryCode.trim().length === 2;

  return (
    <>
      <Button variant="outline" size="sm" className="min-h-10" onClick={() => setOpen(true)}>
        <Building2 className="mr-2 size-4" aria-hidden="true" />
        Cadastro jurídico
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cadastro jurídico · {supplier.supplier_name}</DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-elevated/40 p-3 text-sm text-muted-foreground">
            Informe somente dados reais do fornecedor. Estes campos poderão compor a evidência congelada do contrato do viajante; o COBS não consulta nem completa dados jurídicos automaticamente.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`supplier-legal-name-${supplier.supplier_id}`}>Razão social / nome legal</Label>
              <Input id={`supplier-legal-name-${supplier.supplier_id}`} value={legalName} onChange={(event) => setLegalName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`supplier-document-${supplier.supplier_id}`}>CNPJ / documento legal</Label>
              <Input id={`supplier-document-${supplier.supplier_id}`} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`supplier-country-${supplier.supplier_id}`}>País (ISO-2)</Label>
              <Input id={`supplier-country-${supplier.supplier_id}`} maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} placeholder="BR" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`supplier-address1-${supplier.supplier_id}`}>Endereço comercial</Label>
              <Input id={`supplier-address1-${supplier.supplier_id}`} value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`supplier-address2-${supplier.supplier_id}`}>Complemento</Label>
              <Input id={`supplier-address2-${supplier.supplier_id}`} value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`supplier-district-${supplier.supplier_id}`}>Bairro</Label>
              <Input id={`supplier-district-${supplier.supplier_id}`} value={district} onChange={(event) => setDistrict(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`supplier-city-${supplier.supplier_id}`}>Cidade</Label>
              <Input id={`supplier-city-${supplier.supplier_id}`} value={city} onChange={(event) => setCity(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`supplier-state-${supplier.supplier_id}`}>UF / estado</Label>
              <Input id={`supplier-state-${supplier.supplier_id}`} value={stateRegion} onChange={(event) => setStateRegion(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`supplier-postal-${supplier.supplier_id}`}>CEP / código postal</Label>
              <Input id={`supplier-postal-${supplier.supplier_id}`} value={postalCode} onChange={(event) => setPostalCode(event.target.value)} />
            </div>
          </div>

          <Button className="min-h-11 w-full" disabled={save.isPending || !complete} onClick={() => save.mutate()}>
            Salvar cadastro jurídico
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
