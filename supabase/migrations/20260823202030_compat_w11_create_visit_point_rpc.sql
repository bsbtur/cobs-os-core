create or replace function public.create_visit_point(
  _journey_step_id uuid,
  _title text,
  _idempotency_key text,
  _interpretive_content text default null,
  _operational_note text default null,
  _estimated_minutes integer default null,
  _is_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $$
declare
  _result jsonb;
begin
  if nullif(btrim(coalesce(_idempotency_key, '')), '') is null then
    raise exception 'Idempotency key is required';
  end if;

  _result := public.create_journey_visit_point(
    _journey_step_id,
    _title,
    _interpretive_content,
    _operational_note
  );

  return _result;
end;
$$;

revoke all on function public.create_visit_point(uuid,text,text,text,text,integer,boolean) from public, anon;
grant execute on function public.create_visit_point(uuid,text,text,text,text,integer,boolean) to authenticated, service_role;