import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source=readFileSync("supabase/migrations/20261006170000_team_seffrin_three_lot_ladder.sql","utf8");

describe("Team Seffrin commercial lot ladder",()=>{
  test("defines the 5 + 5 + 10 inventory ladder",()=>{
    expect(source).toContain("1,'1º Lote — Fundadores'");
    expect(source).toContain("2,'2º Lote'");
    expect(source).toContain("3,'3º Lote — Final'");
    expect(source).toContain("999700");
    expect(source).toContain("1029700");
    expect(source).toContain("1049700");
  });

  test("serializes lot selection across concurrent checkouts",()=>{
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("resolve_operation_commercial_lot");
  });

  test("counts live reservations before opening the next lot",()=>{
    expect(source).toContain("r.status='confirmed'");
    expect(source).toContain("r.status='reserved' and r.expires_at>now()");
    expect(source).toContain("All commercial lots are sold out");
  });

  test("snapshots lot identity and price into the order",()=>{
    expect(source).toContain("commercial_lot_number");
    expect(source).toContain("commercial_lot_label");
    expect(source).toContain("balance_minor");
  });
});
