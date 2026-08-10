do $$
declare t text;
begin
  foreach t in array array['venues','venue_spaces','events','event_sessions',
                           'event_session_speakers','event_staff_assignments',
                           'event_runtime_events'] loop
    execute format('alter table public.%I no force row level security', t);
  end loop;
end $$;