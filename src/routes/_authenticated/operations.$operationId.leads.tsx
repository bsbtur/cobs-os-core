import { createFileRoute } from "@tanstack/react-router";
import { OperationLeadsBoard } from "@/components/commercial/operation-leads-board";

export const Route = createFileRoute("/_authenticated/operations/$operationId/leads")({
  head: () => ({
    meta: [
      { title: "Leads comerciais da operação — COBS OS" },
      {
        name: "description",
        content: "Fila comercial por operação: etapas do funil e responsáveis no COBS OS.",
      },
      { property: "og:title", content: "Leads comerciais da operação — COBS OS" },
      {
        property: "og:description",
        content: "Gestão contextual de leads e responsáveis por operação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OperationLeadsPage,
});

function OperationLeadsPage() {
  const { operationId } = Route.useParams();
  return <OperationLeadsBoard key={operationId} operationId={operationId} />;
}