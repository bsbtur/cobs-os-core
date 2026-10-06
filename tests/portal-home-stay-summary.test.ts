import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.index.tsx"),
  "utf8",
);

describe("traveler home stay summary", () => {
  it("prioritizes current stay, then upcoming stay, before falling back", () => {
    const current = source.indexOf('stateFor(stay) === "current"');
    const upcoming = source.indexOf('stateFor(stay) === "upcoming"');
    const fallback = source.indexOf("stays[0] ??");

    expect(current).toBeGreaterThan(-1);
    expect(upcoming).toBeGreaterThan(current);
    expect(fallback).toBeGreaterThan(upcoming);
  });

  it("keeps confirmed checkout completion ahead of check-in availability", () => {
    const completed = source.indexOf("const completed =");
    const checkinOpen = source.indexOf("if (stay.checkinOpen)");

    expect(completed).toBeGreaterThan(-1);
    expect(checkinOpen).toBeGreaterThan(completed);
  });

  it("uses the selected relevant stay for property and room summary", () => {
    expect(source).toContain("const homeStay = selectHomeStay(stays, nowMs, timeZone)");
    expect(source).toContain("homeStay?.myRoom.find((room) => room.active)");
    expect(source).toContain("homeStay.property?.name ?? homeStay.name");
  });
});
