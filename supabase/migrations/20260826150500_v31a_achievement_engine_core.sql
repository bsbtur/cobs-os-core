-- COBS Human Experience V3.1-A
-- Persistent Achievement Engine foundation.
-- Scope: canonical achievement catalog, append-only awards, XP ledger, RLS, private idempotent grant primitive,
-- and read-only RPCs for the authenticated user's progress.

create table if not exists public.achievement_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null,
  scope text not null check (scope in ('profile','operation')),
  rarity text not null default 'common' check (rarity in ('common','rare','epic')),
  xp_reward integer not null default 0 check (xp_reward >= 0),
  icon_key text not null default 'award',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.achievement_awards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  achievement_id uuid not null references public.achievement_definitions(id) on delete restrict,
  subject_type text not null check (subject_type in ('profile','operation')),
  subject_id uuid not null,
  operation_id uuid references public.operations(id) on delete restrict,
  source_event_type text not null,
  source_event_id uuid,
  idempotency_key text not null,
  awarded_by uuid references public.profiles(id) on delete set null,
  awarded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, idempotency_key)
);

create index if not exists achievement_awards_tenant_subject_idx
  on public.achievement_awards (tenant_id, subject_type, subject_id, awarded_at desc);
create index if not exists achievement_awards_operation_idx
  on public.achievement_awards (tenant_id, operation_id, awarded_at desc)
  where operation_id is not null;
