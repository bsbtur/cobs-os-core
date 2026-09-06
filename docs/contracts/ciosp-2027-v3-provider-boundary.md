# Provider boundary

The signature-provider step is explicitly downstream of generation. `contracts-generate` must not create envelopes, upload documents, activate envelopes or send notifications. Those actions remain in the separately authorized Clicksign send adapter.
