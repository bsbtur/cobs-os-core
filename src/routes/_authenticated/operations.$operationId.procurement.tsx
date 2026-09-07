import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileCheck2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { feedback } from "@/components/feedback/feedback";
import { PanelSkeleton } from "@/components/feedback/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";

export const Route = createFileRoute("/_authenticated/operations/$operationId/procurement")({
  component: ProcurementPage,
});

type QuoteRow = {
  id: string;
  supplier_id: string;
  category: string;
  description: string;
  amount_minor: number;
  currency_code: string;
  status: string;
  valid_until: string | null;
  contract_reference: string | null;
  suppliers: { name: string } | null;
};

function money(amountMinor: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amountMinor / 100);
}

function parseBrlMinor(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    quoted: "Cotada",
    shortlisted: "Pré-selecionada",
    selected: "Selecionada",
    rejected: "Rejeitada",
    expired: "Expirada",
    contracted: "Contratada",
  };
  return labels[status] ?? status;
}

function CreateQuoteDialog({ operationId, onDone }: { operationId: string; onDone: () => void }) {
  const { locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [supplierName, setSupplierName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [validUntil, setValidUntil] = React.useState("");
  const [cancellationTerms, setCancellationTerms] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const amountMinor = parseBrlMinor(amount);
      if (!amountMinor) throw new Error("amount_must_be_positive");
      const { error } = await supabase.rpc("create_operation_quote", {
        _operation_id: operationId,
        _supplier_name: supplierName.trim(),
        _category: category.trim(),
        _description: description.trim(),
        _amount_minor: amountMinor,
        _valid_until: validUntil || null,
        _cancellation_terms: cancellationTerms.trim() || null,
        _notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Cotação cadastrada.");
      setOpen(false);
      setSupplierName("");
      setCategory("");
      setDescription("");
      setAmount("");
      setValidUntil("");
      setCancellationTerms("");
      setNotes("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const disabled =
    create.isPending ||
    !supplierName.trim() ||
    !category.trim() ||
    !description.trim() ||
    !parseBrlMinor(amount);

  return (
    <>
      <Button className="min-h-11" onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" aria-hidden="true" />
        Nova cotação
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova cotação de fornecedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-name">Fornecedor</Label>
              <Input id="supplier-name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-category">Categoria</Label>
              <Input id="supplier-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="hotel, transporte, alimentação..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-description">Serviço</Label>
              <Textarea id="supplier-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="supplier-amount">Valor (R$)</Label>
                <Input id="supplier-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-valid">Validade</Label>
                <Input id="supplier-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-cancel">Condições de cancelamento</Label>
              <Textarea id="supplier-cancel" value={cancellationTerms} onChange={(e) => setCancellationTerms(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-notes">Observações</Label>
              <Textarea id="supplier-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="min-h-11 w-full" disabled={disabled} onClick={() => create.mutate()}>
              Salvar cotação
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ContractQuoteDialog({ quote, onDone }: { quote: QuoteRow; onDone: () => void }) {
  const { locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const contract = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("contract_operation_quote", {
        _quote_id: quote.id,
        _contract_reference: reference.trim(),
        _contract_notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Fornecedor formalizado como contratado.");
      setOpen(false);
      setReference("");
      setNotes("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <>
      <Button size="sm" className="min-h-10" onClick={() => setOpen(true)}>
        <FileCheck2 className="mr-2 size-4" aria-hidden="true" />
        Formalizar contratação
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Formalizar contratação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-warning/40 bg-warning-soft/30 p-3 text-sm text-muted-foreground">
              O COBS só aceitará esta contratação se o fornecedor possuir identificação legal e endereço comercial completos. Nenhum dado jurídico será preenchido automaticamente.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`contract-reference-${quote.id}`}>Referência do contrato</Label>
              <Input id={`contract-reference-${quote.id}`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="número, proposta aceita ou referência documental" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`contract-notes-${quote.id}`}>Observações</Label>
              <Textarea id={`contract-notes-${quote.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="min-h-11 w-full" disabled={contract.isPending || !reference.trim()} onClick={() => contract.mutate()}>
              Confirmar contratação
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProcurementPage() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/procurement" });
  const { canManage } = useTenant();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const quotes = useQuery({
    queryKey: ["operation-procurement", operationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operation_quotes")
        .select("id,supplier_id,category,description,amount_minor,currency_code,status,valid_until,contract_reference,suppliers(name)")
        .eq("operation_id", operationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuoteRow[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["operation-procurement", operationId] });

  const selectQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase.rpc("select_operation_quote", { _quote_id: quoteId });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Cotação selecionada.");
      refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (quotes.isLoading) return <PanelSkeleton />;

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Compras da operação</p>
          <h1 className="mt-1 text-2xl font-semibold">Fornecedores e cotações</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Registre propostas, escolha a cotação vencedora e formalize somente quando houver evidência contratual real.
          </p>
        </div>
        {canManage ? <CreateQuoteDialog operationId={operationId} onDone={refresh} /> : null}
      </header>

      {quotes.isError ? (
        <div className="surface-panel border-destructive/40 p-4 text-sm text-destructive">Não foi possível carregar as cotações.</div>
      ) : (quotes.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma cotação registrada" description="Cadastre uma proposta real de fornecedor para iniciar o comparativo da operação." />
      ) : (
        <div className="space-y-3">
          {(quotes.data ?? []).map((quote) => (
            <article key={quote.id} className="surface-panel p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{quote.suppliers?.name ?? "Fornecedor"}</h2>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{statusLabel(quote.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{quote.category} · {quote.description}</p>
                  <p className="mt-2 text-lg font-semibold tabular-nums">{money(quote.amount_minor, quote.currency_code)}</p>
                  {quote.valid_until ? <p className="mt-1 text-xs text-muted-foreground">Validade: {quote.valid_until}</p> : null}
                  {quote.contract_reference ? <p className="mt-1 text-xs text-muted-foreground">Contrato: {quote.contract_reference}</p> : null}
                </div>

                {canManage ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {["quoted", "shortlisted"].includes(quote.status) ? (
                      <Button variant="outline" size="sm" className="min-h-10" disabled={selectQuote.isPending} onClick={() => selectQuote.mutate(quote.id)}>
                        <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
                        Selecionar
                      </Button>
                    ) : null}
                    {quote.status === "selected" ? <ContractQuoteDialog quote={quote} onDone={refresh} /> : null}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
