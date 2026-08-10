import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Trash2, UserPlus, Users } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant, type PersonRow } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({
    meta: [
      { title: "People — COBS OS identity" },
      {
        name: "description",
        content:
          "People in your COBS OS organization. A person is a human record that can exist entirely without a login account.",
      },
      { property: "og:title", content: "People — COBS OS identity" },
      {
        property: "og:description",
        content: "Human records that can exist without a login account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PeoplePage,
});

function PeopleList() {
  const { t, locale } = useI18n();
  const { tenant, canManage } = useTenant();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [linking, setLinking] = React.useState<PersonRow | null>(null);

  const people = useQuery({
    queryKey: ["people", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const members = useQuery({
    queryKey: ["members", tenant?.id],
    enabled: Boolean(tenant?.id) && linking !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("profile_id, role, profiles(display_name, email)")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data as Array<{
        profile_id: string;
        role: string;
        profiles: { display_name: string | null; email: string | null } | null;
      }>;
    },
  });

  const create = useMutation({
    mutationFn: async (input: { full_name: string; email: string; phone: string }) => {
      const { error } = await supabase.from("people").insert({
        tenant_id: tenant!.id,
        full_name: input.full_name,
        email: input.email || null,
        phone_e164: input.phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("people.created"));
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["people", tenant?.id] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("people").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("people.deleted"));
      void queryClient.invalidateQueries({ queryKey: ["people", tenant?.id] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const link = useMutation({
    mutationFn: async (input: { personId: string; profileId: string }) => {
      const { error } = await supabase.rpc("link_person_to_profile", {
        _tenant_id: tenant!.id,
        _person_id: input.personId,
        _profile_id: input.profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("people.linkDone"));
      setLinking(null);
      void queryClient.invalidateQueries({ queryKey: ["people", tenant?.id] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (people.isLoading) return <PanelSkeleton rows={4} />;

  const rows = people.data ?? [];

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button className="min-h-11" onClick={() => setOpen((v) => !v)}>
            <UserPlus className="mr-2 size-4" aria-hidden="true" />
            {t("people.add")}
          </Button>
        </div>
      ) : null}

      {open ? (
        <form
          className="surface-panel animate-rise space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            create.mutate({
              full_name: String(form.get("full_name") ?? "").trim(),
              email: String(form.get("email") ?? "").trim(),
              phone: String(form.get("phone") ?? "").trim(),
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="p-name">{t("people.fullName")}</Label>
              <Input id="p-name" name="full_name" required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="p-email">{t("people.email")}</Label>
              <Input id="p-email" name="email" type="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-phone">{t("people.phone")}</Label>
              <Input id="p-phone" name="phone" placeholder="+5511999999999" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="min-h-11" disabled={create.isPending}>
              {create.isPending ? t("common.saving") : t("people.add")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={Users} title={t("people.empty")} body={t("people.emptyBody")} />
      ) : (
        <ul className="space-y-2">
          {rows.map((person) => (
            <li
              key={person.id}
              className="surface-panel flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft font-semibold text-primary">
                {person.full_name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{person.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {person.email ?? person.phone_e164 ?? "—"}
                </p>
              </div>
              <span
                className={
                  person.profile_id
                    ? "shrink-0 rounded-full bg-primary-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary"
                    : "shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                }
              >
                {person.profile_id ? t("people.linked") : t("people.noLogin")}
              </span>
              {canManage ? (
                <div className="flex shrink-0 gap-1">
                  {!person.profile_id ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-11 min-w-11"
                      aria-label={t("people.link")}
                      onClick={() => setLinking(person)}
                    >
                      <Link2 className="size-4" />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11 text-destructive"
                    aria-label={t("people.deleted")}
                    onClick={() => remove.mutate(person.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {linking ? (
        <div className="surface-panel animate-rise space-y-3 p-5">
          <p className="text-sm font-medium">
            {t("people.link")} — {linking.full_name}
          </p>
          <Select
            onValueChange={(profileId) => link.mutate({ personId: linking.id, profileId })}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder={t("team.members")} />
            </SelectTrigger>
            <SelectContent>
              {(members.data ?? []).map((m) => (
                <SelectItem key={m.profile_id} value={m.profile_id}>
                  {m.profiles?.display_name || m.profiles?.email || m.profile_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" className="min-h-11" onClick={() => setLinking(null)}>
            {t("common.cancel")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PeoplePage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="people" title={t("people.title")}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="animate-rise">
          <h2 className="text-2xl font-semibold lg:text-3xl">{t("people.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("people.subtitle")}</p>
        </section>
        <RequireTenant>
          <PeopleList />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
