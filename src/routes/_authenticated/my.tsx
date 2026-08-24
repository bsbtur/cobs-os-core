import { createFileRoute, Outlet } from "@tanstack/react-router";

/** COBS OS · W10 — Traveler Portal subtree. Participant surfaces only. */
export const Route = createFileRoute("/_authenticated/my")({
  component: () => <Outlet />,
  errorComponent: TravelerPortalError,
});

function TravelerPortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-elevated/60 p-6">
        <h1 className="text-lg font-semibold">Não foi possível abrir o portal do viajante</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O COBS encontrou um erro ao carregar esta página. Nenhum dado da operação foi alterado.
          Tente novamente; se você chegou aqui por um convite, confirme também que está usando a
          conta do viajante convidado.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-elevated"
            onClick={() => reset()}
          >
            Tentar novamente
          </button>
          <a
            href="/my"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-elevated"
          >
            Ir para o portal
          </a>
        </div>
      </div>
    </div>
  );
}
