# Meta WhatsApp webhook ingress

Public Supabase Edge Function used as the Meta WhatsApp callback endpoint.

Required secrets are runtime-only and must never be committed:

- `META_WHATSAPP_VERIFY_TOKEN` — shared only between Meta and the Edge Function for the GET verification handshake.
- `META_APP_SECRET` — Meta App Secret used to validate `X-Hub-Signature-256` on POST deliveries.
- `N8N_WHATSAPP_WEBHOOK_URL` — private n8n ingress URL.
- `COBS_N8N_WHATSAPP_TOKEN` — internal shared token from this ingress to n8n.

Behavior:

- GET implements Meta's `hub.mode`, `hub.verify_token`, `hub.challenge` verification flow.
- POST fails closed unless all runtime secrets are configured.
- POST verifies the Meta HMAC SHA-256 signature before forwarding the unchanged JSON body to n8n.
- No database writes, orders, payments, memberships or production messages are created by this function.
