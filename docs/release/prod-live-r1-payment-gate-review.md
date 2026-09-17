# Review checklist — PROD LIVE R$1

- [ ] Diff contains no secret values.
- [ ] Locked revision contains no Mercado Pago production API call.
- [ ] Locked revision contains no payment charge/attempt insert.
- [ ] Amount constraint is exactly 100 minor units.
- [ ] Environment constraint is production.
- [ ] Provider/method constraints are Mercado Pago/PIX.
- [ ] Browser roles cannot access private gate state.
- [ ] Gate lifecycle is locked -> authorized -> consumed/retired.
- [ ] CIOSP price/schedule/public-sales files are untouched.
- [ ] CI passes before merge/deploy.
- [ ] Unlock/provider-call remains a separate explicit checkpoint.
