import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/20260907120000_ciosp_2027_official_journey_v1.sql",
  "utf8",
);

const insertedJourneyPayload = sql.slice(sql.indexOf("insert into public.journey_steps"));

describe("CIOSP 2027 official Journey v1", () => {
  test("registers only the four official scientific-programme days", () => {
    for (const day of ["2027-01-27", "2027-01-28", "2027-01-29", "2027-01-30"])
      expect(sql).toContain(day);
    expect(sql).toContain("10:00:00-03");
    expect(sql).toContain("18:00:00-03");
    expect(sql).toContain("Expo Center Norte");
    expect(sql).toContain("awaiting_official_detailed_programme");
  });

  test("does not invent BSBTUR operational commitments in Journey data", () => {
    expect(insertedJourneyPayload).not.toMatch(
      /voo|hotel|hospedagem|transfer bsbtur|refei[cç][aã]o/i,
    );
  });

  test("is idempotent by official source and date", () => {
    expect(sql).toContain("source_key");
    expect(sql).toContain("official_date");
    expect(sql).toContain("if not exists");
  });
});
