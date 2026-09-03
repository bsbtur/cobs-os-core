alter table public.automation_results drop constraint if exists automation_results_intent_check;
alter table public.automation_results add constraint automation_results_intent_check check (
  intent is null or intent = any (array[
    'price'::text,
    'installment'::text,
    'group'::text,
    'ready_to_buy'::text,
    'human_support'::text,
    'other'::text,
    'general_info'::text,
    'payment_status'::text,
    'payment_problem'::text,
    'reservation_status'::text,
    'operation_info'::text,
    'schedule'::text,
    'documents'::text,
    'complaint'::text,
    'emergency'::text
  ])
);

alter table public.automation_results drop constraint if exists automation_results_urgency_check;
alter table public.automation_results add constraint automation_results_urgency_check check (
  urgency is null or urgency = any (array['low'::text,'medium'::text,'high'::text,'critical'::text])
);

alter table public.automation_events drop constraint if exists automation_events_operation_context_check;
alter table public.automation_events add constraint automation_events_operation_context_check check (
  operation_id is not null or event_type = any (array['lead.created'::text,'order.confirmed'::text,'assistant.request'::text])
);