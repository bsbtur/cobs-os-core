alter table public.automation_results drop constraint if exists automation_results_intent_check;
alter table public.automation_results add constraint automation_results_intent_check check (
  intent is null or intent = any (array[
    'price','installment','group','ready_to_buy','human_support','other',
    'general_info','payment_status','payment_problem','reservation_status','operation_info','schedule','documents','complaint','emergency',
    'informational','operational','financial','commercial','support'
  ]::text[])
);
alter table public.automation_results drop constraint if exists automation_results_suggested_reply_check;
alter table public.automation_results add constraint automation_results_suggested_reply_check check (
  suggested_reply is null or length(suggested_reply) <= 1200
);