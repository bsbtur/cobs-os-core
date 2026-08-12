import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Map as MapIcon, Plus } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useTenant } from "@/lib/tenant";
import {
  canEditBlueprints,
  canViewBlueprints,
  draftVersion,
  humanizeBlueprintError,
  latestPublishedVersion,
  newIdempotencyKey,
  readCreatedBlueprint,
  slugifyBlueprint,
  type BlueprintRow,
  type BlueprintVersionRow,
} from "@/lib/blueprints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";

export const Route = createFileRoute("/_authenticated/blueprints/")({
  head: () => ({
    meta: [
      { title: "Journey blueprints — COBS OS reusable itineraries" },
      {
        name: "description",
        content:
          "Versioned, reusable journey blueprints in COBS OS: publish once and provision operation journeys without manual scripts.",
      },
      { property: "og:title", content: "Journey blueprints — COBS OS reusable itineraries" },
      {
        property: "og:description",
        content: "Publish a blueprint version once and provision journeys reproducibly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BlueprintsPage,
});

type VersionSummary = Pick<
  BlueprintVersionRow,
  "id" | "blueprint_id" | "status" | "version_number" | "step_count" | "published_at" | "checksum"
>;

function CreateBlueprintDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idempotencyKey = React.useRef(newIdempotencyKey());
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [timezone, setTimezone] = React.useState(tenant?.timezone ?? "");

  React.useEffect(() => {
    if (open) {
      // One intent = one key, stable across retries of the same submission attempt.
      idempotencyKey.current = newIdempotencyKey();
      setName("");
      setSlug("");
      setDescription("");
      setTimezone(tenant?.timezone ?? "");
    }
  }, [open, tenant?.timezone]);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_journey_blueprint", {
        _tenant_id: tenant!.id,
        _name: name.trim(),
        _slug: slug.trim() || slugifyBlueprint(name),
        _idempotency_key: idempotencyKey.current,
        ...(description.trim() ? { _description: description.trim() } : {}),
        ...(timezone.trim() ? { _default_timezone: timezone.trim() } : {}),
      });
      if (error) throw error;
      return readCreatedBlueprint(data);
    },
    onSuccess: (created) => {
      feedback.success(t("bp.create.success"));
      void queryClient.invalidateQueries({ queryKey: ["blueprints", tenant?.id] });
      onOpenChange(false);
      if (created) {
        void navigate({
          to: "/blueprints/$blueprintId",
          params: { blueprintId: created.blueprintId },
        });
      }
    },
    onError: (error) => feedback.error(humanizeBlueprintError(error, t)),
  });

  const nameInvalid = name.trim().length === 0;
  const slugInvalid = (slug.trim() || slugifyBlueprint(name)).length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (create.isPending ? null : onOpenChange(next))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("bp.create.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bp-name">{t("bp.field.name")}</Label>
            <Input
              id="bp-name"
              value={name}
              required
              aria-describedby="bp-name-hint"
              onChange={(e) => {
                setName(e.target.value);
                setSlug(slugifyBlueprint(e.target.value));
              }}
            />
            <p id="bp-name-hint" className="text-xs text-muted-foreground">
              {t("bp.create.nameHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-slug">{t("bp.field.slug")}</Label>
            <Input
              id="bp-slug"
              value={slug}
              aria-describedby="bp-slug-hint"
              onChange={(e) => setSlug(slugifyBlueprint(e.target.value))}
            />
            <p id="bp-slug-hint" className="text-xs text-muted-foreground">
              {t("bp.create.slugHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-description">{t("bp.field.description")}</Label>
            <Textarea
              id="bp-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-tz">{t("bp.field.timezone")}</Label>
            <Input id="bp-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
          <div aria-live="polite" className="sr-only">
            {create.isPending ? t("bp.busy") : ""}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={create.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="min-h-11"
              disabled={nameInvalid || slugInvalid || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? t("bp.busy") : t("bp.create.submit")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BlueprintCard({
  blueprint,
  versions,
}: {
  blueprint: BlueprintRow;
  versions: VersionSummary[];
}) {
  const { t, locale } = useI18n();
  const published = latestPublishedVersion(versions);
  const draft = draftVersion(versions);
  const stepCount = published?.step_count ?? draft?.step_count ?? 0;

  return (
    <article className="surface-panel flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{blueprint.name}</h3>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {blueprint.slug}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
            blueprint.status === "active"
              ? "bg-primary-soft text-primary"
              : "border border-border text-muted-foreground"
          }`}
        >
          {t(`bp.status.${blueprint.status}`)}
        </span>
      </div>

      {blueprint.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{blueprint.description}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("bp.publishedVersion")}</dt>
          <dd className="tabular-nums">
            {published ? `${t("bp.versionShort")}${published.version_number}` : t("bp.noPublished")}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("bp.draftVersion")}</dt>
          <dd className="tabular-nums">
            {draft ? `${t("bp.versionShort")}${draft.version_number}` : t("bp.noDraft")}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("bp.stepCount")}</dt>
          <dd className="tabular-nums">{stepCount}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("bp.updatedAt")}</dt>
          <dd className="tabular-nums">{formatDateTime(blueprint.updated_at, { locale })}</dd>
        </div>
      </dl>

      <Link
        to="/blueprints/$blueprintId"
        params={{ blueprintId: blueprint.id }}
        className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:border-border-strong"
      >
        {t("bp.open")}
      </Link>
    </article>
  );
}

function BlueprintsWorkspace() {
  const { t } = useI18n();
  const { tenant, role } = useTenant();
  const [creating, setCreating] = React.useState(false);
  const mayEdit = canEditBlueprints(role);

  const blueprints = useQuery({
    queryKey: ["blueprints", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const [list, versions] = await Promise.all([
        supabase
          .from("journey_blueprints")
          .select("*")
          .eq("tenant_id", tenant!.id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("journey_blueprint_versions")
          .select("id, blueprint_id, status, version_number, step_count, published_at, checksum")
          .eq("tenant_id", tenant!.id),
      ]);
      if (list.error) throw list.error;
      if (versions.error) throw versions.error;
      return {
        blueprints: list.data ?? [],
        versions: (versions.data ?? []) as VersionSummary[],
      };
    },
  });

  if (!canViewBlueprints(role)) {
    return <EmptyState icon={MapIcon} title={t("bp.forbidden")} body={t("bp.forbiddenBody")} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold lg:text-3xl">{t("bp.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("bp.subtitle")}</p>
        </div>
        {mayEdit ? (
          <Button className="min-h-11" onClick={() => setCreating(true)}>
            <Plus className="mr-2 size-4" aria-hidden="true" />
            {t("bp.create")}
          </Button>
        ) : null}
      </div>

      {!mayEdit ? (
        <p className="surface-panel px-4 py-3 text-sm text-muted-foreground">{t("bp.readOnly")}</p>
      ) : null}

      <div aria-live="polite">
        {blueprints.isLoading ? <PanelSkeleton rows={3} /> : null}

        {blueprints.isError ? (
          <EmptyState icon={MapIcon} title={t("bp.loadError")} body={t("bp.forbiddenBody")} />
        ) : null}

        {!blueprints.isLoading &&
        !blueprints.isError &&
        (blueprints.data?.blueprints.length ?? 0) === 0 ? (
          <EmptyState
            icon={MapIcon}
            title={t("bp.empty")}
            body={t("bp.emptyBody")}
            action={
              mayEdit ? (
                <Button className="min-h-11" onClick={() => setCreating(true)}>
                  {t("bp.create")}
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {blueprints.data && blueprints.data.blueprints.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {blueprints.data.blueprints.map((blueprint) => (
              <BlueprintCard
                key={blueprint.id}
                blueprint={blueprint}
                versions={blueprints.data!.versions.filter(
                  (v) => v.blueprint_id === blueprint.id,
                )}
              />
            ))}
          </div>
        ) : null}
      </div>

      <CreateBlueprintDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function BlueprintsPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="blueprints" title={t("bp.title")}>
      <div className="mx-auto w-full max-w-6xl">
        <RequireTenant>
          <BlueprintsWorkspace />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
