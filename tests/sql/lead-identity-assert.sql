do $$
declare _r jsonb; _blocked boolean; _id uuid;
begin
 _r:=public.convert_commercial_lead_to_person('20000000-0000-0000-0000-000000000001');
 if (_r->>'person_id')::uuid <> '10000000-0000-0000-0000-000000000001' then raise exception 'consistent_identity_failed'; end if;
 _blocked:=false;
 begin perform public.convert_commercial_lead_to_person('20000000-0000-0000-0000-000000000002');
 exception when others then _blocked:=sqlerrm='commercial_lead_identity_conflict'; end;
 if not _blocked then raise exception 'cross_person_collision_not_blocked'; end if;
 _blocked:=false;
 begin perform public.convert_commercial_lead_to_person('20000000-0000-0000-0000-000000000003');
 exception when others then _blocked:=sqlerrm='commercial_lead_identity_conflict'; end;
 if not _blocked then raise exception 'single_person_mismatch_not_blocked'; end if;
 _r:=public.convert_commercial_lead_to_person('20000000-0000-0000-0000-000000000004');
 _id:=(_r->>'person_id')::uuid;
 if _id is null then raise exception 'new_person_not_created'; end if;
 _r:=public.convert_commercial_lead_to_person('20000000-0000-0000-0000-000000000004');
 if (_r->>'person_id')::uuid <> _id or (_r->>'unchanged')::boolean is distinct from true then raise exception 'retry_not_idempotent'; end if;
 if (select count(*) from public.people where email='new@example.test')<>1 then raise exception 'retry_duplicate'; end if;
 if (select count(*) from public.commercial_leads where id in ('20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003') and converted_person_id is not null)<>0 then raise exception 'conflict_mutated_lead'; end if;
end $$;
