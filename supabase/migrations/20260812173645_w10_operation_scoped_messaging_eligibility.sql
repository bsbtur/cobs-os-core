-- 1. Canonical profile-scoped effective access helper (private, internal-only)
CREATE OR REPLACE FUNCTION app_private.w10_effective_access_for(_operation_id uuid, _profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object(
           'grant_id',         g.id,
           'tenant_id',        g.tenant_id,
           'operation_id',     g.operation_id,
           'person_id',        g.person_id,
           'participation_id', g.participation_id,
           'operation_status', o.status,
           'historical',       (o.status = 'completed' or o.archived_at is not null)
         )
    from public.participant_access_grants g
    join public.people p
      on p.id = g.person_id
     and p.tenant_id = g.tenant_id
    join public.operation_participations pa
      on pa.id = g.participation_id
     and pa.tenant_id = g.tenant_id
    join public.operations o
      on o.id = g.operation_id
     and o.tenant_id = g.tenant_id
   where g.operation_id = _operation_id
     and g.status = 'active'
     and _profile_id is not null
     and g.profile_id = _profile_id          -- immutable binding snapshot
     and p.profile_id = _profile_id          -- identity link still holds today
     and pa.person_id = g.person_id          -- participation identity assertion
     and pa.operation_id = g.operation_id
     and pa.status in ('expected','confirmed')
     and o.status <> 'cancelled'
   limit 1
$function$;

REVOKE ALL ON FUNCTION app_private.w10_effective_access_for(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.w10_effective_access_for(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION app_private.w10_effective_access_for(uuid, uuid) FROM authenticated;

-- 2. Self wrapper preserved, now thin
CREATE OR REPLACE FUNCTION app_private.w10_effective_access(_operation_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  select app_private.w10_effective_access_for(_operation_id, auth.uid())
$function$;

REVOKE ALL ON FUNCTION app_private.w10_effective_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.w10_effective_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION app_private.w10_effective_access(uuid) FROM authenticated;

-- 3. W08 eligibility amendment (operation-scoped)
DROP FUNCTION IF EXISTS app_private.w08_in_app_eligible_recipients(uuid, uuid[]);

CREATE OR REPLACE FUNCTION app_private.w08_in_app_eligible_recipients(_tenant_id uuid, _operation_id uuid, _person_ids uuid[])
RETURNS TABLE(person_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  select p.id
  from public.people p
  where p.tenant_id = _tenant_id
    and p.id = any(_person_ids)
    and p.profile_id is not null
    and (
      exists (
        select 1 from public.memberships m
        where m.tenant_id = _tenant_id and m.profile_id = p.profile_id and m.status = 'active'
      )
      or (
        _operation_id is not null
        and coalesce(
              (app_private.w10_effective_access_for(_operation_id, p.profile_id) ->> 'tenant_id')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            ) = _tenant_id
      )
    )
$function$;

REVOKE ALL ON FUNCTION app_private.w08_in_app_eligible_recipients(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.w08_in_app_eligible_recipients(uuid, uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION app_private.w08_in_app_eligible_recipients(uuid, uuid, uuid[]) FROM authenticated;

-- 4. publish_message: supply operation scope from the server-loaded message row
CREATE OR REPLACE FUNCTION public.publish_message(_message_id uuid, _idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  _msg public.messages;
  _prev jsonb;
  _correlation text := gen_random_uuid()::text;
  _people uuid[];
  _eligible uuid[];
  _recipients int := 0;
  _delivered int := 0;
  _result jsonb;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);

  if _msg.status = 'published' then
    return jsonb_build_object('message_id', _message_id, 'status', 'published',
      'unchanged', true,
      'summary', app_private.w08_message_delivery_summary(_message_id));
  end if;
  if _msg.status = 'cancelled' then raise exception 'A cancelled message cannot be published'; end if;
  if _msg.expires_at is not null and _msg.expires_at <= now() then
    raise exception 'This message has already expired and cannot be published';
  end if;

  perform app_private.w08_assert_content_policy(_msg.title, _msg.body);
  perform app_private.w08_assert_source_operation_scope(_msg);

  select coalesce(array_agg(person_id), array[]::uuid[]) into _people
  from app_private.w08_resolve_audience(_msg);

  if coalesce(array_length(_people,1),0) = 0 then
    raise exception 'This message has no resolved audience';
  end if;

  perform app_private.w08_assert_explicit_people_in_operation(_msg,
    (select coalesce(array_agg(s.person_id), array[]::uuid[])
     from public.message_audience_selectors s
     where s.message_id = _message_id and s.selector_kind = 'explicit_person'));

  if _idempotency_key is not null then
    begin
      insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
      values (_msg.tenant_id, auth.uid(), 'w08.publish_message', _idempotency_key, '{}'::jsonb);
    exception when unique_violation then
      select result into _prev from public.idempotency_keys
      where actor_profile_id = auth.uid() and action = 'w08.publish_message'
        and idempotency_key = _idempotency_key;
      return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed', true);
    end;
  end if;

  select coalesce(array_agg(person_id), array[]::uuid[]) into _eligible
  from app_private.w08_in_app_eligible_recipients(_msg.tenant_id, _msg.operation_id, _people);

  perform set_config('app.w08_control','on', true);
  insert into public.message_recipients (tenant_id, message_id, person_id, in_app_eligible)
  select _msg.tenant_id, _msg.id, p, p = any(_eligible)
  from unnest(_people) as t(p);
  get diagnostics _recipients = row_count;
  perform set_config('app.w08_control','off', true);

  perform app_private.w08_record_communication_event(
    _msg, 'MESSAGE_PUBLISHED', null, null, null,
    jsonb_build_object('recipient_count', _recipients), _correlation);

  _delivered := app_private.w08_create_in_app_deliveries(_msg, _correlation);

  perform set_config('app.w08_control','on', true);
  update public.messages set
    status = 'published',
    published_at = now(),
    published_by = auth.uid(),
    recipient_count = _recipients,
    in_app_reachable_count = _delivered
  where id = _message_id
  returning * into _msg;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.message_published',
    'message', _message_id, coalesce(_idempotency_key, _correlation),
    jsonb_build_object('recipient_count', _recipients, 'in_app_reachable_count', _delivered));

  _result := jsonb_build_object('message_id', _message_id, 'status', 'published', 'unchanged', false,
    'summary', app_private.w08_message_delivery_summary(_message_id));

  if _idempotency_key is not null then
    update public.idempotency_keys set result = _result
    where actor_profile_id = auth.uid() and action = 'w08.publish_message'
      and idempotency_key = _idempotency_key;
  end if;
  return _result;
end; $function$;