create index if not exists achievement_awards_definition_idx
  on public.achievement_awards (achievement_id, awarded_at desc);

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid references public.operations(id) on delete restrict,
  achievement_award_id uuid not null unique references public.achievement_awards(id) on delete restrict,
  delta integer not null check (delta > 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists xp_ledger_tenant_profile_idx
  on public.xp_ledger (tenant_id, profile_id, created_at desc);
create index if not exists xp_ledger_operation_idx
  on public.xp_ledger (tenant_id, operation_id, created_at desc)
  where operation_id is not null;

alter table public.achievement_definitions enable row level security;
alter table public.achievement_awards enable row level security;
alter table public.xp_ledger enable row level security;

-- Catalog is product metadata: authenticated users may read active definitions.
drop policy if exists achievement_definitions_authenticated_read on public.achievement_definitions;
create policy achievement_definitions_authenticated_read
  on public.achievement_definitions
  for select
  to authenticated
  using (is_active = true);

-- Awards and XP are tenant scoped and read-only from the client.
drop policy if exists achievement_awards_tenant_read on public.achievement_awards;
create policy achievement_awards_tenant_read
  on public.achievement_awards
  for select
  to authenticated
  using (app_private.is_tenant_member(tenant_id));

drop policy if exists xp_ledger_tenant_read on public.xp_ledger;
create policy xp_ledger_tenant_read
  on public.xp_ledger
  for select
  to authenticated
  using (app_private.is_tenant_member(tenant_id));

-- No direct INSERT/UPDATE/DELETE policies are intentionally defined.
-- Mutations must pass through the private achievement engine.

create or replace function app_private.prevent_achievement_history_mutation()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if current_setting('app.achievement_maintenance', true) is distinct from 'on' then
    raise exception 'Achievement history is append-only';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function app_private.prevent_achievement_history_mutation() from public, anon, authenticated;

drop trigger if exists achievement_awards_append_only on public.achievement_awards;
create trigger achievement_awards_append_only
before update or delete on public.achievement_awards
for each row execute function app_private.prevent_achievement_history_mutation();

drop trigger if exists xp_ledger_append_only on public.xp_ledger;
create trigger xp_ledger_append_only
before update or delete on public.xp_ledger
for each row execute function app_private.prevent_achievement_history_mutation();

-- Internal, idempotent grant primitive.
-- This function is intentionally NOT executable by anon/authenticated clients.
create or replace function app_private.grant_achievement(
  _tenant_id uuid,
  _achievement_key text,
  _subject_type text,
  _subject_id uuid,
  _operation_id uuid,
  _source_event_type text,
  _source_event_id uuid,
  _idempotency_key text,
  _metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _definition public.achievement_definitions;
  _existing public.achievement_awards;
  _award public.achievement_awards;
  _profile_id uuid;
begin
  if _tenant_id is null or nullif(trim(coalesce(_idempotency_key, '')), '') is null then
    raise exception 'tenant_id and idempotency_key are required';
  end if;
  if _subject_type not in ('profile','operation') then
    raise exception 'Invalid achievement subject type';
  end if;

  select * into _existing
  from public.achievement_awards a
  where a.tenant_id = _tenant_id and a.idempotency_key = _idempotency_key;

  if _existing.id is not null then
    return jsonb_build_object(
      'award_id', _existing.id,
      'duplicate', true,
      'awarded_at', _existing.awarded_at
    );
  end if;

  select * into _definition
  from public.achievement_definitions d
  where d.key = _achievement_key and d.is_active;

  if _definition.id is null then raise exception 'Achievement not found or inactive'; end if;
  if _definition.scope <> _subject_type then raise exception 'Achievement scope mismatch'; end if;

  if _operation_id is not null then
    if not exists (
      select 1 from public.operations o
      where o.id = _operation_id and o.tenant_id = _tenant_id
    ) then
      raise exception 'Operation does not belong to tenant';
    end if;
  end if;

  if _subject_type = 'profile' then
    _profile_id := _subject_id;
    if not exists (
      select 1
      from public.people p
      where p.tenant_id = _tenant_id and p.profile_id = _profile_id
    ) then
      raise exception 'Profile does not belong to tenant';
    end if;
  else
    if not exists (
      select 1 from public.operations o
      where o.id = _subject_id and o.tenant_id = _tenant_id
    ) then
      raise exception 'Operation subject does not belong to tenant';
    end if;
  end if;

  insert into public.achievement_awards (
    tenant_id, achievement_id, subject_type, subject_id, operation_id,
    source_event_type, source_event_id, idempotency_key, awarded_by, metadata
  ) values (
    _tenant_id, _definition.id, _subject_type, _subject_id, _operation_id,
    _source_event_type, _source_event_id, _idempotency_key, auth.uid(), coalesce(_metadata, '{}'::jsonb)
  ) returning * into _award;

  if _subject_type = 'profile' and _definition.xp_reward > 0 then
    insert into public.xp_ledger (
      tenant_id, profile_id, operation_id, achievement_award_id, delta, reason
    ) values (
      _tenant_id, _profile_id, _operation_id, _award.id, _definition.xp_reward,
      'achievement:' || _definition.key
    );
  end if;

  perform app_private.record_audit_event(
    _tenant_id,
    auth.uid(),
    'achievement.awarded',
    'achievement_award',
    _award.id,
    _idempotency_key,
    jsonb_build_object(
      'achievement_key', _definition.key,
      'subject_type', _subject_type,
      'subject_id', _subject_id,
      'operation_id', _operation_id,
      'xp_reward', _definition.xp_reward
    )
  );

  return jsonb_build_object(
    'award_id', _award.id,
    'achievement_key', _definition.key,
    'xp_reward', _definition.xp_reward,
    'duplicate', false,
    'awarded_at', _award.awarded_at
  );
exception
  when unique_violation then
    select * into _existing
    from public.achievement_awards a
    where a.tenant_id = _tenant_id and a.idempotency_key = _idempotency_key;
    if _existing.id is not null then
      return jsonb_build_object('award_id', _existing.id, 'duplicate', true, 'awarded_at', _existing.awarded_at);
    end if;
    raise;
end;
$function$;

revoke all on function app_private.grant_achievement(uuid,text,text,uuid,uuid,text,uuid,text,jsonb) from public, anon, authenticated;

create or replace function public.get_my_achievement_summary(_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _xp bigint;
  _awards integer;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if not app_private.is_tenant_member(_tenant_id) then raise exception 'Tenant access denied'; end if;

  select coalesce(sum(x.delta), 0) into _xp
  from public.xp_ledger x
  where x.tenant_id = _tenant_id and x.profile_id = _uid;

  select count(*) into _awards
  from public.achievement_awards a
  where a.tenant_id = _tenant_id and a.subject_type = 'profile' and a.subject_id = _uid;

  return jsonb_build_object('tenant_id', _tenant_id, 'profile_id', _uid, 'xp', _xp, 'awards', _awards);
end;
$function$;

revoke all on function public.get_my_achievement_summary(uuid) from public, anon;
grant execute on function public.get_my_achievement_summary(uuid) to authenticated;

create or replace function public.list_my_achievements(_tenant_id uuid)
returns table (
  award_id uuid,
  achievement_key text,
  achievement_name text,
  description text,
  rarity text,
  xp_reward integer,
  icon_key text,
  operation_id uuid,
  awarded_at timestamptz,
  metadata jsonb
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if not app_private.is_tenant_member(_tenant_id) then raise exception 'Tenant access denied'; end if;

  return query
  select
    a.id,
    d.key,
    d.name,
    d.description,
    d.rarity,
    d.xp_reward,
    d.icon_key,
    a.operation_id,
    a.awarded_at,
    a.metadata
  from public.achievement_awards a
  join public.achievement_definitions d on d.id = a.achievement_id
  where a.tenant_id = _tenant_id
    and a.subject_type = 'profile'
    and a.subject_id = _uid
  order by a.awarded_at desc;
end;
$function$;

revoke all on function public.list_my_achievements(uuid) from public, anon;
grant execute on function public.list_my_achievements(uuid) to authenticated;

-- Initial canonical badge set. These are product definitions, not proof that the rule has fired.
insert into public.achievement_definitions (key, name, description, scope, rarity, xp_reward, icon_key)
values
  ('first_mission', 'Primeira Missão', 'Concluiu sua primeira etapa operacional no COBS.', 'profile', 'common', 100, 'flag'),
  ('explorer', 'Explorador', 'Apresentou os pontos mínimos de uma visita.', 'profile', 'common', 80, 'compass'),
  ('time_keeper', 'Guardião do Tempo', 'Concluiu uma etapa dentro da janela operacional.', 'profile', 'rare', 120, 'clock'),
  ('perfect_route', 'Rota Perfeita', 'Concluiu uma sequência operacional sem pendências.', 'profile', 'rare', 180, 'route'),
  ('milestone_master', 'Mestre dos Marcos', 'Concluiu todos os marcos de uma etapa.', 'profile', 'common', 100, 'check-circle'),
  ('essentials_100', 'Essenciais 100%', 'Cumpriu todos os pontos obrigatórios da visita.', 'profile', 'rare', 150, 'shield-check'),
  ('flawless_operation', 'Operação Impecável', 'Concluiu uma operação sem ocorrência crítica.', 'profile', 'epic', 300, 'sparkles'),
  ('brasilia_expert', 'Brasília Expert', 'Acumulou excelência em experiências de Brasília.', 'profile', 'epic', 250, 'landmark'),
  ('five_star_experience', 'Experiência 5 Estrelas', 'Recebeu avaliação máxima em uma experiência.', 'profile', 'epic', 250, 'star'),
  ('legendary_mission', 'Missão Lendária', 'Conquista rara por execução operacional excepcional.', 'profile', 'epic', 500, 'crown')
on conflict (key) do nothing;
