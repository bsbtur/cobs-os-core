import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentEnvironment, orderEnvironmentMatches, recordEnvironmentMatches, paymentPlan } from "../supabase/functions/_shared/ciosp-payment-policy.ts";

const schedule = [
  { installment_number: 1, kind: "entry", amount_minor: 349000, due_rule: "at_contract" },
  { installment_number: 2, kind: "installment", amount_minor: 300000, due_date: "2026-10-10" },
  { installment_number: 3, kind: "installment", amount_minor: 300000, due_date: "2026-11-10" },
  { installment_number: 4, kind: "installment", amount_minor: 300000, due_date: "2026-12-10" },
];
const before = new Date("2026-09-04T12:00:00Z");

test("requires an explicit environment and rejects legacy or mixed orders", () => {
  for (const value of [undefined, null, "", "prod", "TEST"]) assert.equal(paymentEnvironment(value), null);
  assert.equal(paymentEnvironment("production"), "production");
  assert.equal(orderEnvironmentMatches({}, "production"), false);
  assert.equal(orderEnvironmentMatches({ payment_environment: "production", qa_public_checkout: true }, "production"), false);
  assert.equal(orderEnvironmentMatches({ payment_environment: "production", qa_environment: "test" }, "production"), false);
  assert.equal(orderEnvironmentMatches({ payment_environment: "test", qa_public_checkout: true }, "production"), false);
  assert.equal(orderEnvironmentMatches({ payment_environment: "test" }, "test"), false);
  assert.equal(orderEnvironmentMatches({ payment_environment: "test", qa_public_checkout: true }, "test"), true);
  assert.equal(orderEnvironmentMatches({ payment_environment: "production" }, "production"), true);
  assert.equal(recordEnvironmentMatches({ environment: "test" }, "production"), false);
  assert.equal(recordEnvironmentMatches(null, "production"), false);
});

test("collects four obligations without charging the full balance after entry", () => {
  for (const [paid, amount, installment] of [[0,349000,1],[349000,300000,2],[649000,300000,3],[949000,300000,4]]) {
    const result = paymentPlan(schedule,1249000,paid,before);
    assert.equal(result.amount_minor,amount);
    assert.equal(result.next?.installment_number,installment);
  }
  assert.equal(paymentPlan(schedule,1249000,1249000,before).next,null);
  assert.equal(paymentPlan(schedule,1249000,1300000,before).amount_minor,0);
});

test("collects entry and past-due installments for a late purchase", () => {
  const result=paymentPlan(schedule,1249000,0,new Date("2026-10-20T12:00:00Z"));
  assert.equal(result.amount_minor,649000);
  assert.deepEqual(result.covered_installments,[1,2]);
  assert.equal(paymentPlan(schedule,1249000,649000,new Date("2026-10-20T12:00:00Z")).amount_minor,300000);
});

test("does not advance the business date at UTC midnight", () => {
  assert.equal(paymentPlan(schedule,1249000,0,new Date("2026-10-11T01:00:00Z")).amount_minor,349000);
  assert.equal(paymentPlan(schedule,1249000,0,new Date("2026-10-11T03:00:00Z")).amount_minor,649000);
});

test("handles partial payments and recomputed net paid after reversal", () => {
  assert.equal(paymentPlan(schedule,1249000,100000,before).amount_minor,249000);
  assert.equal(paymentPlan(schedule,1249000,449000,before).amount_minor,200000);
  assert.equal(paymentPlan(schedule,1249000,349000,before).amount_minor,300000);
});

test("rejects invalid or reordered obligations and mismatched totals", () => {
  assert.throws(()=>paymentPlan(schedule,999000,0,before));
  assert.throws(()=>paymentPlan([...schedule].reverse(),1249000,0,before));
  assert.throws(()=>paymentPlan([schedule[0],schedule[0],schedule[2],schedule[3]],1249000,0,before));
  assert.throws(()=>paymentPlan(schedule,1249000,-1,before));
  assert.throws(()=>paymentPlan(schedule,1249000,0.5,before));
  assert.throws(()=>paymentPlan([schedule[0],{...schedule[1],due_date:"2026-02-30"},schedule[2],schedule[3]],1249000,0,before));
});
