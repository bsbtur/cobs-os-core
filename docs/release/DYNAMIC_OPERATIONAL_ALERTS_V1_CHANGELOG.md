# Changelog

After PR #95 merged the initial publisher, controlled production QA added an explicit `auth.uid()` requirement. This closes the SECURITY DEFINER null-auth boundary before any UI integration. The hardening is deployed in production and must be synchronized to main by the follow-up PR.