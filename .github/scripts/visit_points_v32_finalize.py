from pathlib import Path

# Sync new RPCs into the generated Supabase type map without replacing the whole file.
types_path = Path("src/integrations/supabase/types.ts")
text = types_path.read_text()

if "      archive_journey_visit_point: {" not in text:
    anchor = "      create_journey_visit_point: {"
    block = '''      archive_journey_visit_point: {
        Args: { _reason?: string; _visit_point_id: string };
        Returns: Json;
      };
'''
    if anchor not in text:
        raise SystemExit("create_journey_visit_point type anchor missing")
    text = text.replace(anchor, block + anchor, 1)

if "      reorder_journey_visit_points: {" not in text:
    anchor = "      set_journey_visit_point_status: {"
    block = '''      reorder_journey_visit_points: {
        Args: { _journey_step_id: string; _visit_point_ids: string[] };
        Returns: Json;
      };
      update_journey_visit_point: {
        Args: {
          _guide_tip?: string;
          _interpretation?: string;
          _title: string;
          _visit_point_id: string;
        };
        Returns: Json;
      };
'''
    if anchor not in text:
        raise SystemExit("set_journey_visit_point_status type anchor missing")
    text = text.replace(anchor, block + anchor, 1)

types_path.write_text(text)

# Archived visit points must never surface in the runtime Cockpit.
panel_path = Path("src/components/journey/visit-points-panel.tsx")
panel = panel_path.read_text()
panel = panel.replace(
    'import type { Tables } from "@/integrations/supabase/types";',
    'import type { Json, Tables } from "@/integrations/supabase/types";',
    1,
)

helper_anchor = '''type PointWithStatus = VisitPoint & {
  status: VisitPointStatus;
};
'''
helper = helper_anchor + '''
function isArchived(metadata: Json) {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      metadata.archived === true,
  );
}
'''
if "function isArchived(metadata: Json)" not in panel:
    if helper_anchor not in panel:
        raise SystemExit("PointWithStatus anchor missing")
    panel = panel.replace(helper_anchor, helper, 1)

old_map = '''      return (pointsResult.data ?? []).map<PointWithStatus>((point) => ({
        ...point,
        status: latestStatus(point.id, events),
      }));'''
new_map = '''      return (pointsResult.data ?? [])
        .filter((point) => !isArchived(point.metadata))
        .map<PointWithStatus>((point) => ({
          ...point,
          status: latestStatus(point.id, events),
        }));'''
if old_map in panel:
    panel = panel.replace(old_map, new_map, 1)
elif new_map not in panel:
    raise SystemExit("runtime point map anchor missing")

panel_path.write_text(panel)
