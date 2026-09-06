# Rollback semantics

V1 is preserved. V3 is additive and starts inactive (`review_required`). Before activation, rollback is operationally simple: stop using V3 and revert code/migrations through the normal repository-controlled path; no customer contract is created merely by deployment.
