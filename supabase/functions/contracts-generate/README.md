# contracts-generate

Generates a provider-neutral immutable contract draft. It never sends a document to Clicksign.

## CIOSP-2027/V3 commercial evidence

For V3, the order must already contain frozen commercial evidence in `orders.metadata`:

- `payment_plan_display`: customer-readable payment schedule frozen at checkout/order confirmation.
- `offer_snapshot`: JSON object identifying the offer/program version accepted by the customer. It should include stable IDs/version/timestamps and may include a hash when the offer renderer provides one.
- `privacy_policy_version` (optional): version accepted at contracting time.

The generator deliberately fails closed if payment plan or offer snapshot is missing. It does not reconstruct contractual promises from mutable current catalog data.

## Money

The canonical monetary value remains `grand_total_minor`. The generated contract variables additionally freeze:

- `grand_total_formatted` (for example `R$ 12.490,00`)
- `grand_total_in_words` (for example `doze mil quatrocentos e noventa reais`)

## Provider boundary

`contract_templates` can be legally active without `provider_template_id`. Provider configuration belongs to the later explicit send step. Current Clicksign integration may upload the rendered document rather than making Clicksign the canonical contract renderer.
