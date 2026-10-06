import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.messages.tsx"),
  "utf8",
);

describe("traveler message priority", () => {
  it("surfaces important and urgent priorities without adding noise to normal notices", () => {
    expect(source).toContain('m.priority === "urgent"');
    expect(source).toContain('m.priority === "important"');
    expect(source).toContain('t("w10.messages.priorityUrgent")');
    expect(source).toContain('t("w10.messages.priorityImportant")');
    expect(source).not.toContain('m.priority === "normal" ?');
  });
});
