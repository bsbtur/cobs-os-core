import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.messages.tsx"),
  "utf8",
);

describe("traveler cancelled notice density", () => {
  it("de-emphasizes cancelled notices without hiding their content", () => {
    expect(source).toContain('m.status === "cancelled"');
    expect(source).toContain("border-border/60 bg-muted/20 opacity-80 !p-3 sm:!p-4");
  });

  it("lets title and status badges stack safely on mobile", () => {
    expect(source).toContain(
      "flex flex-col items-start gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3",
    );
    expect(source).toContain(
      "flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end",
    );
  });
});
