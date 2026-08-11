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
  ];


  for (const [re, ptMsg, enMsg] of map) {
    if (re.test(raw)) return pt ? ptMsg : enMsg;
  }
  return pt ? "Algo não funcionou. Tente novamente." : "Something went wrong. Please try again.";
}
