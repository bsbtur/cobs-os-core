-- =====================================================================
-- COBS OS · OPERATION WALL MVP · INTEGRITY HARDENING
-- Keep every child row scoped to the same tenant + operation + post and
-- prevent new wall posts once an operation is historical/read-only.
-- =====================================================================

alter table public.operation_wall_posts
  add constraint operation_wall_posts_scope_uq
  unique (id, tenant_id, operation_id);

alter table public.operation_wall_poll_options
  add constraint operation_wall_poll_options_scope_uq
  unique (id, tenant_id, operation_id, post_id);

alter table public.operation_wall_poll_options
  add constraint operation_wall_poll_options_post_scope_fk
  foreign key (post_id, tenant_id, operation_id)
  references public.operation_wall_posts (id, tenant_id, operation_id)
  on delete cascade;

alter table public.operation_wall_comments
  add constraint operation_wall_comments_post_scope_fk
  foreign key (post_id, tenant_id, operation_id)
  references public.operation_wall_posts (id, tenant_id, operation_id)
  on delete cascade;

alter table public.operation_wall_reactions
  add constraint operation_wall_reactions_post_scope_fk
  foreign key (post_id, tenant_id, operation_id)
  references public.operation_wall_posts (id, tenant_id, operation_id)
  on delete cascade;

alter table public.operation_wall_poll_votes
  add constraint operation_wall_poll_votes_post_scope_fk
  foreign key (post_id, tenant_id, operation_id)
  references public.operation_wall_posts (id, tenant_id, operation_id)
  on delete cascade;

alter table public.operation_wall_poll_votes
  add constraint operation_wall_poll_votes_option_scope_fk
  foreign key (option_id, tenant_id, operation_id, post_id)
  references public.operation_wall_poll_options (id, tenant_id, operation_id, post_id)
  on delete cascade;

create or replace function app_private.operation_wall_assert_post_writable()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _status text;
  _archived_at timestamptz;
begin
  select o.status::text, o.archived_at
    into _status, _archived_at
  from public.operations o
  where o.id = new.operation_id
    and o.tenant_id = new.tenant_id;

  if _status is null then
    raise exception 'Operation not found';
  end if;

  if _status = 'completed' or _archived_at is not null then
    raise exception 'This trip is read-only';
  end if;

  return new;
end;
$$;

revoke all on function app_private.operation_wall_assert_post_writable() from public;

create trigger operation_wall_posts_writable_guard
  before insert on public.operation_wall_posts
  for each row execute function app_private.operation_wall_assert_post_writable();
