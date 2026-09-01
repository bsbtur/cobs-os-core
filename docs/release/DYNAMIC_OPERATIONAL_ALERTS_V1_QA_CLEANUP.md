# QA cleanup

All message-creating validation calls used explicit BEGIN/ROLLBACK transactions. Final query confirmed zero messages with QA dynamic-alert idempotency keys persisted.