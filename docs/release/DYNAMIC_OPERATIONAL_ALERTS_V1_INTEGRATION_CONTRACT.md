# Integration contract

UI/action supplies: operation_id, alert_type, concise title/body, canonical source_kind/source_id, stable idempotency_key and optional priority. Backend performs authorization, closed-operation guard, content policy, operation audience resolution, recipient creation, in-app delivery and audit.