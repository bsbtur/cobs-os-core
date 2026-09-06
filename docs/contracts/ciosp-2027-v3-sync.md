# CIOSP-2027/V3 synchronization

Status: candidate contract content; formal legal validation still required.

## Invariants

1. `CIOSP-2027/V1` is historical and is not overwritten.
2. `CIOSP-2027/V3` starts as `review_required`.
3. Generating a COBS contract is provider-neutral and never sends it for signature.
4. V3 freezes actual order value, human-readable payment plan and accepted offer/program snapshot.
5. Missing contractual commercial evidence fails closed.
6. A database partial unique index prevents concurrent duplicate live contracts for the same order/template version.
7. Clicksign remains a later explicit provider step and may receive the rendered file by upload.
8. No production contract may be sent merely by applying these migrations or deploying `contracts-generate`.
