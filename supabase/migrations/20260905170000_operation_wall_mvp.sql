-- =====================================================================
-- COBS OS · OPERATION WALL MVP
-- Organization posts + participant reactions, comments and polls.
-- Participant identity is resolved from W10 access; no auth.users FK is
-- introduced for traveler interaction.
-- =====================================================================

create type public.operation_wall_post_kind as enum ('post', 'poll');
create type public.operation_wall_post_status as enum ('published', 'archived');

create table public.operation_wall_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  kind public.operation_wall_post_kind not null default 'post',
  status public.operation_wall_post_status not null default 'published',
  body text not null,
  author_profile_id uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_wall_posts_operation_fk foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete cascade,
  constraint operation_wall_posts_body_ck check (length(btrim(body)) between 1 and 2000),
  constraint operation_wall_posts_archive_ck check (
    (status = 'published' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create table public.operation_wall_poll_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  post_id uuid not null references public.operation_wall_posts(id) on delete cascade,
  label text not null,
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint operation_wall_poll_options_operation_fk foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete cascade,
  constraint operation_wall_poll_options_label_ck check (length(btrim(label)) between 1 and 120),
  constraint operation_wall_poll_options_position_ck check (position between 1 and 6),
  constraint operation_wall_poll_options_position_uq unique (post_id, position)
);

create table public.operation_wall_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  post_id uuid not null references public.operation_wall_posts(id) on delete cascade,
  participation_id uuid not null,
  person_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint operation_wall_comments_operation_fk foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete cascade,
  constraint operation_wall_comments_participation_fk foreign key (participation_id, tenant_id)
    references public.operation_participations(id, tenant_id) on delete cascade,
  constraint operation_wall_comments_person_fk foreign key (person_id, tenant_id)
    references public.people(id, tenant_id) on delete cascade,
  constraint operation_wall_comments_body_ck check (length(btrim(body)) between 1 and 500)
);

create table public.operation_wall_reactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  post_id uuid not null references public.operation_wall_posts(id) on delete cascade,
  participation_id uuid not null,
  reaction text not null,
  created_at timestamptz not null default now(),
  constraint operation_wall_reactions_operation_fk foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete cascade,
  constraint operation_wall_reactions_participation_fk foreign key (participation_id, tenant_id)
    references public.operation_participations(id, tenant_id) on delete cascade,
  constraint operation_wall_reactions_allowed_ck check (reaction in ('heart','clap','fire','wow')),
  constraint operation_wall_reactions_uq unique (post_id, participation_id, reaction)
);

create table public.operation_wall_poll_votes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  post_id uuid not null references public.operation_wall_posts(id) on delete cascade,
  option_id uuid not null references public.operation_wall_poll_options(id) on delete cascade,
  participation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_wall_poll_votes_operation_fk foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete cascade,
  constraint operation_wall_poll_votes_participation_fk foreign key (participation_id, tenant_id)
    references public.operation_participations(id, tenant_id) on delete cascade,
  constraint operation_wall_poll_votes_one_per_post_uq unique (post_id, participation_id)
);

create index operation_wall_posts_feed_idx
  on public.operation_wall_posts (operation_id, published_at desc)
  where status = 'published';
create index operation_wall_comments_post_idx on public.operation_wall_comments (post_id, created_at);
create index operation_wall_reactions_post_idx on public.operation_wall_reactions (post_id, reaction);
create index operation_wall_poll_votes_post_idx on public.operation_wall_poll_votes (post_id, option_id);

alter table public.operation_wall_posts enable row level security;
alter table public.operation_wall_poll_options enable row level security;
alter table public.operation_wall_comments enable row level security;
alter table public.operation_wall_reactions enable row level security;
alter table public.operation_wall_poll_votes enable row level security;

-- No direct authenticated table access. All browser access goes through the
-- shaped RPCs below; service_role keeps operational access.
revoke all on public.operation_wall_posts from authenticated, anon;
revoke all on public.operation_wall_poll_options from authenticated, anon;
revoke all on public.operation_wall_comments from authenticated, anon;
revoke all on public.operation_wall_reactions from authenticated, anon;
revoke all on public.operation_wall_poll_votes from authenticated, anon;
grant all on public.operation_wall_posts to service_role;
grant all on public.operation_wall_poll_options to service_role;
grant all on public.operation_wall_comments to service_role;
grant all on public.operation_wall_reactions to service_role;
grant all on public.operation_wall_poll_votes to service_role;

create trigger operation_wall_posts_updated_at
  before update on public.operation_wall_posts
  for each row execute function public.set_updated_at();
