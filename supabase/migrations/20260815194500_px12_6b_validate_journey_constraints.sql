-- COBS OS · PX12.6-B — validate Journey hardening constraints after QA audit.
-- The current dataset contains zero violations for all four constraints.

alter table public.journey_steps
  validate constraint journey_steps_planned_window_order;

alter table public.journey_steps
  validate constraint journey_steps_expected_window_order;

alter table public.journey_steps
  validate constraint journey_steps_title_nonblank;

alter table public.playbook_items
  validate constraint playbook_items_title_nonblank;
