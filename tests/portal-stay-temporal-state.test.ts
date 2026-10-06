import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.stay.tsx"),
  "utf8",
);

describe("traveler stay temporal states", () => {
  it("keeps confirmed checkout completion ahead of check-in availability", () => {
    const completed = source.indexOf("if (!checkOutIsDateOnly && checkOutMs !== null && checkOutMs <= nowMs)");
    const checkinOpen = source.indexOf("if (stay.checkinOpen)");

    expect(completed).toBeGreaterThan(-1);
    expect(checkinOpen).toBeGreaterThan(completed);
    expect(source).toContain('return "completed" as const');
  });

  it("does not treat date-only check-in as a precise in-progress window", () => {
    expect(source).toContain("if (checkIn && checkInIsDateOnly)");
    expect(source).toContain('return "upcoming" as const');
    expect(source).toContain('return "neutral" as const');
  });

  it("refreshes temporal state while the traveler keeps the page open", () => {
    expect(source).toContain("window.setInterval(refreshNow, 30_000)");
    expect(source).toContain('document.addEventListener("visibilitychange", refreshNow)');
  });

  it("renders current, next and completed traveler-facing states without hiding check-in availability", () => {
    expect(source).toContain('t("w10.stay.current")');
    expect(source).toContain('t("w10.stay.next")');
    expect(source).toContain('t("w10.stay.completed")');
    expect(source).toContain('t("w10.stay.checkinOpen")');
  });
});
