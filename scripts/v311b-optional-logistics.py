from pathlib import Path

path = Path("src/routes/_authenticated/blueprints.$blueprintId.tsx")
text = path.read_text()

old = '''                    <Chip className={interpretiveCoverageClass(visitPointCounts.get(step.id) ?? 0)}>
                      <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
                      {visitPointCounts.get(step.id) ?? 0} pontos ·{" "}
                      {interpretiveCoverageLabel(visitPointCounts.get(step.id) ?? 0)}
                    </Chip>
                    {(visitPointCounts.get(step.id) ?? 0) < 4 ? (
                      <Button asChild variant="ghost" size="sm" className="min-h-9 px-2 text-xs">
                        <a
                          href={`/blueprints/${version.blueprint_id}/visit-points#step-${step.id}`}
                        >
                          {(visitPointCounts.get(step.id) ?? 0) === 0
                            ? "Adicionar conteúdo"
                            : "Completar biblioteca"}
                        </a>
                      </Button>
                    ) : null}
'''
new = '''                    {editorialPriority(step) === 0 && (visitPointCounts.get(step.id) ?? 0) === 0 ? (
                      <Chip className="border border-border text-muted-foreground">
                        <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
                        Conteúdo opcional
                      </Chip>
                    ) : (
                      <Chip className={interpretiveCoverageClass(visitPointCounts.get(step.id) ?? 0)}>
                        <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
                        {visitPointCounts.get(step.id) ?? 0} pontos ·{" "}
                        {interpretiveCoverageLabel(visitPointCounts.get(step.id) ?? 0)}
                      </Chip>
                    )}
                    {editorialPriority(step) > 0 && (visitPointCounts.get(step.id) ?? 0) < 4 ? (
                      <Button asChild variant="ghost" size="sm" className="min-h-9 px-2 text-xs">
                        <a
                          href={`/blueprints/${version.blueprint_id}/visit-points#step-${step.id}`}
                        >
                          {(visitPointCounts.get(step.id) ?? 0) === 0
                            ? "Adicionar conteúdo"
                            : "Completar biblioteca"}
                        </a>
                      </Button>
                    ) : null}
'''
if old not in text:
    raise SystemExit("step coverage action anchor not found")
text = text.replace(old, new, 1)
path.write_text(text)
