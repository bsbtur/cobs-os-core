import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/**
 * COBS OS · W01 — session context.
 *
 * PERSON != PROFILE != AUTH USER.
 * This context only knows about the AUTH USER and its PROFILE mirror.
 * Tenant membership and Person identity are resolved separately.
 */

export type AuthState = {
  session: Session | null;
  user: User | null;
  /** true until the first session resolution completes */
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    let active = true;

    const displayNameOf = (s: Session | null) => {
      const raw = (s?.user?.user_metadata as { display_name?: unknown } | undefined)?.display_name;
      const clean = typeof raw === "string" ? raw.trim() : "";
      return clean.length > 0 && clean.length <= 120 ? clean : undefined;
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        // Profile is created lazily and idempotently, never by a client INSERT.
        // The signup display name is carried through so the Person created by
        // bootstrap_tenant is named, not email-derived.
        const n = displayNameOf(nextSession);
        void supabase.rpc("ensure_profile", n ? { _display_name: n } : {});
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      if (data.session) {
        const n = displayNameOf(data.session);
        void supabase.rpc("ensure_profile", n ? { _display_name: n } : {});
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = React.useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    window.location.replace("/auth");
  }, [queryClient]);

  const value = React.useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading, signOut }),
    [session, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Humanized, non-leaking mapping of auth/database errors. */
export function humanizeError(error: unknown, locale: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const pt = locale.startsWith("pt");
  const map: Array<[RegExp, string, string]> = [
    [/invalid login credentials/i, "E-mail ou senha incorretos.", "Incorrect email or password."],
    [
      /email not confirmed/i,
      "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
      "Confirm your email before signing in. Check your inbox.",
    ],
    [
      /user already registered/i,
      "Já existe uma conta com este e-mail.",
      "An account with this email already exists.",
    ],
    [
      /password.*(6|characters|short)/i,
      "A senha precisa ter pelo menos 8 caracteres.",
      "Password must be at least 8 characters.",
    ],
    [
      /rate limit|too many/i,
      "Muitas tentativas. Aguarde alguns instantes.",
      "Too many attempts. Please wait a moment.",
    ],
    // Journey/runtime gates: operational guidance must win over the generic fallback.
    [
      /This step is not ready yet/i,
      "Esta etapa ainda não está pronta. Resolva as pessoas pendentes e os itens obrigatórios do checklist antes de continuar.",
      "This step is not ready yet. Resolve pending people and required checklist items before continuing.",
    ],
    [
      /Departure can only be authorized on a running operation|ready or running operation/i,
      "A operação não está em execução. Coloque-a em andamento antes de autorizar a saída.",
      "The operation is not running. Put it in progress before authorizing departure.",
    ],
    [
      /Departure has not been authorized/i,
      "A saída ainda não foi autorizada nesta etapa. Autorize a saída antes de registrar a partida.",
      "Departure has not been authorized on this step. Authorize it before recording departure.",
    ],
    [
      /Another step is still running/i,
      "Outra etapa ainda está em andamento. Conclua-a antes de iniciar uma nova.",
      "Another step is still running. Finish it before starting a new one.",
    ],
    [
      /operation must be ready before the journey/i,
      "A operação precisa estar pronta antes de iniciar a jornada.",
      "The operation must be ready before starting the journey.",
    ],
    [
      /step is already closed|already completed|terminal;.*cannot|operation is terminal/i,
      "Esta etapa ou operação já foi encerrada e não pode mais ser alterada.",
      "This step or operation is already closed and can no longer be changed.",
    ],
    [
      /was skipped and cannot be started/i,
      "Esta etapa foi pulada e não pode ser iniciada.",
      "This step was skipped and cannot be started.",
    ],
    [
      /already started.*cannot be skipped/i,
      "Uma etapa que já começou não pode ser pulada.",
      "A step that has already started cannot be skipped.",
    ],
    [
      /reason is required to skip/i,
      "Informe o motivo para pular esta etapa.",
      "Give a reason to skip this step.",
    ],
    // DEF-PILOT-015: vehicle capacity invariant is enforced in the backend.
    [
      /Vehicle capacity has been reached for this leg/i,
      "A capacidade do veículo foi atingida neste trecho.",
      "Vehicle capacity has been reached for this leg.",
    ],
    // DEF-PILOT-012: seat collision on the same transport leg must surface
    // before the generic duplicate-key fallback.
    [
      /seat_active_label_key/i,
      "Este assento já está ocupado neste trecho. Escolha outro assento.",
      "This seat is already occupied on this leg. Choose another seat.",
    ],
    [
      /duplicate key|tenants_slug_key/i,
      "Este identificador de organização já está em uso.",
      "That organization identifier is already taken.",
    ],
    [
      /already been used/i,
      "Este convite já foi utilizado.",
      "This invitation has already been used.",
    ],
    [/has expired/i, "Este convite expirou.", "This invitation has expired."],
    [
      /different email address/i,
      "Este convite foi emitido para outro e-mail.",
      "This invitation was issued to a different email address.",
    ],
    [
      /last owner/i,
      "A organização precisa de pelo menos um proprietário.",
      "An organization must keep at least one owner.",
    ],
    [
      /cannot change their own role/i,
      "Você não pode alterar o seu próprio papel.",
      "You cannot change your own role.",
    ],
    [
      /Only owners and admins/i,
      "Apenas proprietários e administradores podem fazer isso.",
      "Only owners and admins can do this.",
    ],
    [
      /permission for this operation runtime|not have permission/i,
      "Você não tem permissão para executar esta ação nesta operação.",
      "You do not have permission to perform this action on this operation.",
    ],
    [
      /Authentication required/i,
      "Sessão expirada. Entre novamente.",
      "Session expired. Please sign in again.",
    ],
    // DEF-PILOT-007: temporal runtime guards must read as operational guidance,
    // never as a raw database message.
    [
      /backdated before the operation window/i,
      "A etapa não pode ser iniciada fora da janela operacional atual. Verifique a previsão da operação.",
      "This step cannot be started outside the current operating window. Check the operation forecast.",
    ],
    [
      /cannot be recorded in the future/i,
      "Não é possível registrar um fato com data futura. Verifique a data e a hora do dispositivo.",
      "A fact cannot be recorded in the future. Check the device date and time.",
    ],
    // DEF-PILOT-008: boarding sequence guard must read as an operator instruction.
    [
      /boarding has not started/i,
      "O embarque ainda não foi aberto nesta etapa. Toque em “Iniciar embarque” antes de registrar embarcados.",
      "Boarding is not open on this step yet. Tap “Start boarding” before recording boarded travelers.",
    ],
    [
      /does not track boarding/i,
      "Esta etapa não controla embarque.",
      "This step does not track boarding.",
    ],
    // DEF-PILOT-025: arrival guard on disembarkation / movement steps.
    [
      /has not arrived/i,
      "A chegada ainda não foi registrada nesta etapa. Toque em “Registrar chegada” antes de concluir o desembarque.",
      "Arrival has not been recorded on this step yet. Tap “Record arrival” before completing disembarkation.",
    ],
    [
      /has not started yet/i,
      "Esta etapa ainda não foi iniciada. Toque em “Iniciar etapa” antes de registrar esta ação.",
      "This step has not started yet. Tap “Start step” before recording this action.",
    ],
  ];

  for (const [re, ptMsg, enMsg] of map) {
    if (re.test(raw)) return pt ? ptMsg : enMsg;
  }
  return pt ? "Algo não funcionou. Tente novamente." : "Something went wrong. Please try again.";
}