create trigger operation_wall_poll_votes_updated_at
  before update on public.operation_wall_poll_votes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Participant read projection. First names only are exposed for comments.
-- ---------------------------------------------------------------------
create or replace function public.get_my_operation_wall(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _ctx jsonb;
  _participation_id uuid;
  _posts jsonb;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);
  _participation_id := (_ctx->>'participation_id')::uuid;

  select coalesce(jsonb_agg(item order by item->>'published_at' desc), '[]'::jsonb)
    into _posts
  from (
    select jsonb_build_object(
      'post_id', p.id,
      'kind', p.kind,
      'body', p.body,
      'published_at', p.published_at,
      'author_label', 'Organização',
      'reactions', (
        select coalesce(jsonb_object_agg(r.reaction, r.qty), '{}'::jsonb)
        from (
          select wr.reaction, count(*)::int as qty
          from public.operation_wall_reactions wr
          where wr.post_id = p.id
          group by wr.reaction
        ) r
      ),
      'my_reactions', (
        select coalesce(jsonb_agg(wr.reaction order by wr.reaction), '[]'::jsonb)
        from public.operation_wall_reactions wr
        where wr.post_id = p.id and wr.participation_id = _participation_id
      ),
      'comments', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'comment_id', c.id,
          'author_name', split_part(pe.full_name, ' ', 1),
          'body', c.body,
          'created_at', c.created_at,
          'mine', c.participation_id = _participation_id
        ) order by c.created_at), '[]'::jsonb)
        from public.operation_wall_comments c
        join public.people pe on pe.id = c.person_id and pe.tenant_id = c.tenant_id
        where c.post_id = p.id and c.deleted_at is null
      ),
      'poll_options', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'option_id', o.id,
          'label', o.label,
          'position', o.position,
          'votes', (select count(*)::int from public.operation_wall_poll_votes v where v.option_id = o.id),
          'selected', exists(
            select 1 from public.operation_wall_poll_votes v
            where v.option_id = o.id and v.participation_id = _participation_id
          )
        ) order by o.position), '[]'::jsonb)
        from public.operation_wall_poll_options o
        where o.post_id = p.id
      )
    ) item
    from public.operation_wall_posts p
    where p.operation_id = _operation_id and p.status = 'published'
  ) feed;

  return jsonb_build_object('operation_id', _operation_id, 'posts', _posts);
end; $$;

-- ---------------------------------------------------------------------
-- Participant commands.
-- ---------------------------------------------------------------------
create or replace function public.add_my_operation_wall_comment(_post_id uuid, _body text)
returns uuid
language plpgsql security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _post public.operation_wall_posts;
  _ctx jsonb;
  _body_clean text := nullif(btrim(coalesce(_body,'')), '');
  _id uuid;
begin
  select * into _post from public.operation_wall_posts where id = _post_id and status = 'published';
  if _post.id is null then raise exception 'Post not found'; end if;
  _ctx := app_private.w10_assert_effective_access(_post.operation_id);
  if (_ctx->>'historical')::boolean then raise exception 'This trip is read-only'; end if;
  if _body_clean is null or length(_body_clean) > 500 then raise exception 'Comment must contain 1 to 500 characters'; end if;

  insert into public.operation_wall_comments
    (tenant_id, operation_id, post_id, participation_id, person_id, body)
  values (
    (_ctx->>'tenant_id')::uuid,
    _post.operation_id,
    _post.id,
    (_ctx->>'participation_id')::uuid,
    (_ctx->>'person_id')::uuid,
    _body_clean
  ) returning id into _id;
  return _id;
end; $$;

create or replace function public.toggle_my_operation_wall_reaction(_post_id uuid, _reaction text)
returns boolean
language plpgsql security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _post public.operation_wall_posts;
  _ctx jsonb;
  _participation_id uuid;
begin
  if _reaction not in ('heart','clap','fire','wow') then raise exception 'Invalid reaction'; end if;
  select * into _post from public.operation_wall_posts where id = _post_id and status = 'published';
  if _post.id is null then raise exception 'Post not found'; end if;
  _ctx := app_private.w10_assert_effective_access(_post.operation_id);
  if (_ctx->>'historical')::boolean then raise exception 'This trip is read-only'; end if;
  _participation_id := (_ctx->>'participation_id')::uuid;

  delete from public.operation_wall_reactions
   where post_id = _post.id and participation_id = _participation_id and reaction = _reaction;
  if found then return false; end if;

  insert into public.operation_wall_reactions
    (tenant_id, operation_id, post_id, participation_id, reaction)
  values ((_ctx->>'tenant_id')::uuid, _post.operation_id, _post.id, _participation_id, _reaction);
  return true;
