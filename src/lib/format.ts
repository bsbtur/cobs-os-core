import { DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "./i18n";

/**
 * Global-first formatting utilities.
 * Every formatter takes explicit locale / timeZone / currency — no implicit host defaults.
 */

export type FormatContext = {
  locale?: string;
  timeZone?: string;
  currency?: string;
};

export function formatDate(value: Date | string | number, ctx: FormatContext = {}) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(ctx.locale ?? DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeZone: ctx.timeZone ?? DEFAULT_TIMEZONE,
  }).format(date);
}

export function formatDateTime(value: Date | string | number, ctx: FormatContext = {}) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(ctx.locale ?? DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ctx.timeZone ?? DEFAULT_TIMEZONE,
  }).format(date);
}

export function formatTime(value: Date | string | number, ctx: FormatContext = {}) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(ctx.locale ?? DEFAULT_LOCALE, {
    timeStyle: "short",
    timeZone: ctx.timeZone ?? DEFAULT_TIMEZONE,
  }).format(date);
}

export function formatNumber(
  value: number,
  ctx: FormatContext = {},
  options: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat(ctx.locale ?? DEFAULT_LOCALE, options).format(value);
}

/** Money is always minor units (integer cents) in, formatted string out. */
export function formatMoney(minorUnits: number, ctx: FormatContext = {}) {
  const currency = ctx.currency ?? DEFAULT_CURRENCY;
  return new Intl.NumberFormat(ctx.locale ?? DEFAULT_LOCALE, {
    style: "currency",
    currency,
  }).format(minorUnits / 100);
}

export function formatPercent(ratio: number, ctx: FormatContext = {}) {
  return new Intl.NumberFormat(ctx.locale ?? DEFAULT_LOCALE, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio);
}

export function formatRelative(value: Date | string | number, ctx: FormatContext = {}) {
  const date = value instanceof Date ? value : new Date(value);
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  const rtf = new Intl.RelativeTimeFormat(ctx.locale ?? DEFAULT_LOCALE, { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds || unit === "second") {
      return rtf.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return rtf.format(0, "second");
}

export function formatTimeZoneLabel(timeZone: string = DEFAULT_TIMEZONE, locale = DEFAULT_LOCALE) {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}
