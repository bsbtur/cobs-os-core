import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.journey.tsx"),
  "utf8",
);

describe("traveler journey card interaction", () => {
  it("keeps a single expanded step controlled by expandedStepId", () => {
    expect(source).toContain('const [expandedStepId, setExpandedStepId] = useState<string | null>(null)');
    expect(source).toContain('const expanded = expandedStepId === step.stepId');
    expect(source).toContain('setExpandedStepId(stepId)');
  });

  it("auto-opens the spotlight only once without forcing scroll", () => {
    expect(source).toContain('const hasInitializedExpansion = useRef(false)');
    expect(source).toContain('if (hasInitializedExpansion.current || journey.isLoading || journey.error) return');
    expect(source).toContain('setExpandedStepId(spotlightStep.stepId)');
    expect(source).not.toContain('spotlightStep.stepId).scrollIntoView');
  });

  it("scrolls only on manual open and respects reduced motion", () => {
    expect(source).toContain('handleStepToggle(step.stepId, expanded)');
    expect(source).toContain('window.requestAnimationFrame');
    expect(source).toContain('prefers-reduced-motion: reduce');
    expect(source).toContain('behavior: reduceMotion ? "auto" : "smooth"');
    expect(source).toContain('block: "nearest"');
    expect(source).toContain('scroll-mt-24');
  });
});
