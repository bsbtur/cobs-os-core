from pathlib import Path

path = Path("src/routes/_authenticated/blueprints.$blueprintId.tsx")
text = path.read_text()

old_counts = '''  const coveredStepCount = order.filter((step) => (visitPointCounts.get(step.id) ?? 0) > 0).length;
'''
new_counts = '''  const coveredStepCount = order.filter((step) => (visitPointCounts.get(step.id) ?? 0) > 0).length;
  const completeStepCount = order.filter((step) => (visitPointCounts.get(step.id) ?? 0) >= 4).length;
  const partialStepCount = order.filter((step) => {
    const count = visitPointCounts.get(step.id) ?? 0;
    return count > 0 && count < 4;
  }).length;
  const emptyStepCount = order.length - completeStepCount - partialStepCount;
  const nextInterpretiveGap = order.find((step) => (visitPointCounts.get(step.id) ?? 0) < 4) ?? null;
'''
if old_counts not in text:
    raise SystemExit("coverage count anchor not found")
text = text.replace(old_counts, new_counts, 1)

header_end = '''      </header>\n\n      {mayPublish && !canPublishNow ? (\n'''
dashboard = '''      </header>\n\n      <section className="surface-panel p-4 sm:p-5" aria-label="Qualidade interpretativa da experiência">\n        <div className="flex flex-wrap items-start justify-between gap-4">\n          <div>\n            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">\n              Qualidade interpretativa\n            </p>\n            <p className="mt-1 text-sm text-muted-foreground">\n              Acompanhe a cobertura editorial das etapas antes de publicar a experiência.\n            </p>\n          </div>\n          {nextInterpretiveGap ? (\n            <Button asChild variant="outline" className="min-h-10">\n              <a\n                href={`/blueprints/${version.blueprint_id}/visit-points#step-${nextInterpretiveGap.id}`}\n              >\n                Continuar enriquecimento\n              </a>\n            </Button>\n          ) : order.length > 0 ? (\n            <Chip className="bg-primary-soft text-primary">Experiência enriquecida</Chip>\n          ) : null}\n        </div>\n\n        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">\n          <div className="rounded-xl border border-border bg-background/50 p-3">\n            <p className="text-2xl font-semibold tabular-nums">{order.length}</p>\n            <p className="text-xs text-muted-foreground">Etapas totais</p>\n          </div>\n          <div className="rounded-xl border border-border bg-primary-soft/40 p-3">\n            <p className="text-2xl font-semibold tabular-nums text-primary">{completeStepCount}</p>\n            <p className="text-xs text-muted-foreground">Completas</p>\n          </div>\n          <div className="rounded-xl border border-border bg-warning-soft/40 p-3">\n            <p className="text-2xl font-semibold tabular-nums text-warning">{partialStepCount}</p>\n            <p className="text-xs text-muted-foreground">Parciais</p>\n          </div>\n          <div className="rounded-xl border border-border bg-background/50 p-3">\n            <p className="text-2xl font-semibold tabular-nums">{emptyStepCount}</p>\n            <p className="text-xs text-muted-foreground">Sem conteúdo</p>\n          </div>\n        </div>\n\n        <p className="mt-3 text-xs text-muted-foreground">\n          {coveredStepCount}/{order.length} etapas possuem ao menos um ponto interpretativo.\n        </p>\n      </section>\n\n      {mayPublish && !canPublishNow ? (\n'''
if header_end not in text:
    raise SystemExit("draft header end anchor not found")
text = text.replace(header_end, dashboard, 1)

path.write_text(text)
