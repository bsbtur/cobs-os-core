REVOKE ALL PRIVILEGES ON TABLE
  public.hospitality_properties,
  public.hospitality_stays,
  public.hospitality_rooms,
  public.hospitality_stay_participations,
  public.hospitality_room_assignments,
  public.hospitality_events
FROM anon;

REVOKE ALL PRIVILEGES ON TABLE
  public.hospitality_properties,
  public.hospitality_stays,
  public.hospitality_rooms,
  public.hospitality_stay_participations,
  public.hospitality_room_assignments,
  public.hospitality_events
FROM authenticated;

GRANT SELECT ON TABLE
  public.hospitality_properties,
  public.hospitality_stays,
  public.hospitality_rooms,
  public.hospitality_stay_participations,
  public.hospitality_room_assignments,
  public.hospitality_events
TO authenticated;

GRANT ALL ON TABLE
  public.hospitality_properties,
  public.hospitality_stays,
  public.hospitality_rooms,
  public.hospitality_stay_participations,
  public.hospitality_room_assignments,
  public.hospitality_events
TO service_role;