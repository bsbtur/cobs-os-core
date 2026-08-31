# n8n Assistant Router V1 — Contrato COBS

## Objetivo
Criar uma rota única de raciocínio para o COBS OS usar quando não houver atendente humano disponível.

## Evento de entrada
`assistant.request`

Webhook sugerido no n8n:
`/webhook/cobs-assistant-router-v1`

## Payload COBS → n8n
```json
{
  "schema_version": 1,
  "id": "uuid do automation_event",
  "tenant_id": "uuid",
  "operation_id": "uuid ou null",
  "event_type": "assistant.request",
  "idempotency_key": "assistant.request:<source_id>:<message_id>",
  "correlation_id": "string",
  "payload": {
    "channel": "app|whatsapp|web|internal",
    "conversation_id": "string ou null",
    "person_id": "uuid ou null",
    "message": "texto do usuário",
    "human_available": false,
    "locale": "pt-BR",
    "context": {
      "operation": {},
      "reservation": {},
      "payment": {},
      "schedule": {},
      "documents": {},
      "known_facts": []
    }
  },
  "created_at": "ISO-8601"
}
```

## Pipeline n8n recomendado
1. Webhook autenticado com `x-cobs-webhook-token`.
2. Code node valida schema, UUIDs, tamanho da mensagem e `event_type`.
3. Code node remove campos não permitidos e limita contexto.
4. OpenAI node usa o prompt `docs/prompts/cobs-assistant-router-v1.md`.
5. Code node valida JSON de saída e aplica fail-closed.
6. IF node:
   - `requires_human=false` → callback com resposta sugerida;
   - `requires_human=true` → callback com handoff e sem executar ação destrutiva.
7. HTTP Request para `automation-gateway?action=result` usando a credencial de callback existente.

## Saída n8n → COBS
```json
{
  "event_id": "uuid",
  "tenant_id": "uuid",
  "outcome": "completed",
  "intent": "general_info",
  "urgency": "low",
  "summary": "resumo interno",
  "suggested_reply": "resposta ao usuário",
  "provider_metadata": {
    "workflow": "cobs-assistant-router-v1",
    "action": "assistant_reply_prepared",
    "confidence": 0.96,
    "requires_human": false,
    "reason_code": "answerable_from_context",
    "recommended_action": "reply",
    "facts_used": [],
    "missing_information": []
  }
}
```

## Regras de segurança
- Nunca executar pagamento, cancelamento, reembolso, alteração de reserva ou cadastro diretamente a partir da IA.
- Nunca responder com fatos que não estejam no contexto recebido.
- Limite sugerido da mensagem do usuário: 2.000 caracteres.
- Limite sugerido do contexto serializado: 12 KB.
- Timeout do workflow: 20 s.
- No erro do modelo, JSON inválido ou baixa confiança: `requires_human=true`.
- Idempotência obrigatória pelo `automation_event.id` e `idempotency_key`.
- Segredos ficam no n8n Credentials/Supabase Vault; nunca no payload, prompt ou GitHub.

## Rota no dispatcher
A futura versão do `automation-dispatcher` deve resolver:

`assistant.request` → `N8N_ASSISTANT_WEBHOOK_URL`

Não adicionar `assistant.request` ao whitelist de `claim_automation_outbox` antes do webhook n8n existir e passar em QA. Isso evita eventos presos ou marcados como failed por rota inexistente.

## Callback gateway
O `automation-gateway` deve aceitar `assistant.request` e persistir:
- `intent`
- `urgency`
- `summary`
- `suggested_reply`
- metadata com `confidence`, `requires_human`, `reason_code`, `recommended_action`, `facts_used` e `missing_information`.

## Critério de QA
PASS somente quando:
1. pergunta simples com fato no contexto → resposta automática;
2. dado ausente → handoff humano;
3. pagamento divergente → handoff humano;
4. emergência → urgência critical + handoff;
5. evento repetido → callback idempotente, sem duplicação;
6. nenhum Order, Payment, Reservation ou cadastro é alterado pelo router.
