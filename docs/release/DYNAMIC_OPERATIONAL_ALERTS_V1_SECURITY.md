# Publisher boundary

`publish_dynamic_operational_alert` is SECURITY DEFINER but explicitly requires `auth.uid()` and an active tenant membership with role owner/admin/operations_agent. A grant-only traveler cannot publish. Anonymous/null-auth cannot publish. Audience resolution remains operation-scoped through W08.