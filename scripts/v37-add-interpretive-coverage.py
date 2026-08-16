from pathlib import Path

path = Path("src/routes/_authenticated/blueprints.$blueprintId.tsx")
text = path.read_text()

# DraftEditor props
old = '''function DraftEditor({
  version,
  steps,
  mayEdit,
  mayPublish,
  onChanged,
}: {
  version: BlueprintVersionRow;
  steps: BlueprintStepRow[];
  mayEdit: boolean;
  mayPublish: boolean;
  onChanged: () => void;
}) {'''
new = '''function DraftEditor({
  version,
  steps,
  visitPointCounts,
  mayEdit,
  mayPublish,
  onChanged,
}: {
  version: BlueprintVersionRow;
  steps: BlueprintStepRow[];
  visitPointCounts: ReadonlyMap<string, number>;
  mayEdit: boolean;
  mayPublish: boolean;
  onChanged: () => void;
}) {'''
if old not in text:
    raise SystemExit("DraftEditor signature anchor missing")
text = text.replace(old, new, 1)

# Draft total and header chip
old = '''  const canPublishNow = mayPublish && validation?.valid === true && order.length > 0;

  return ('''
new = '''  const canPublishNow = mayPublish && validation?.valid === true && order.length > 0;
  const visitPointTotal = order.reduce(
    (total, step) => total + (visitPointCounts.get(step.id) ?? 0),
    0,
  );

  return ('''
if old not in text:
    raise SystemExit("draft total anchor missing")
text = text.replace(old, new, 1)

old = '''          <Chip className="bg-warning-soft text-warning">{t("bp.version.status.draft")}</Chip>
        </div>'''
new = '''          <Chip className="bg-warning-soft text-warning">{t("bp.version.status.draft")}</Chip>
          <Chip className="border border-border text-muted-foreground">
            <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
            {visitPointTotal} {visitPointTotal === 1 ? "ponto interpretativo" : "pontos interpretativos"}
          </Chip>
        </div>'''
if old not in text:
    raise SystemExit("draft header chip anchor missing")
text = text.replace(old, new, 1)

# Per-step draft chip after kind chip
old = '''                    <Chip className="border border-border text-muted-foreground">
                      {t(`w04.kind.${step.step_kind}`)}
                    </Chip>
                    {step.presence_requirement ? ('''
new = '''                    <Chip className="border border-border text-muted-foreground">
                      {t(`w04.kind.${step.step_kind}`)}
                    </Chip>
                    <Chip
                      className={
                        (visitPointCounts.get(step.id) ?? 0) > 0
                          ? "bg-primary-soft text-primary"
                          : "border border-border text-muted-foreground"
                      }
                    >
                      <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
                      {visitPointCounts.get(step.id) ?? 0} pontos
                    </Chip>
                    {step.presence_requirement ? ('''
if old not in text:
    raise SystemExit("draft step chip anchor missing")
text = text.replace(old, new, 1)

# Published card props
old = '''function PublishedVersionCard({
  version,
  steps,
}: {
  version: BlueprintVersionRow;
  steps: BlueprintStepRow[];
}) {'''
new = '''function PublishedVersionCard({
  version,
  steps,
  visitPointCounts,
}: {
  version: BlueprintVersionRow;
  steps: BlueprintStepRow[];
  visitPointCounts: ReadonlyMap<string, number>;
}) {'''
if old not in text:
    raise SystemExit("PublishedVersionCard signature anchor missing")
text = text.replace(old, new, 1)

old = '''  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  return ('''
new = '''  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const visitPointTotal = steps.reduce(
    (total, step) => total + (visitPointCounts.get(step.id) ?? 0),
    0,
  );
  return ('''
# only replace first occurrence after Published card by slicing
published_index = text.index("function PublishedVersionCard")
tail = text[published_index:]
if old not in tail:
    raise SystemExit("published total anchor missing")
