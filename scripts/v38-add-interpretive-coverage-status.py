from pathlib import Path

path = Path("src/routes/_authenticated/blueprints.$blueprintId.tsx")
text = path.read_text()

chip_anchor = '''function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${className}`}
    >
      {children}
    </span>
  );
}
'''
helper = '''function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${className}`}
    >
      {children}
    </span>
  );
}

type InterpretiveCoverage = "empty" | "partial" | "complete";

function interpretiveCoverage(pointCount: number): InterpretiveCoverage {
  if (pointCount === 0) return "empty";
  if (pointCount < 4) return "partial";
  return "complete";
}

function interpretiveCoverageLabel(pointCount: number) {
  const coverage = interpretiveCoverage(pointCount);
  if (coverage === "empty") return "Sem conteúdo";
  if (coverage === "partial") return "Parcial";
  return "Completa";
}

function interpretiveCoverageClass(pointCount: number) {
  const coverage = interpretiveCoverage(pointCount);
  if (coverage === "complete") return "bg-primary-soft text-primary";
  if (coverage === "partial") return "bg-warning-soft text-warning";
  return "border border-border text-muted-foreground";
}
'''
if "function interpretiveCoverage(" not in text:
    if chip_anchor not in text:
        raise SystemExit("chip anchor not found")
    text = text.replace(chip_anchor, helper, 1)

old_draft_total = '''  const visitPointTotal = order.reduce(
    (total, step) => total + (visitPointCounts.get(step.id) ?? 0),
    0,
  );
'''
new_draft_total = '''  const visitPointTotal = order.reduce(
    (total, step) => total + (visitPointCounts.get(step.id) ?? 0),
    0,
  );
  const coveredStepCount = order.filter((step) => (visitPointCounts.get(step.id) ?? 0) > 0).length;
'''
if old_draft_total in text and "const coveredStepCount = order.filter" not in text:
    text = text.replace(old_draft_total, new_draft_total, 1)

old_draft_chip = '''          <Chip className="border border-border text-muted-foreground">
            <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
            {visitPointTotal}{" "}
            {visitPointTotal === 1 ? "ponto interpretativo" : "pontos interpretativos"}
          </Chip>
'''
new_draft_chip = '''          <Chip className="border border-border text-muted-foreground">
            <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
            {visitPointTotal}{" "}
            {visitPointTotal === 1 ? "ponto interpretativo" : "pontos interpretativos"}
          </Chip>
          <Chip className="border border-border text-muted-foreground">
            {coveredStepCount}/{order.length} etapas com conteúdo
          </Chip>
'''
if old_draft_chip in text and "etapas com conteúdo" not in text:
    text = text.replace(old_draft_chip, new_draft_chip, 1)

old_step_chip = '''                    <Chip
                      className={
                        (visitPointCounts.get(step.id) ?? 0) > 0
                          ? "bg-primary-soft text-primary"
                          : "border border-border text-muted-foreground"
                      }
                    >
                      <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
                      {visitPointCounts.get(step.id) ?? 0} pontos
                    </Chip>
'''
new_step_chip = '''                    <Chip className={interpretiveCoverageClass(visitPointCounts.get(step.id) ?? 0)}>
                      <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
                      {visitPointCounts.get(step.id) ?? 0} pontos · {interpretiveCoverageLabel(visitPointCounts.get(step.id) ?? 0)}
                    </Chip>
'''
if old_step_chip in text:
    text = text.replace(old_step_chip, new_step_chip, 1)

old_published_total = '''  const visitPointTotal = steps.reduce(
    (total, step) => total + (visitPointCounts.get(step.id) ?? 0),
    0,
  );
'''
new_published_total = '''  const visitPointTotal = steps.reduce(
    (total, step) => total + (visitPointCounts.get(step.id) ?? 0),
    0,
  );
  const coveredStepCount = steps.filter((step) => (visitPointCounts.get(step.id) ?? 0) > 0).length;
'''
# Replace only the second occurrence if published helper is not already present there.
parts = text.split(old_published_total)
if len(parts) >= 3 and "const coveredStepCount = steps.filter" not in text:
    text = old_published_total.join(parts[:2]) + new_published_total + old_published_total.join(parts[2:])
elif len(parts) == 2 and "function PublishedVersionCard" in text and "const coveredStepCount = steps.filter" not in text:
    text = text.replace(old_published_total, new_published_total, 1)

old_published_chip = '''          <Chip className="border border-border text-muted-foreground">
            <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
            {visitPointTotal} pontos
          </Chip>
'''
new_published_chip = '''          <Chip className="border border-border text-muted-foreground">
            <Lightbulb className="mr-1 size-3.5" aria-hidden="true" />
            {visitPointTotal} pontos
          </Chip>
          <Chip className="border border-border text-muted-foreground">
            {coveredStepCount}/{steps.length} etapas com conteúdo
          </Chip>
'''
if old_published_chip in text:
    text = text.replace(old_published_chip, new_published_chip, 1)

old_published_step = '''                <span className="inline-flex items-center gap-1">
                  <Lightbulb className="size-3.5" aria-hidden="true" />
                  {visitPointCounts.get(step.id) ?? 0} pontos
                </span>
'''
new_published_step = '''                <span className="inline-flex items-center gap-1">
                  <Lightbulb className="size-3.5" aria-hidden="true" />
                  {visitPointCounts.get(step.id) ?? 0} pontos · {interpretiveCoverageLabel(visitPointCounts.get(step.id) ?? 0)}
                </span>
'''
if old_published_step in text:
    text = text.replace(old_published_step, new_published_step, 1)

path.write_text(text)
