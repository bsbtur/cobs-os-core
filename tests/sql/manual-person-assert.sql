select set_config('test.tenant','ffffffff-ffff-ffff-ffff-ffffffffffff',false);
select set_config('test.role','owner',false);
do $$
declare r jsonb; first_id uuid; other_id uuid; blocked boolean;
begin
 r:=public.create_person_manual('ffffffff-ffff-ffff-ffff-ffffffffffff','Manual One','MANUAL@example.test','+5561991111111','manual-key-1');
 first_id:=(r->>'person_id')::uuid;
 if first_id is null or (r->>'unchanged')::boolean then raise exception 'first_create_failed';end if;
 r:=public.create_person_manual('ffffffff-ffff-ffff-ffff-ffffffffffff','Manual One','manual@example.test','+5561991111111','manual-key-1');
 if (r->>'person_id')::uuid<>first_id or (r->>'unchanged')::boolean is distinct from true then raise exception 'retry_failed';end if;
 blocked:=false;
 begin perform public.create_person_manual('ffffffff-ffff-ffff-ffff-ffffffffffff','Different Name','manual@example.test',null,'manual-key-1');
 exception when others then blocked:=sqlerrm='manual_person_idempotency_conflict';end;
 if not blocked then raise exception 'idempotency_mismatch_not_blocked';end if;
 blocked:=false;
 begin perform public.create_person_manual('ffffffff-ffff-ffff-ffff-ffffffffffff','Duplicate',' MANUAL@EXAMPLE.TEST ',null,'another-key');
 exception when others then blocked:=sqlerrm='person_email_conflict_requires_review';end;
 if not blocked then raise exception 'duplicate_email_not_blocked';end if;
 r:=public.create_person_manual('ffffffff-ffff-ffff-ffff-ffffffffffff','Manual Two','other@example.test','+5561991111111','manual-key-2');
 other_id:=(r->>'person_id')::uuid;
 if other_id=first_id then raise exception 'shared_phone_merged';end if;
 r:=public.create_person_manual('ffffffff-ffff-ffff-ffff-ffffffffffff','No email',null,'+5561991111111','manual-key-3');
 if (r->>'person_id') is null then raise exception 'missing_email_rejected';end if;
 perform set_config('test.role','operations_agent',true);
 blocked:=false;
 begin perform public.create_person_manual('ffffffff-ffff-ffff-ffff-ffffffffffff','Unauthorized','u@example.test',null,'manual-key-4');
 exception when others then blocked:=sqlerrm='manual_person_unauthorized';end;
 if not blocked then raise exception 'operator_allowed';end if;
 perform set_config('test.role','owner',true);
 blocked:=false;
 begin perform public.create_person_manual('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Foreign','foreign@example.test',null,'manual-key-5');
 exception when others then blocked:=sqlerrm='manual_person_unauthorized';end;
 if not blocked then raise exception 'tenant_escape_allowed';end if;
 if (select count(*) from public.commercial_leads where id in ('20000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000009') and converted_person_id is not null)<>3 then raise exception 'commercial_leads_changed';end if;
end $$;

-- Deletion must preserve the idempotency request as a tombstone.
do $$
declare _id uuid; _blocked boolean := false;
begin
 select person_id into _id
 from app_private.manual_person_creation_requests
 where tenant_id='ffffffff-ffff-ffff-ffff-ffffffffffff' and idempotency_key='manual-key-1';
 delete from public.people where id=_id and tenant_id='ffffffff-ffff-ffff-ffff-ffffffffffff';
 if exists (
   select 1 from app_private.manual_person_creation_requests
   where idempotency_key='manual-key-1' and person_id is not null
 ) then raise exception 'deleted_person_reference_not_cleared'; end if;
 begin
   perform public.create_person_manual(
     'ffffffff-ffff-ffff-ffff-ffffffffffff',
     'Manual One','manual@example.test','+5561991111111','manual-key-1'
   );
 exception when others then _blocked := sqlerrm='manual_person_previous_person_deleted'; end;
 if not _blocked then raise exception 'deleted_person_retry_not_blocked'; end if;
 if exists(select 1 from public.people where email='manual@example.test') then
   raise exception 'deleted_person_recreated';
 end if;
 if not exists (
   select 1 from app_private.manual_person_creation_requests
   where idempotency_key='manual-key-1' and person_id is null
 ) then raise exception 'idempotency_history_missing'; end if;
end $$;

-- A non-email UNIQUE violation must remain SQLSTATE 23505 with its real constraint.
create unique index manual_person_unrelated_unique_test on public.people(full_name)
where full_name='Manual Two';
do $$
declare _blocked boolean := false; _constraint text;
begin
 begin
   perform public.create_person_manual(
     'ffffffff-ffff-ffff-ffff-ffffffffffff',
     'Manual Two','unrelated@example.test',null,'manual-key-unrelated'
   );
 exception when unique_violation then
   get stacked diagnostics _constraint = CONSTRAINT_NAME;
   _blocked := _constraint = 'manual_person_unrelated_unique_test';
 end;
 if not _blocked then raise exception 'unrelated_unique_violation_misclassified'; end if;
 if exists(select 1 from public.people where email='unrelated@example.test') then
   raise exception 'unrelated_unique_insert_not_rolled_back'; end if;
 if exists(select 1 from app_private.manual_person_creation_requests
           where idempotency_key='manual-key-unrelated') then
   raise exception 'unrelated_unique_ledger_not_rolled_back'; end if;
end $$;
