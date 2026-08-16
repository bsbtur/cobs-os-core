from pathlib import Path

live_path = Path("src/routes/_authenticated/operations.$operationId.live.tsx")
cockpit_path = Path("src/routes/_authenticated/operations.$operationId.cockpit-v2.tsx")

live = live_path.read_text()
cockpit = cockpit_path.read_text()

import_anchor = 'import { LiveTimingStrip } from "@/components/journey/live-timing-strip";\n'
import_line = 'import { JourneyStepActions } from "@/components/journey/journey-step-actions";\n'
if import_line not in live:
    live = live.replace(import_anchor, import_anchor + import_line, 1)

start = live.find("/* ------------------------------------------------------------------ */\n/* Step actions")
end = live.find("/* ------------------------------------------------------------------ */\n/* Page", start)
if start == -1 or end == -1:
    raise SystemExit("StepActions block not found in Live")
live = live[:start] + live[end:]
if "<StepActions" not in live:
    raise SystemExit("StepActions usage not found in Live")
live = live.replace("<StepActions", "<JourneyStepActions", 1)
live_path.write_text(live)

cockpit = cockpit.replace(
    'import { useQuery } from "@tanstack/react-query";',
    'import { useQuery, useQueryClient } from "@tanstack/react-query";',
    1,
)
cockpit_import_anchor = 'import { LiveNextBestAction } from "@/components/journey/live-next-best-action";\n'
if import_line not in cockpit:
    cockpit = cockpit.replace(cockpit_import_anchor, cockpit_import_anchor + import_line, 1)

cockpit = cockpit.replace(
    "  const live = useQuery({",
    "  const queryClient = useQueryClient();\n\n  const live = useQuery({",
    1,
)

old_parallel = "      const [operation, steps, state, items, executions, roster] = await Promise.all(["
new_parallel = "      const [operation, steps, state, items, executions, roster, arrivalFacts] = await Promise.all(["
if old_parallel not in cockpit:
    raise SystemExit("Cockpit Promise.all signature not found")
cockpit = cockpit.replace(old_parallel, new_parallel, 1)

roster_query = '''        supabase
          .from("operation_participations")
          .select("id, participation_kind, status")
          .eq("operation_id", operationId)
          .neq("status", "cancelled"),
'''
arrival_query = roster_query + '''        supabase
          .from("journey_events")
          .select("journey_step_id, event_type")
          .eq("operation_id", operationId)
          .eq("event_type", "ARRIVED"),
'''
if roster_query not in cockpit:
    raise SystemExit("Cockpit roster query anchor not found")
cockpit = cockpit.replace(roster_query, arrival_query, 1)

cockpit = cockpit.replace(
    "      if (roster.error) throw roster.error;\n",
    "      if (roster.error) throw roster.error;\n      if (arrivalFacts.error) throw arrivalFacts.error;\n",
    1,
)

return_anchor = "        roster: (roster.data ?? []) as RosterRow[],\n"
return_extra = return_anchor + '''        arrivedStepIds: new Set(
          (arrivalFacts.data ?? [])
            .map((row) => row.journey_step_id)
            .filter((id): id is string => Boolean(id)),
        ),
'''
if return_anchor not in cockpit:
    raise SystemExit("Cockpit return anchor not found")
cockpit = cockpit.replace(return_anchor, return_extra, 1)

state_anchor = "  const travelersNeedAttention = unconfirmed > 0 || missingPeople > 0;\n"
refresh_block = state_anchor + '''
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["cockpit-v2", operationId] });
    void queryClient.invalidateQueries({ queryKey: ["px04-next-best-action", operationId] });
    void queryClient.invalidateQueries({ queryKey: ["px05-operation-attention", operationId] });
  };
'''
if state_anchor not in cockpit:
    raise SystemExit("Cockpit refresh anchor not found")
cockpit = cockpit.replace(state_anchor, refresh_block, 1)

old_cta = '''          <Button asChild className="min-h-14 w-full justify-between rounded-2xl px-4 text-base">
            <Link to="/operations/$operationId/live" params={{ operationId }}>
              <span>Executar próxima ação</span>
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
          </Button>
'''
new_cta = '''          {current && operation.status === "active" ? (
            <JourneyStepActions
              step={current}
              ready={readiness?.ready ?? false}
              arrived={live.data?.arrivedStepIds.has(current.id) ?? false}
              onRefresh={refresh}
            />
          ) : (
            <Button asChild className="min-h-14 w-full justify-between rounded-2xl px-4 text-base">
              <Link to="/operations/$operationId/live" params={{ operationId }}>
                <span>Executar próxima ação</span>
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
            </Button>
          )}
'''
if old_cta not in cockpit:
    raise SystemExit("Cockpit action CTA not found")
cockpit = cockpit.replace(old_cta, new_cta, 1)
cockpit_path.write_text(cockpit)
