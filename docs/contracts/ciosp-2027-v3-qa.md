# STAGING proof for CIOSP-2027/V3

After Quality Gate and merge:

1. Apply additive migrations to STAGING only.
2. Keep V3 `review_required`; do not fake legal approval.
3. Use QA-only order/person data with frozen `payment_plan_display` and `offer_snapshot`.
4. Verify missing evidence fails closed.
5. Verify two generation requests converge to one live contract.
6. Inspect snapshot v2 variables and rendered draft.
7. Do not send to Clicksign until a separate sandbox-send test is explicitly entered.
8. Do not deploy/activate in CLEAN based solely on STAGING generation proof.