end; $$;

create or replace function public.vote_my_operation_wall_poll(_option_id uuid)
returns uuid
language plpgsql security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _option public.operation_wall_poll_options;
  _post public.operation_wall_posts;
  _ctx jsonb;
  _participation_id uuid;
begin
  select * into _option from public.operation_wall_poll_options where id = _option_id;
  if _option.id is null then raise exception 'Poll option not found'; end if;
  select * into _post from public.operation_wall_posts where id = _option.post_id and status = 'published' and kind = 'poll';
  if _post.id is null or _post.operation_id <> _option.operation_id then raise exception 'Poll option not found'; end if;
  _ctx := app_private.w10_assert_effective_access(_post.operation_id);
  if (_ctx->>'historical')::boolean then raise exception 'This trip is read-only'; end if;
  _participation_id := (_ctx->>'participation_id')::uuid;

  insert into public.operation_wall_poll_votes
    (tenant_id, operation_id, post_id, option_id, participation_id)
  values ((_ctx->>'tenant_id')::uuid, _post.operation_id, _post.id, _option.id, _participation_id)
  on conflict (post_id, participation_id) do update
    set option_id = excluded.option_id, updated_at = now();
  return _option.id;
end; $$;

-- ---------------------------------------------------------------------
-- Organization command. The first MVP intentionally keeps publishing
-- simple: owner/admin/operations_agent can publish text or a poll.
-- ---------------------------------------------------------------------
create or replace function public.create_operation_wall_post(
  _operation_id uuid,
  _body text,
  _kind text default 'post',
  _poll_options jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _tenant_id uuid;
  _body_clean text := nullif(btrim(coalesce(_body,'')), '');
  _post_id uuid;
  _option text;
  _position smallint := 0;
  _options_count int;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select tenant_id into _tenant_id from public.operations where id = _operation_id;
  if _tenant_id is null then raise exception 'Operation not found'; end if;
  perform app_private.w10_require_access_operator(_tenant_id);
  if _body_clean is null or length(_body_clean) > 2000 then raise exception 'Post must contain 1 to 2000 characters'; end if;
  if _kind not in ('post','poll') then raise exception 'Invalid post kind'; end if;

  _options_count := case when jsonb_typeof(_poll_options) = 'array' then jsonb_array_length(_poll_options) else 0 end;
  if _kind = 'poll' and (_options_count < 2 or _options_count > 6) then
    raise exception 'A poll must have 2 to 6 options';
  end if;
  if _kind = 'post' and _options_count <> 0 then raise exception 'Regular posts cannot have poll options'; end if;

  insert into public.operation_wall_posts
    (tenant_id, operation_id, kind, body, author_profile_id)
  values (_tenant_id, _operation_id, _kind::public.operation_wall_post_kind, _body_clean, auth.uid())
  returning id into _post_id;

  if _kind = 'poll' then
    for _option in select value from jsonb_array_elements_text(_poll_options)
    loop
      _position := _position + 1;
      if nullif(btrim(_option),'') is null or length(btrim(_option)) > 120 then
        raise exception 'Poll options must contain 1 to 120 characters';
      end if;
      insert into public.operation_wall_poll_options
        (tenant_id, operation_id, post_id, label, position)
      values (_tenant_id, _operation_id, _post_id, btrim(_option), _position);
    end loop;
  end if;

  perform app_private.record_audit_event(
    _tenant_id, auth.uid(), 'operation_wall.post_published', 'operation_wall_post', _post_id,
    null, jsonb_build_object('operation_id', _operation_id, 'kind', _kind)
  );
  return _post_id;
end; $$;

revoke all on function public.get_my_operation_wall(uuid) from public;
revoke all on function public.add_my_operation_wall_comment(uuid,text) from public;
revoke all on function public.toggle_my_operation_wall_reaction(uuid,text) from public;
revoke all on function public.vote_my_operation_wall_poll(uuid) from public;
revoke all on function public.create_operation_wall_post(uuid,text,text,jsonb) from public;

grant execute on function public.get_my_operation_wall(uuid) to authenticated, service_role;
grant execute on function public.add_my_operation_wall_comment(uuid,text) to authenticated, service_role;
grant execute on function public.toggle_my_operation_wall_reaction(uuid,text) to authenticated, service_role;
grant execute on function public.vote_my_operation_wall_poll(uuid) to authenticated, service_role;
grant execute on function public.create_operation_wall_post(uuid,text,text,jsonb) to authenticated, service_role;
