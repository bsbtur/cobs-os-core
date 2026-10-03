-- COBS OS · operator wall feed and moderation
create or replace function public.get_operation_wall_admin(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _tenant_id uuid;
  _posts jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select tenant_id into _tenant_id from public.operations where id = _operation_id;
  if _tenant_id is null then raise exception 'Operation not found'; end if;
  perform app_private.w10_require_access_operator(_tenant_id);

  select coalesce(jsonb_agg(item order by item->>'published_at' desc), '[]'::jsonb) into _posts
  from (
    select jsonb_build_object(
      'post_id', p.id,
      'status', p.status,
      'kind', p.kind,
      'body', p.body,
      'published_at', p.published_at,
      'author_label', 'Organização',
      'reactions', (
        select coalesce(jsonb_object_agg(r.reaction, r.qty), '{}'::jsonb)
        from (select wr.reaction, count(*)::int qty from public.operation_wall_reactions wr where wr.post_id=p.id group by wr.reaction) r
      ),
      'my_reactions', '[]'::jsonb,
      'comments', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'comment_id', c.id,
          'author_name', split_part(pe.full_name,' ',1),
          'body', c.body,
          'created_at', c.created_at,
          'mine', false
        ) order by c.created_at), '[]'::jsonb)
        from public.operation_wall_comments c
        join public.people pe on pe.id=c.person_id and pe.tenant_id=c.tenant_id
        where c.post_id=p.id and c.deleted_at is null
      ),
      'poll_options', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'option_id', o.id, 'label', o.label, 'position', o.position,
          'votes', (select count(*)::int from public.operation_wall_poll_votes v where v.option_id=o.id),
          'selected', false
        ) order by o.position), '[]'::jsonb)
        from public.operation_wall_poll_options o where o.post_id=p.id
      )
    ) item
    from public.operation_wall_posts p
    where p.operation_id=_operation_id
  ) feed;
  return jsonb_build_object('operation_id',_operation_id,'posts',_posts);
end; $$;

create or replace function public.archive_operation_wall_post(_post_id uuid)
returns boolean
language plpgsql security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _post public.operation_wall_posts;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _post from public.operation_wall_posts where id=_post_id;
  if _post.id is null then raise exception 'Post not found'; end if;
  perform app_private.w10_require_access_operator(_post.tenant_id);
  if _post.status='archived' then return true; end if;
  update public.operation_wall_posts set status='archived', archived_at=now() where id=_post_id;
  perform app_private.record_audit_event(
    _post.tenant_id, auth.uid(), 'operation_wall.post_archived', 'operation_wall_post', _post.id,
    null,
    jsonb_build_object(
      'operation_id', _post.operation_id,
      'from_status', 'published',
      'to_status', 'archived'
    )
  );
  return true;
end; $$;

revoke all on function public.get_operation_wall_admin(uuid) from public;
revoke all on function public.archive_operation_wall_post(uuid) from public;
grant execute on function public.get_operation_wall_admin(uuid) to authenticated, service_role;
grant execute on function public.archive_operation_wall_post(uuid) to authenticated, service_role;
