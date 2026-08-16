from pathlib import Path

path = Path("src/routes/_authenticated/blueprints.$blueprintId.tsx")
text = path.read_text()

old_counts = '''  const completeStepCount = order.filter((step) => (visitPointCounts.get(step.id) ?? 0) >= 4).length;
  const partialStepCount = order.filter((step) => {
    const count = visitPointCounts.get(step.id) ?? 0;
    return count > 0 && count < 4;
  }).length;
  const emptyStepCount = order.length - completeStepCount - partialStepCount;
  const nextInterpretiveGap = order.find((step) => (visitPointCounts.get(step.id) ?? 0) < 4) ?? null;
'''
new_counts = '''  const completeStepCount = order.filter((step) => (visitPointCounts.get(step.id) ?? 0) >= 4).length;
  const partialStepCount = order.filter((step) => {
    const count = visitPointCounts.get(step.id) ?? 0;
    return count > 0 && count < 4;
  }).length;
  const emptyStepCount = order.length - completeStepCount - partialStepCount;
  const editorialPriority = (step: BlueprintStepRow) => {
    if (["activity", "event", "other"].includes(step.step_kind)) return 3;
    if (["meeting", "arrival", "meal", "hotel", "free_time"].includes(step.step_kind)) return 2;
    return 0;
  };
  const interpretiveSteps = order.filter((step) => editorialPriority(step) > 0);
  const completeInterpretiveStepCount = interpretiveSteps.filter(
    (step) => (visitPointCounts.get(step.id) ?? 0) >= 4,
  ).length;
  const editorialGapCount = interpretiveSteps.length - completeInterpretiveStepCount;
  const nextInterpretiveGap = [...interpretiveSteps]
    .filter((step) => (visitPointCounts.get(step.id) ?? 0) < 4)
    .sort((a, b) => editorialPriority(b) - editorialPriority(a) || a.sequence - b.sequence)[0] ?? null;
  const nextInterpretivePriorityLabel = nextInterpretiveGap
    ? editorialPriority(nextInterpretiveGap) === 3
      ? "Prioridade alta"
      : "Prioridade média"
    : null;
'''
if old_counts not in text:
    raise SystemExit("V3.10 coverage metrics anchor not found")
text = text.replace(old_counts, new_counts, 1)

old_intro = '''            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe a cobertura editorial das etapas antes de publicar a experiência.
            </p>
'''
new_intro = '''            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe a cobertura editorial das etapas que realmente pedem conteúdo interpretativo.
            </p>
            {nextInterpretiveGap && nextInterpretivePriorityLabel ? (
              <p className="mt-2 text-sm font-medium">
                Próxima prioridade: {nextInterpretiveGap.title} · {nextInterpretivePriorityLabel}
              </p>
            ) : null}
'''
if old_intro not in text:
    raise SystemExit("dashboard intro anchor not found")
text = text.replace(old_intro, new_intro, 1)

old_cta = '''                Continuar enriquecimento
'''
new_cta = '''                Enriquecer prioridade
'''
if old_cta not in text:
    raise SystemExit("dashboard CTA anchor not found")
text = text.replace(old_cta, new_cta, 1)

old_footer = '''        <p className="mt-3 text-xs text-muted-foreground">
          {coveredStepCount}/{order.length} etapas possuem ao menos um ponto interpretativo.
        </p>
'''
new_footer = '''        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>{coveredStepCount}/{order.length} etapas possuem ao menos um ponto interpretativo.</p>
          <p>
            {completeInterpretiveStepCount}/{interpretiveSteps.length} etapas editorialmente relevantes estão completas
            {editorialGapCount > 0 ? ` · ${editorialGapCount} ainda pedem enriquecimento` : ""}.
          </p>
          <p>
            Deslocamentos, embarques, desembarques, retornos e pausas não contam como lacunas interpretativas obrigatórias.
          </p>
        </div>
'''
if old_footer not in text:
    raise SystemExit("dashboard footer anchor not found")
text = text.replace(old_footer, new_footer, 1)

path.write_text(text)
