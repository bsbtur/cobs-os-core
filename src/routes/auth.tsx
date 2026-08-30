import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { isSafeAppPath } from "@/lib/safe-redirect";
import { BrandLockup } from "@/app/shell/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { feedback } from "@/components/feedback/feedback";

function currentAuthOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
    mode: search["mode"] === "recovery" ? "recovery" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — COBS OS identity" },
      { name: "description", content: "Sign in or create a COBS OS account. Email and password authentication with confirmation required." },
      { property: "og:title", content: "Sign in — COBS OS identity" },
      { property: "og:description", content: "Email and password authentication for COBS OS experience operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const search = Route.useSearch();
  const [busy, setBusy] = React.useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = React.useState<string | null>(null);
  const [resetRequested, setResetRequested] = React.useState<string | null>(null);
  const [forgotMode, setForgotMode] = React.useState(false);

  const recoveryMode = search.mode === "recovery";
  const destination = isSafeAppPath(search.redirect) ? search.redirect : "/app";

  React.useEffect(() => {
    if (!recoveryMode && !loading && session) window.location.replace(destination);
  }, [loading, session, destination, recoveryMode]);

  const onSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") });
    setBusy(false);
    if (error) { feedback.error(humanizeError(error, locale)); return; }
    feedback.success(t("auth.welcome"));
    void navigate({ to: destination as "/app" });
  };

  const onRequestPasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const recoveryTarget = new URL("/auth", currentAuthOrigin());
    recoveryTarget.searchParams.set("mode", "recovery");
    recoveryTarget.searchParams.set("redirect", destination);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: recoveryTarget.toString() });
    setBusy(false);
    if (error) { feedback.error(humanizeError(error, locale)); return; }
    setResetRequested(email);
    feedback.success("E-mail de recuperação enviado");
  };

  const onUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirm_password") ?? "");
    if (password.length < 8) { feedback.error("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (password !== confirmPassword) { feedback.error("As senhas não coincidem."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { feedback.error(humanizeError(error, locale)); return; }
    feedback.success("Senha atualizada com sucesso");
    window.location.replace(destination);
  };

  const onSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (password.length < 8) { feedback.error(t("auth.passwordHint")); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${currentAuthOrigin()}${destination}`, data: { display_name: String(form.get("display_name") ?? "").trim() } },
    });
    setBusy(false);
    if (error) { feedback.error(humanizeError(error, locale)); return; }
    if (!data.session) { setAwaitingConfirmation(email); feedback.success(t("auth.created"), t("auth.confirmBody")); }
  };

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1fr_minmax(0,520px)]">
      <section className="relative hidden overflow-hidden border-r border-border bg-sidebar p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 command-canvas" aria-hidden="true" />
        <div className="relative"><BrandLockup /></div>
        <div className="relative max-w-md animate-rise">
          <h2 className="text-3xl font-semibold leading-tight text-sidebar-foreground">{recoveryMode ? "Redefinir senha" : t("auth.title")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-sidebar-foreground/70">{recoveryMode ? "Defina uma nova senha para continuar no COBS OS." : t("auth.subtitle")}</p>
        </div>
        <p className="relative flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/50"><ShieldCheck className="size-3.5" aria-hidden="true" />W01 · identity · tenant · authorization</p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-6 lg:hidden"><BrandLockup /></div>
          {recoveryMode ? (
            <form onSubmit={onUpdatePassword} className="animate-rise space-y-4">
              <h1 className="text-xl font-semibold">Definir nova senha</h1>
              <div className="space-y-2"><Label htmlFor="recovery-password">Nova senha</Label><Input id="recovery-password" name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
              <div className="space-y-2"><Label htmlFor="recovery-password-confirm">Confirmar nova senha</Label><Input id="recovery-password-confirm" name="confirm_password" type="password" required minLength={8} autoComplete="new-password" /></div>
              <Button type="submit" className="min-h-11 w-full" disabled={busy || !session}>{busy ? "Salvando…" : "Salvar nova senha"}</Button>
              {!session && !loading ? <p className="text-sm text-destructive">O link de recuperação é inválido ou expirou. Solicite um novo e-mail.</p> : null}
            </form>
          ) : resetRequested ? (
            <div className="animate-rise surface-panel p-6 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-lg bg-primary-soft text-primary"><MailCheck className="size-5" aria-hidden="true" /></span>
              <h1 className="mt-4 text-lg font-semibold">Confira seu e-mail</h1><p className="mt-2 text-sm text-muted-foreground">Enviamos o link para redefinir a senha.</p><p className="mt-3 break-all font-mono text-xs text-foreground">{resetRequested}</p>
              <Button variant="outline" className="mt-5 w-full" onClick={() => { setResetRequested(null); setForgotMode(false); }}>Voltar para entrar</Button>
            </div>
          ) : forgotMode ? (
            <form onSubmit={onRequestPasswordReset} className="animate-rise space-y-4">
              <h1 className="text-xl font-semibold">Recuperar senha</h1><p className="text-sm text-muted-foreground">Informe seu e-mail e enviaremos um link seguro para redefinir a senha.</p>
              <div className="space-y-2"><Label htmlFor="reset-email">E-mail</Label><Input id="reset-email" name="email" type="email" required autoComplete="email" /></div>
              <Button type="submit" className="min-h-11 w-full" disabled={busy}>{busy ? "Enviando…" : "Enviar link de recuperação"}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setForgotMode(false)}>Voltar para entrar</Button>
            </form>
          ) : awaitingConfirmation ? (
            <div className="animate-rise surface-panel p-6 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-lg bg-primary-soft text-primary"><MailCheck className="size-5" aria-hidden="true" /></span>
              <h1 className="mt-4 text-lg font-semibold">{t("auth.confirmTitle")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("auth.confirmBody")}</p><p className="mt-3 break-all font-mono text-xs text-foreground">{awaitingConfirmation}</p><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("auth.confirmHint")}</p>
              <Button variant="outline" className="mt-5 w-full" onClick={() => setAwaitingConfirmation(null)}>{t("auth.backToSignIn")}</Button>
            </div>
          ) : (
            <Tabs defaultValue="sign-in" className="animate-rise">
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="sign-in">{t("auth.tab.signIn")}</TabsTrigger><TabsTrigger value="sign-up">{t("auth.tab.signUp")}</TabsTrigger></TabsList>
              <TabsContent value="sign-in">
                <form onSubmit={onSignIn} className="space-y-4 pt-4">
                  <div className="space-y-2"><Label htmlFor="si-email">{t("auth.email")}</Label><Input id="si-email" name="email" type="email" required autoComplete="email" /></div>
                  <div className="space-y-2"><Label htmlFor="si-password">{t("auth.password")}</Label><Input id="si-password" name="password" type="password" required autoComplete="current-password" /></div>
                  <div className="text-right"><button type="button" className="text-sm text-primary hover:underline" onClick={() => setForgotMode(true)}>Esqueci minha senha</button></div>
                  <Button type="submit" className="min-h-11 w-full" disabled={busy}>{busy ? t("auth.working") : t("auth.signIn")}</Button>
                </form>
              </TabsContent>
              <TabsContent value="sign-up">
                <form onSubmit={onSignUp} className="space-y-4 pt-4">
                  <div className="space-y-2"><Label htmlFor="su-name">{t("auth.displayName")}</Label><Input id="su-name" name="display_name" autoComplete="name" /></div>
                  <div className="space-y-2"><Label htmlFor="su-email">{t("auth.email")}</Label><Input id="su-email" name="email" type="email" required autoComplete="email" /></div>
                  <div className="space-y-2"><Label htmlFor="su-password">{t("auth.password")}</Label><Input id="su-password" name="password" type="password" required minLength={8} autoComplete="new-password" /><p className="text-xs text-muted-foreground">{t("auth.passwordHint")}</p></div>
                  <Button type="submit" className="min-h-11 w-full" disabled={busy}>{busy ? t("auth.working") : t("auth.signUp")}</Button><p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("auth.confirmHint")}</p>
                </form>
              </TabsContent>
            </Tabs>
          )}
          <div className="mt-6"><Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{t("signin.back")}</Link></div>
        </div>
      </section>
    </div>
  );
}
