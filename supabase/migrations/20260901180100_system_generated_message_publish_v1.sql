alter table public.messages drop constraint if exists messages_published_ck;

alter table public.messages
add constraint messages_published_ck check (
  status <> 'published'::public.message_status
  or (
    published_at is not null
    and (
      published_by is not null
      or metadata->>'source' = 'px12_staff_journey_alert'
    )
  )
);
