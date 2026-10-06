import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.stay.tsx"),
  "utf8",
);

describe("traveler stay mobile hierarchy", () => {
  it("stacks the property title and status chips on small screens", () => {
    expect(source).toContain("flex flex-col gap-3 sm:grid");
    expect(source).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(source).toContain("w-full flex-wrap items-center gap-2 sm:w-auto");
  });
});
