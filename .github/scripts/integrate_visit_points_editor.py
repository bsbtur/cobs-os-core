from pathlib import Path

path = Path("src/routes/_authenticated/operations.$operationId.journey.tsx")
text = path.read_text()

anchor = 'import { PanelSkeleton } from "@/components/feedback/loading";\n'
line = 'import { VisitPointsEditor } from "@/components/journey/visit-points-editor";\n'
if line not in text:
    if anchor not in text:
        raise SystemExit("import anchor missing")
    text = text.replace(anchor, anchor + line, 1)

playbook = '''              <PlaybookEditor
                step={step}
                items={items.filter((item) => item.journey_step_id === step.id)}
                roleTypes={roleTypes}
                operationId={operationId}
                operationClosed={operationClosed}
              />'''
addition = playbook + '''
              <VisitPointsEditor
                operationId={operationId}
                journeyStepId={step.id}
                editable={baselineOpen && !operationClosed}
              />'''
if '<VisitPointsEditor' not in text:
    if playbook not in text:
        raise SystemExit("playbook anchor missing")
    text = text.replace(playbook, addition, 1)

path.write_text(text)
