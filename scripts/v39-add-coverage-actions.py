from pathlib import Path

bp_path = Path("src/routes/_authenticated/blueprints.$blueprintId.tsx")
bp = bp_path.read_text()

old_chip = '''                    <Chip className={interpretiveCoverageClass(visitPointCounts.get(step.id) ?? 0)}>
                      <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
                      {visitPointCounts.get(step.id) ?? 0} pontos ·{" "}
                      {interpretiveCoverageLabel(visitPointCounts.get(step.id) ?? 0)}
                    </Chip>
'''
new_chip = '''                    <Chip className={interpretiveCoverageClass(visitPointCounts.get(step.id) ?? 0)}>
                      <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
                      {visitPointCounts.get(step.id) ?? 0} pontos ·{" "}
                      {interpretiveCoverageLabel(visitPointCounts.get(step.id) ?? 0)}
                    </Chip>
                    {(visitPointCounts.get(step.id) ?? 0) < 4 ? (
                      <Button asChild variant="ghost" size="sm" className="min-h-9 px-2 text-xs">
                        <a href={`/blueprints/${version.blueprint_id}/visit-points#step-${step.id}`}>
                          {(visitPointCounts.get(step.id) ?? 0) === 0
                            ? "Adicionar conteúdo"
                            : "Completar biblioteca"}
                        </a>
                      </Button>
                    ) : null}
'''
if old_chip not in bp:
    raise SystemExit("draft coverage chip anchor not found")
bp = bp.replace(old_chip, new_chip, 1)
bp_path.write_text(bp)

lib_path = Path("src/routes/_authenticated/blueprints.$blueprintId.visit-points.tsx")
lib = lib_path.read_text()
old_li = '''            <li key={step.id} className="surface-panel p-4 sm:p-5">
'''
new_li = '''            <li
              key={step.id}
              id={`step-${step.id}`}
              className="surface-panel scroll-mt-24 p-4 transition-shadow target:ring-2 target:ring-primary/40 sm:p-5"
            >
'''
if old_li not in lib:
    raise SystemExit("library step card anchor not found")
lib = lib.replace(old_li, new_li, 1)
lib_path.write_text(lib)
