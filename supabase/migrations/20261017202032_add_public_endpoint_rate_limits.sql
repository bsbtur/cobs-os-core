create table if not exists public.public_endpoint_rate_limits (
  endpoint text not null,
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (endpoint, key_hash, window_start)
);

alter table public.public_endpoint_rate_limits enable row level security;

revoke all on public.public_endpoint_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.public_endpoint_rate_limits to service_role;

create index if not exists public_endpoint_rate_limits_updated_at_idx
  on public.public_endpoint_rate_limits (updated_at);

create or replace function public.consume_public_endpoint_rate_limit(
  _endpoint text,
  _key_hash text,
  _limit integer,
  _window_seconds integer
)
returns table (
  allowed boolean,
  request_count integer,
  window_start timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if nullif(btrim(_endpoint), '') is null then
    raise exception 'endpoint_required';
  end if;
  if nullif(btrim(_key_hash), '') is null or char_length(_key_hash) > 128 then
    raise exception 'invalid_key_hash';
  end if;
  if _limit < 1 or _limit > 10000 then
    raise exception 'invalid_limit';
  end if;
  if _window_seconds < 1 or _window_seconds > 86400 then
    raise exception 'invalid_window';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / _window_seconds) * _window_seconds
  );

  insert into public.public_endpoint_rate_limits (
    endpoint, key_hash, window_start, request_count, updated_at
  )
  values (
    btrim(_endpoint), btrim(_key_hash), v_window_start, 1, now()
  )
  on conflict (endpoint, key_hash, window_start)
  do update set
    request_count = public.public_endpoint_rate_limits.request_count + 1,
    updated_at = now()
  returning public.public_endpoint_rate_limits.request_count
  into v_count;

  return query
  select (v_count <= _limit), v_count, v_window_start;
end;
$$;

revoke all on function public.consume_public_endpoint_rate_limit(text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_endpoint_rate_limit(text,text,integer,integer)
  to service_role;

comment on table public.public_endpoint_rate_limits is
  'Hashed, server-only rate-limit counters for public Edge Function endpoints.';

comment on function public.consume_public_endpoint_rate_limit(text,text,integer,integer) is
  'Atomically consumes one request in a fixed time bucket; callable only by service_role.';
