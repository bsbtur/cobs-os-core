import { describe, expect, test } from "bun:test";

import { REGIONAL_PRESETS } from "@/lib/i18n";
import { W01_PT } from "@/lib/i18n-w01";
import { W02_PT } from "@/lib/i18n-w02";
import { W03_PT } from "@/lib/i18n-w03";
import { W04_PT } from "@/lib/i18n-w04";
import { W05_PT } from "@/lib/i18n-w05";
import { W06_DICTIONARIES } from "@/lib/i18n-w06";
import { W07_PT } from "@/lib/i18n-w07";
import { W08_DICTIONARIES } from "@/lib/i18n-w08";
import { W09_DICTIONARIES } from "@/lib/i18n-w09";
import { W10_DICTIONARIES } from "@/lib/i18n-w10";
import { W11_PT, W11_ES } from "@/lib/i18n-w11";
import { ACCESS_DICTIONARIES } from "@/lib/i18n-access";
import { BLUEPRINT_PT } from "@/lib/i18n-blueprints";
import { W01_ES_FULL } from "@/lib/i18n-es-w01";
import { W02_ES } from "@/lib/i18n-es-w02";
import { W03_ES } from "@/lib/i18n-es-w03";
import { W04_ES } from "@/lib/i18n-es-w04";
import { W05_ES } from "@/lib/i18n-es-w05";
import { W07_ES_FULL } from "@/lib/i18n-es-w07";
import { BLUEPRINT_ES_FULL } from "@/lib/i18n-es-blueprints";
import {
  W02_ES_CORE_DELTA,
  W04_ES_CORE_DELTA,
  W05_ES_CORE_DELTA,
} from "@/lib/i18n-es-core-delta";
import { formatDateTime, formatMoney, formatNumber, formatTime } from "@/lib/format";

const INSTANT = "2026-01-15T15:30:00.000Z";

function expectSameKeys(reference: Record<string, string>, translated: Record<string, string>) {
  expect(Object.keys(translated).sort()).toEqual(Object.keys(reference).sort());
}

describe("International Readiness V1 · regional context", () => {
  test("locale, timezone and currency are independent", () => {
    expect(REGIONAL_PRESETS.BR).toEqual({ locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" });
    expect(REGIONAL_PRESETS.US).toEqual({ locale: "en-US", timeZone: "America/New_York", currency: "USD" });
    expect(REGIONAL_PRESETS.ES).toEqual({ locale: "es-ES", timeZone: "Europe/Madrid", currency: "EUR" });
  });

  test("same instant renders in each operational timezone", () => {
    expect(formatTime(INSTANT, REGIONAL_PRESETS.BR)).toContain("12:30");
    expect(formatTime(INSTANT, REGIONAL_PRESETS.US)).toMatch(/10:30/);
    expect(formatTime(INSTANT, REGIONAL_PRESETS.ES)).toContain("16:30");
  });

  test("date-time rendering follows locale and timezone", () => {
    const br = formatDateTime(INSTANT, REGIONAL_PRESETS.BR);
    const us = formatDateTime(INSTANT, REGIONAL_PRESETS.US);
    const es = formatDateTime(INSTANT, REGIONAL_PRESETS.ES);
    expect(br).not.toBe(us);
    expect(us).not.toBe(es);
    expect(br).not.toBe(es);
  });

  test("money uses explicit currency", () => {
    const br = formatMoney(123456, REGIONAL_PRESETS.BR);
    const us = formatMoney(123456, REGIONAL_PRESETS.US);
    const es = formatMoney(123456, REGIONAL_PRESETS.ES);
    expect(br).toContain("R$");
    expect(us).toContain("$");
    expect(es).toContain("€");
  });

  test("number separators follow locale", () => {
    const br = formatNumber(12345.67, REGIONAL_PRESETS.BR);
    const us = formatNumber(12345.67, REGIONAL_PRESETS.US);
    const es = formatNumber(12345.67, REGIONAL_PRESETS.ES);
    expect(br).not.toBe(us);
    expect(us).not.toBe(es);
    expect(br).toContain(",");
    expect(us).toContain(".");
    expect(es).toContain(",");
  });
});

describe("International Readiness V1 · Spanish key coverage", () => {
  test("W01 parity", () => expectSameKeys(W01_PT, W01_ES_FULL));
  test("W02 parity", () => expectSameKeys(W02_PT, { ...W02_ES, ...W02_ES_CORE_DELTA }));
  test("W03 parity", () => expectSameKeys(W03_PT, W03_ES));
  test("W04 parity", () => expectSameKeys(W04_PT, { ...W04_ES, ...W04_ES_CORE_DELTA }));
  test("W05 parity", () => expectSameKeys(W05_PT, { ...W05_ES, ...W05_ES_CORE_DELTA }));
  test("W06 parity", () => expectSameKeys(W06_DICTIONARIES["pt-BR"], W06_DICTIONARIES["es-ES"]));
  test("W07 parity", () => expectSameKeys(W07_PT, W07_ES_FULL));
  test("W08 parity", () => expectSameKeys(W08_DICTIONARIES["pt-BR"], W08_DICTIONARIES["es-ES"]));
  test("W09 parity", () => expectSameKeys(W09_DICTIONARIES["pt-BR"], W09_DICTIONARIES["es-ES"]));
  test("W10 parity", () => expectSameKeys(W10_DICTIONARIES["pt-BR"], W10_DICTIONARIES["es-ES"]));
  test("W11 parity", () => expectSameKeys(W11_PT, W11_ES));
  test("Access parity", () => expectSameKeys(ACCESS_DICTIONARIES["pt-BR"], ACCESS_DICTIONARIES["es-ES"]));
  test("Blueprint parity", () => expectSameKeys(BLUEPRINT_PT, BLUEPRINT_ES_FULL));
});