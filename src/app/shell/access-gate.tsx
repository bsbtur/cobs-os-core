import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Link2 as LinkIcon, Loader2, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { claimTokenFromInviteInput } from "@/lib/claim-intent";
import { BrandLockup } from "@/app/shell/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FullPageLoading } from "@/components/feedback/loading";

/**
 * COBS OS · P0.2.1 — operator access gate.
 *
 * BINDING: an authenticated identity WITHOUT an operational Membership never
 * receives administrative chrome. It is routed to the traveler portal when it
 * holds effective Participant Access (W10), otherwise it gets a neutral
 * "account without access" state. This gate never creates Membership, Person,
 * Participation, Tenant or Grant — it only decides what to render.
 */

async function fetchEffectivePortalAccess(): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_my_participant_access");
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  return rows.some((row) => row["effective"] === true);
}

function useEffectivePortalAccess(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["access-posture", "portal", user?.id],
    enabled: enabled && Boolean(user?.id),
    retry: false,
    staleTime: 30_000,
    queryFn: fetchEffectivePortalAccess,
  });
}

/**
 * DEF-PILOT-017B — portable claim recovery.
 *
 * The pending claim intent lives in the browser that first opened the link.
 * A traveler who authenticates in another context (e-mail confirmation in a
 * different browser, later manual sign-in) arrives here with no intent. This
 * form only extracts the token from a pasted invitation link and hands it to
 * the existing claim route: no claim logic, no grant, no profile, no storage.
 */
function InviteRecovery() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<"none" | "empty" | "invalid">("none");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (value.trim().length === 0) {
      setError("empty");
      return;
    }
    const token = claimTokenFromInviteInput(value);
    if (!token) {
      setError("invalid");
      return;
    }
    setError("none");
    setValue(""); // never keep the token in component state
    void navigate({ to: "/my/claim/$token", params: { token }, replace: true });
  };

  return (
    <form onSubmit={submit} className="mt-6 border-t border-border pt-4">
      <h2 className="text-sm font-semibold">{t("access.recover.title")}</h2>
      <label
        htmlFor="invite-link"
        className="mt-2 block text-xs leading-relaxed text-muted-foreground"
      >
        {t("access.recover.label")}
      </label>
      <Input
        id="invite-link"
        name="invite-link"
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        className="mt-2 min-h-11"
        placeholder={t("access.recover.placeholder")}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error !== "none") setError("none");
        }}
      />
      <Button type="submit" variant="outline" className="mt-3 min-h-11">
        <LinkIcon className="mr-2 size-4" aria-hidden="true" />
        {t("access.recover.cta")}
      </Button>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-destructive">
        {error === "empty"
          ? t("access.recover.empty")
          : error === "invalid"
            ? t("access.recover.invalid")
            : ""}
      </p>
    </form>
  );
}

function NoAccountAccess() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [checking, setChecking] = React.useState(false);
  const [feedback, setFeedback] = React.useState<"none" | "nochange" | "error">("none");

  const recheck = React.useCallback(async () => {
    if (checking) return; // DEF-PILOT-002: never fire duplicate concurrent checks
    setChecking(true);
    setFeedback("none");
    try {
      // Refetch BOTH posture sources and wait for completion.
      const [memberships, portal] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: ["memberships", user?.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("memberships")
              .select("*, tenants(*)")
              .eq("profile_id", user!.id)
              .eq("status", "active");
            if (error) throw error;
            return data ?? [];
          },
          staleTime: 0,
        }),
        queryClient.fetchQuery({
          queryKey: ["access-posture", "portal", user?.id],
          queryFn: fetchEffectivePortalAccess,
          staleTime: 0,
          retry: false,
        }),
      ]);

      if (Array.isArray(memberships) && memberships.length > 0) {
        await navigate({ to: "/app", replace: true });
        return;
      }
      if (portal === true) {
        await navigate({ to: "/my", replace: true });
        return;
      }
      setFeedback("nochange");
    } catch {
      setFeedback("error");
    } finally {
      setChecking(false);
    }
  }, [checking, navigate, queryClient, user]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-md">
        <BrandLockup />
        <div className="surface-panel mt-6 p-6">
          <span className="grid size-11 place-items-center rounded-lg bg-primary-soft text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">{t("access.none.title")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("access.none.body")}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={() => void recheck()} disabled={checking}>
              {checking ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              )}
              {checking ? t("access.none.checking") : t("access.none.recheck")}
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void signOut()}
              disabled={checking}
            >
              {t("access.none.signOut")}
            </Button>
          </div>

          <p
            role="status"
            aria-live="polite"
            className={
              feedback === "error"
                ? "mt-3 text-sm text-destructive"
                : "mt-3 text-sm text-muted-foreground"
            }
          >
            {feedback === "nochange"
              ? t("access.none.nochange")
              : feedback === "error"
                ? t("access.none.error")
                : ""}
          </p>

          <InviteRecovery />

          <div className="mt-6 border-t border-border pt-4">
            <Link
              to="/onboarding"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("access.none.org")}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">{t("access.none.orgHint")}</p>
          </div>
        </div>
      </div>
    </main>
  );
}

function AccessPostureError({ retry }: { retry: () => void }) {
  const { t } = useI18n();
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-md">
        <BrandLockup />
        <div className="surface-panel mt-6 p-6">
          <p role="alert" className="text-sm leading-relaxed text-destructive">
            {t("access.none.error")}
          </p>
          <Button className="mt-5 min-h-11" onClick={retry}>
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            {t("access.none.recheck")}
          </Button>
        </div>
      </div>
    </main>
  );
}

/** Renders children only for identities with an operational Membership. */
export function RequireOperatorAccess({ children }: { children: React.ReactNode }) {
  const { loading, hasError, memberships, refetch } = useTenant();
  const navigate = useNavigate();
  const hasMembership = memberships.length > 0;
  const portal = useEffectivePortalAccess(!loading && !hasError && !hasMembership);

  const shouldRedirectToPortal =
    !loading && !hasError && !hasMembership && portal.data === true;

  React.useEffect(() => {
    if (shouldRedirectToPortal) void navigate({ to: "/my", replace: true });
  }, [shouldRedirectToPortal, navigate]);

  if (loading) return <FullPageLoading />;
  if (hasError) return <AccessPostureError retry={refetch} />;
  if (hasMembership) return <>{children}</>;
  if (portal.isLoading || shouldRedirectToPortal) return <FullPageLoading />;
  if (portal.isError) return <AccessPostureError retry={() => void portal.refetch()} />;

  return <NoAccountAccess />;
}