tail = tail.replace(old, new, 1)
text = text[:published_index] + tail

old = '''          <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </div>'''
new = '''          <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <Chip className="border border-border text-muted-foreground">
            <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
            {visitPointTotal} pontos
          </Chip>
        </div>'''
published_index = text.index("function PublishedVersionCard")
tail = text[published_index:]
if old not in tail:
    raise SystemExit("published header chip anchor missing")
tail = tail.replace(old, new, 1)
text = text[:published_index] + tail

old = '''              <p className="text-xs text-muted-foreground">
                {formatOffset(step.start_offset_minutes, t)}
              </p>'''
new = '''              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatOffset(step.start_offset_minutes, t)}</span>
                <span className="inline-flex items-center gap-1">
                  <Lightbulb className="size-3.5" aria-hidden="true" />
                  {visitPointCounts.get(step.id) ?? 0} pontos
                </span>
              </div>'''
published_index = text.index("function PublishedVersionCard")
tail = text[published_index:]
if old not in tail:
    raise SystemExit("published step count anchor missing")
tail = tail.replace(old, new, 1)
text = text[:published_index] + tail

# Query visit points with steps
old = '''      const steps = versionRows.length
        ? await supabase
            .from("journey_blueprint_steps")
            .select("*")
            .in(
              "version_id",
              versionRows.map((v) => v.id),
            )
            .order("sequence")
        : { data: [], error: null };
      if (steps.error) throw steps.error;
      return {
        blueprint: blueprint.data,
        versions: versionRows,
        steps: (steps.data ?? []) as BlueprintStepRow[],
      };'''
new = '''      const versionIds = versionRows.map((version) => version.id);
      const [steps, visitPoints] = versionRows.length
        ? await Promise.all([
            supabase
              .from("journey_blueprint_steps")
              .select("*")
              .in("version_id", versionIds)
              .order("sequence"),
            supabase
              .from("journey_blueprint_visit_points")
              .select("id, version_id, blueprint_step_id")
              .in("version_id", versionIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];
      if (steps.error) throw steps.error;
      if (visitPoints.error) throw visitPoints.error;
      return {
        blueprint: blueprint.data,
        versions: versionRows,
        steps: (steps.data ?? []) as BlueprintStepRow[],
        visitPoints: visitPoints.data ?? [],
      };'''
if old not in text:
    raise SystemExit("workspace query anchor missing")
text = text.replace(old, new, 1)

# Create counts map
old = '''  const versions = query.data?.versions ?? [];
  const allSteps = query.data?.steps ?? [];
  const draft = draftVersion(versions);'''
new = '''  const versions = query.data?.versions ?? [];
  const allSteps = query.data?.steps ?? [];
  const visitPointCounts = new Map<string, number>();
  for (const point of query.data?.visitPoints ?? []) {
    visitPointCounts.set(
      point.blueprint_step_id,
      (visitPointCounts.get(point.blueprint_step_id) ?? 0) + 1,
    );
  }
  const draft = draftVersion(versions);'''
if old not in text:
    raise SystemExit("workspace counts anchor missing")
text = text.replace(old, new, 1)

# Pass map to cards
old = '''          steps={allSteps.filter((step) => step.version_id === draft.id)}
          mayEdit={mayEdit && !archived}'''
new = '''          steps={allSteps.filter((step) => step.version_id === draft.id)}
          visitPointCounts={visitPointCounts}
          mayEdit={mayEdit && !archived}'''
if old not in text:
    raise SystemExit("draft prop anchor missing")
text = text.replace(old, new, 1)

old = '''                version={version}
                steps={allSteps.filter((step) => step.version_id === version.id)}
              />'''
new = '''                version={version}
                steps={allSteps.filter((step) => step.version_id === version.id)}
                visitPointCounts={visitPointCounts}
              />'''
if old not in text:
    raise SystemExit("published prop anchor missing")
text = text.replace(old, new, 1)

path.write_text(text)
