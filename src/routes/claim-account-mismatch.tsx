import { createFileRoute } from "@tanstack/react-router";
import { LogOut, ShieldAlert } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { readPendingClaim } from "@/lib/claim-intent";

export const Route = createFileRoute("/claim-account-mismatch")({
  head: () => ({
    meta: [
      { title: "Use the invited account — COBS OS" },
      {
        name: "description",
        content: "This invitation belongs to another COBS OS account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClaimAccountMismatchPage,
});

function ClaimAccountMismatchPage() {
  const { session, loading, signOut } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const hasPendingClaim = readPendingClaim() !== null;

  const leaveAndSignIn = async () => {
    setBusy(true);
    try {
      await signOut();
    } finally {
      // signOut already replaces the location with /auth. This fallback makes
      // the recovery route robust if browser/session cleanup ever changes.
      window.location.replace("/auth?redirect=/my");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <main className="mx-auto max-w-lg rounded-xl border border-border bg-elevated/60 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Este convite pertence a outra conta</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              O convite continua válido e não foi consumido. Para proteger o acesso do viajante, o
              COBS não permite aceitar este convite usando uma conta diferente da conta já vinculada
              à pessoa convidada.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-border bg-background/60 p-4 text-sm">
          <p className="font-medium">O que fazer agora</p>
          <p className="mt-1 text-muted-foreground">
            Saia desta sessão e entre com a conta do viajante convidado. O COBS preservou o convite
            neste navegador e tentará retomá-lo automaticamente após o login correto.
          </p>
          {!loading && session?.user?.email ? (
            <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
              Sessão atual: {session.user.email}
            </p>
          ) : null}
          {!hasPendingClaim ? (
            <p className="mt-3 text-sm text-destructive">
              O convite não está mais disponível neste navegador. Abra novamente o link original do
              convite antes de entrar com a conta correta.
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          className="mt-5 min-h-11 w-full"
          disabled={busy || loading}
          onClick={() => void leaveAndSignIn()}
        >
          <LogOut className="mr-2 size-4" aria-hidden="true" />
          {busy ? "Saindo…" : "Sair e entrar com a conta do viajante"}
        </Button>
      </main>
    </div>
  );
}
