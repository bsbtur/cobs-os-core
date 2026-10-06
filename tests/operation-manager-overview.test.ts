import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/operations.$operationId.index.tsx"),
  "utf8",
);

describe("operation manager overview", () => {
  it("surfaces the five core management areas from the overview", () => {
    for (const route of [
      "/operations/$operationId/people",
      "/operations/$operationId/journey",
      "/operations/$operationId/mobility",
      "/operations/$operationId/hospitality",
      "/operations/$operationId/communication",
    ]) {
      expect(source).toContain(route);
    }
  });

  it("keeps the summary explicitly operational and payment-free", () => {
    expect(source).toContain("Resumo operacional");
    expect(source).not.toContain("/operations/$operationId/payments");
  });
});
