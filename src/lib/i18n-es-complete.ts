import { W01_ES_FULL } from "./i18n-es-w01";
import { W02_ES } from "./i18n-es-w02";
import { W03_ES } from "./i18n-es-w03";
import { W04_ES } from "./i18n-es-w04";
import { W05_ES } from "./i18n-es-w05";
import { W07_ES_FULL } from "./i18n-es-w07";
import { BLUEPRINT_ES_FULL } from "./i18n-es-blueprints";

/**
 * International Readiness V1 — compatibility overlay for legacy workflow
 * dictionaries that historically pointed es-ES to English or used partial
 * English inheritance. Applied LAST by i18n.tsx so every translated V1 key
 * wins without changing domain contracts.
 */
export const ES_COMPLETE_V1: Record<string, string> = {
  ...W01_ES_FULL,
  ...W02_ES,
  ...W03_ES,
  ...W04_ES,
  ...W05_ES,
  ...W07_ES_FULL,
  ...BLUEPRINT_ES_FULL,
  "role.tour_guide": "Guía de turismo",
};