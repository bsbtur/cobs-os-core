import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.journey.tsx"),
  "utf8",
);

describe("traveler journey timeline hierarchy", () => {
  it("renders state-aware connectors instead of one uniform timeline rail", () => {
    expect(source).not.toContain('border-l border-border');
    expect(source).toContain('connectorClass');
    expect(source).toContain('bg-primary/30');
    expect(source).toContain('bg-gradient-to-b from-primary/50 to-border');
  });

  it("gives now, next, completed and future markers distinct visual weight", () => {
    expect(source).toContain('markerClass');
    expect(source).toContain('h-5 w-5');
    expect(source).toContain('h-4 w-4');
    expect(source).toContain('h-3 w-3');
    expect(source).toContain('bg-muted-foreground/45');
  });

  it("keeps card emphasis aligned with temporal state", () => {
    expect(source).toContain('cardStateClass');
    expect(source).toContain('border-primary/40 ring-1 ring-primary/10');
    expect(source).toContain('border-primary/25');
    expect(source).toContain('border-border/60 opacity-90');
  });
});
