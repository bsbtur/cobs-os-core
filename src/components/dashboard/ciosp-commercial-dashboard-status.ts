const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  submitted: "Enviado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
};

export function formatOrderStatus(status: string, awaitingPix: boolean) {
  if (awaitingPix) return "Aguardando Pix";
  return ORDER_STATUS_LABELS[status] ?? status;
}
