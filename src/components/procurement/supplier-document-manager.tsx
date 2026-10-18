import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedback } from "@/components/feedback/feedback";
import { supabase } from "@/integrations/supabase/client";
import {
  ENABLE_SUPPLIER_DOCUMENT_MANAGER,
  SUPPLIER_DOCUMENT_STATUSES,
  SUPPLIER_DOCUMENT_TYPES,
  supplierDocumentsState,
  type SupplierDocument,
} from "@/lib/supplier-document-manager";

type DocumentRpc = (name: string, args: Record<string, string | null>) =>
  PromiseLike<{ error: { message: string } | null }>;

export function SupplierDocumentManager({
  tenantId,
  operationId,
  quotes,
  canManage,
}: {
  tenantId: string;
  operationId: string;
  quotes: Array<{ id: string; supplier_name: string }>;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [quoteId, setQuoteId] = React.useState("");
  const [documentType, setDocumentType] = React.useState<string>("contract");
  const [title, setTitle] = React.useState("");
  const [referenceUrl, setReferenceUrl] = React.useState("");
  const documents = useQuery({
    queryKey: ["supplier-documents", tenantId, operationId],
    enabled: ENABLE_SUPPLIER_DOCUMENT_MANAGER && Boolean(tenantId && operationId),
    queryFn: async () => {
      // Read only from the signed-in tenant/operation; RLS remains the authority.
      const { data, error } = await supabase
        .from("supplier_documents" as never)
        .select("id,tenant_id,operation_id,quote_id,document_type,title,status,reference_url,issued_at,expires_at")
        .eq("tenant_id", tenantId)
        .eq("operation_id", operationId);
      if (error) throw error;
      return (data ?? []) as SupplierDocument[];
    },
    retry: false,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["supplier-documents", tenantId, operationId] });
    void queryClient.invalidateQueries({ queryKey: ["operation-production-pipeline", operationId] });
  };
  const create = useMutation({
    mutationFn: async () => {
      if (!ENABLE_SUPPLIER_DOCUMENT_MANAGER || !canManage) throw new Error("Documentos desativados.");
      if (!quotes.some((quote) => quote.id === quoteId)) throw new Error("Selecione uma cotação desta operação.");
      if (!title.trim() || title.trim().length < 2) throw new Error("Informe o título.");
      const rpc = supabase.rpc as unknown as DocumentRpc;
      const { error } = await rpc("add_supplier_document", {
        _quote_id: quoteId,
        _document_type: documentType,
        _title: title.trim(),
        _reference_url: referenceUrl.trim() || null,
        _issued_at: null,
        _expires_at: null,
        _notes: null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setTitle(""); setReferenceUrl("");
      feedback.success("Documento registrado."); refresh();
    },
    onError: (error) => feedback.error(error instanceof Error ? error.message : "Falha ao registrar."),
  });
  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!ENABLE_SUPPLIER_DOCUMENT_MANAGER || !canManage) throw new Error("Documentos desativados.");
      if (!documents.data?.some((doc) => doc.id === id)) throw new Error("Documento fora desta operação.");
      const rpc = supabase.rpc as unknown as DocumentRpc;
      const { error } = await rpc("set_supplier_document_status", { _document_id: id, _status: status });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { feedback.success("Status atualizado."); refresh(); },
    onError: (error) => feedback.error(error instanceof Error ? error.message : "Falha ao atualizar."),
  });

  if (!ENABLE_SUPPLIER_DOCUMENT_MANAGER) return null;
  const state = supplierDocumentsState(documents.isPending, documents.isError, documents.data);
  return (
    <section className="surface-panel space-y-4 p-5" aria-label="Documentação de fornecedores">
      <div>
        <h2 className="text-lg font-semibold">Documentação dos fornecedores</h2>
        <p className="text-xs text-muted-foreground">Documentos vinculados à operação. A autorização final é validada no servidor.</p>
      </div>
      {state === "loading" ? <p role="status">Carregando documentos…</p> : null}
      {state === "error" ? <p role="alert">Não foi possível consultar os documentos. Verifique as permissões.</p> : null}
      {state === "empty" ? <p>Nenhum documento registrado nesta operação.</p> : null}
      {state === "ready" ? (
        <ul className="space-y-2">
          {documents.data?.map((doc) => (
            <li key={doc.id} className="rounded-lg border border-border p-3">
              <p className="font-medium">{doc.title}</p>
              <p className="text-xs text-muted-foreground">{doc.document_type} · {doc.status}</p>
              {canManage ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {SUPPLIER_DOCUMENT_STATUSES.filter((status) => status !== doc.status).map((status) => (
                    <Button key={status} type="button" size="sm" variant="outline"
                      disabled={update.isPending} onClick={() => update.mutate({ id: doc.id, status })}>
                      {status}
                    </Button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canManage ? (
        <form className="space-y-3 rounded-lg border border-border p-3" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <h3 className="font-medium">Registrar documento</h3>
          <div>
            <Label htmlFor="supplier-document-quote">Cotação</Label>
            <select id="supplier-document-quote" className="w-full rounded-md border border-border bg-background p-2" value={quoteId}
              onChange={(event) => setQuoteId(event.target.value)} required>
              <option value="">Selecione uma cotação</option>
              {quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.supplier_name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="supplier-document-type">Tipo</Label>
            <select id="supplier-document-type" className="w-full rounded-md border border-border bg-background p-2"
              value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
              {SUPPLIER_DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div><Label htmlFor="supplier-document-title">Título</Label><Input id="supplier-document-title" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2}/></div>
          <div><Label htmlFor="supplier-document-url">Referência / URL opcional</Label><Input id="supplier-document-url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} /></div>
          <Button type="submit" disabled={create.isPending || !quotes.length}>Registrar documento</Button>
        </form>
      ) : null}
    </section>
  );
}
