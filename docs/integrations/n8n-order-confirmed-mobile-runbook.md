# COBS OS → n8n · ORDER CONFIRMED V1 · Mobile Runbook

Objetivo: permitir fechar o workflow pelo celular com o mínimo de cliques e sem recriar credenciais.

## Regra de escopo

- Não usar IA neste workflow V1.
- Não enviar WhatsApp/e-mail ainda.
- Não alterar pagamento, pedido, reserva ou participante.
- Reaproveitar as credenciais já existentes no workflow `COBS — LEAD COMERCIAL V1`.
- Só publicar depois que o teste manual do webhook e o callback passarem.

## Estrutura final

Webhook → Code: Validar evento → Code: Montar callback → HTTP Request: Callback COBS

O node `Message a model` da cópia do lead deve ser removido ou desconectado. Para `order.confirmed`, regra determinística resolve melhor e custa menos execuções/tokens.

## 1. Duplicar workflow existente

Duplicar `COBS — LEAD COMERCIAL V1` e renomear:

`COBS — ORDER CONFIRMED V1`

Não publicar ainda.

## 2. Webhook

Path:

`cobs-order-confirmed-v1`

Método: `POST`.

Preservar a autenticação/header credential existente do webhook de lead. O dispatcher envia o header `x-cobs-webhook-token` usando o mesmo segredo configurado no COBS.

## 3. Code node · Validar evento

Substituir o JavaScript do primeiro Code node por:

```javascript
const input = $json.body ?? $json;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (input.schema_version !== 1) throw new Error('unsupported_schema_version');
if (input.event_type !== 'order.confirmed') throw new Error('unsupported_event_type');
if (!uuid.test(String(input.id ?? ''))) throw new Error('invalid_event_id');
if (!uuid.test(String(input.tenant_id ?? ''))) throw new Error('invalid_tenant_id');
if (input.operation_id != null && !uuid.test(String(input.operation_id))) throw new Error('invalid_operation_id');
if (typeof input.idempotency_key !== 'string' || !input.idempotency_key.startsWith('order.confirmed:')) throw new Error('invalid_idempotency_key');
if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new Error('invalid_payload');
if (!uuid.test(String(input.payload.order_id ?? ''))) throw new Error('invalid_order_id');
if (!Number.isInteger(input.payload.grand_total_minor) || input.payload.grand_total_minor < 0) throw new Error('invalid_grand_total_minor');
if (typeof input.payload.currency !== 'string' || input.payload.currency.length !== 3) throw new Error('invalid_currency');

return [{
  json: {
    event_id: input.id,
    tenant_id: input.tenant_id,
    operation_id: input.operation_id ?? null,
    order_id: input.payload.order_id,
    reference_label: input.payload.reference_label ?? null,
    grand_total_minor: input.payload.grand_total_minor,
    currency: input.payload.currency,
    confirmed_at: input.payload.confirmed_at ?? null,
    confirmation_mode: input.payload.confirmation_mode ?? null,
    provider: input.payload.provider ?? null,
    correlation_id: input.correlation_id ?? null,
    idempotency_key: input.idempotency_key,
  }
}];
```

Resultado esperado: um item normalizado, sem PII adicional.

## 4. Remover IA

Remover ou desconectar o node `Message a model` da cópia. Este fluxo não precisa classificar intenção nem gerar texto.

## 5. Code node · Montar callback

Usar o segundo Code node para gerar o payload final:

```javascript
const event = $json;

return [{
  json: {
    event_id: event.event_id,
    tenant_id: event.tenant_id,
    outcome: 'completed',
    provider_metadata: {
      workflow: 'cobs-order-confirmed-v1',
      action: 'onboarding_prepared',
      order_id: event.order_id,
      correlation_id: event.correlation_id,
      confirmation_mode: event.confirmation_mode,
      provider: event.provider,
    },
  }
}];
```

Não incluir `intent`, `urgency`, `summary` ou `suggested_reply`.

## 6. HTTP Request · Callback COBS

Reaproveitar a configuração e credential `n8n → COBS Callback` do workflow de lead.

- Method: `POST`
- URL: manter a mesma URL de callback já configurada no lead, que aponta para `automation-gateway?action=result`.
- Authentication: Generic Credential Type → Header Auth.
- Credential: `n8n → COBS Callback`.
- Send Body: ON.
- Body Content Type: JSON.
- JSON Body: `{{ $json }}`.

Resultado esperado na primeira execução com evento novo:

```json
{
  "ok": true,
  "duplicate": false
}
```

Repetindo o mesmo callback do mesmo evento, o resultado esperado é `duplicate: true`.

## 7. Publicação

Publicar somente após:

1. Webhook de teste aceitar um envelope `order.confirmed` válido.
2. Code de validação produzir um item.
3. Code de callback produzir `outcome=completed`.
4. HTTP callback retornar `ok=true`.

## 8. E2E final

Depois do workflow publicado:

COBS `orders.status → confirmed` → `automation_events.pending` → dispatcher → n8n → callback → `automation_results` → `automation_events.completed` → `audit_events`.

O Release Gate fecha somente quando todos os registros correspondem ao mesmo `event_id`, `tenant_id` e `correlation_id`.
