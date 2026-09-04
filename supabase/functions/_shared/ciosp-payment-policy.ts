export type PaymentEnvironment = "test" | "production";

export function paymentEnvironment(value: unknown): PaymentEnvironment | null {
  return value === "test" || value === "production" ? value : null;
}

export function orderEnvironmentMatches(metadata: Record<string, unknown>, environment: PaymentEnvironment) {
  if (metadata.payment_environment !== environment) return false;
  if (environment === "production") {
    return metadata.qa_public_checkout !== true && metadata.qa_environment !== "test";
  }
  return metadata.qa_public_checkout === true;
}

export function recordEnvironmentMatches(metadata: Record<string, unknown> | null | undefined, environment: PaymentEnvironment) {
  return metadata?.environment === environment;
}

export type Installment = { installment_number: number; kind: string; amount_minor: number; due_date?: string; due_rule?: string };

export function paymentPlan(value: unknown, total: number, paid: number, now = new Date()) {
  if (!Array.isArray(value) || value.length !== 4 || !Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(paid) || paid < 0) throw new Error("payment_schedule_invalid");
  const schedule = value as Installment[];
  let lastDate = "";
  for (const [index, item] of schedule.entries()) {
    if (!item || item.installment_number !== index + 1 || !Number.isSafeInteger(item.amount_minor) || item.amount_minor <= 0) throw new Error("payment_schedule_invalid");
    if (index === 0) {
      if (item.kind !== "entry" || item.due_rule !== "at_contract") throw new Error("payment_schedule_invalid");
    } else {
      const date = item.due_date;
      if (item.kind !== "installment" || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date <= lastDate) throw new Error("payment_schedule_invalid");
      lastDate = date;
    }
  }
  if (schedule.reduce((sum, item) => sum + item.amount_minor, 0) !== total) throw new Error("payment_schedule_total_mismatch");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  let allocated = paid;
  const obligations = schedule.map((item) => {
    const applied = Math.min(allocated, item.amount_minor);
    allocated -= applied;
    return { ...item, paid_minor: applied, outstanding_minor: item.amount_minor - applied };
  });
  const next = obligations.find((item) => item.outstanding_minor > 0);
  if (!next) return { obligations, next: null, amount_minor: 0, covered_installments: [] as number[] };
  const covered = obligations.filter((item) => item.outstanding_minor > 0 && (item.installment_number === next.installment_number || Boolean(item.due_date && item.due_date < today)));
  return { obligations, next, amount_minor: covered.reduce((sum, item) => sum + item.outstanding_minor, 0), covered_installments: covered.map((item) => item.installment_number) };
}
