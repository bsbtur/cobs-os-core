import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.events.tsx"),
  "utf8",
);

describe("traveler completed event density", () => {
  it("de-emphasizes and compacts completed events only on mobile", () => {
    expect(source).toContain("border-border/60 bg-muted/20 opacity-85 !p-3 sm:!p-4");
    expect(source).toContain(
      "mt-2 flex flex-col gap-2 border-t border-border pt-2 sm:mt-3 sm:gap-3 sm:pt-3",
    );
  });
});
