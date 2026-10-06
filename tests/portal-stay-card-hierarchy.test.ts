import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.stay.tsx"),
  "utf8",
);

describe("traveler stay card hierarchy", () => {
  it("lets property names and multiple status chips stack safely on mobile", () => {
    expect(source).toContain(
      "flex flex-col items-start gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3",
    );
    expect(source).toContain(
      "flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end",
    );
  });
});
