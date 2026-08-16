from pathlib import Path

path = Path("src/routes/_authenticated/operations.$operationId.cockpit-v2.tsx")
text = path.read_text()

import_anchor = 'import { LiveTimingStrip } from "@/components/journey/live-timing-strip";\n'
import_line = 'import { VisitPointsPanel } from "@/components/journey/visit-points-panel";\n'
if import_line not in text:
    if import_anchor not in text:
        raise SystemExit("timing import anchor missing")
    text = text.replace(import_anchor, import_anchor + import_line, 1)

panel = '''\n      {current ? (\n        <VisitPointsPanel\n          operationId={operationId}\n          journeyStepId={current.id}\n          canOperate={operation.status === "active"}\n        />\n      ) : null}\n'''
anchor = '\n      <div className="grid grid-cols-2 gap-3">\n'
if '<VisitPointsPanel' not in text:
    if anchor not in text:
        raise SystemExit("cockpit grid anchor missing")
    text = text.replace(anchor, panel + anchor, 1)

path.write_text(text)
