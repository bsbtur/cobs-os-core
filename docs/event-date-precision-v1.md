# Event Date Precision V1

Gate para representar eventos com datas confirmadas e horários ainda não publicados.

- `events.schedule_precision`: `datetime` ou `date_only`.
- RPC autenticado/idempotente: `set_event_schedule_precision`.
- W10 `get_my_event_program` expõe `schedule_precision`.
- Traveler esconde timestamps técnicos quando `date_only` e mostra a faixa de datas + “Horário a confirmar”.
- Controle autenticado isolado disponível em `/operations/$operationId/event-schedule-precision`.
- Migration validada primeiro no Supabase STAGING.
- Produção não alterada por esta branch.
