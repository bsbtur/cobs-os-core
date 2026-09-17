# Evidence packet

Record only non-secret evidence:

- gate key/status timestamps;
- fixture order id;
- charge id and amount 100 minor;
- attempt id and provider status;
- provider order/payment identifiers where safe;
- webhook processing status/timestamps;
- financial fact id/type/amount;
- retry result proving no second payment;
- final gate retirement state.

Never record access tokens, webhook secrets, checkout tokens, QR payloads after the test, or service-role credentials in GitHub.
