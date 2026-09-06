# Security boundary

`contracts-generate` requires an authenticated active tenant member with owner/admin/operations_agent role. It reads canonical commerce/party/operation sources with the service client only after authorization. It creates a draft plus deterministic audit event and returns `ready_for_provider_send: false`.

V3 adds fail-closed requirements for frozen payment-plan and offer evidence. Provider credentials are not read and provider APIs are not called by this function.
