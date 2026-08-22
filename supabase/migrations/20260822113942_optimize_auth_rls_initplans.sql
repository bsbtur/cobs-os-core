alter policy profiles_select_self on public.profiles using (id = (select auth.uid()));
alter policy profiles_update_self on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy idempotency_select_self on public.idempotency_keys using (actor_profile_id = (select auth.uid()));
alter policy "w10 participant reads own grant" on public.participant_access_grants using (profile_id = (select auth.uid()));