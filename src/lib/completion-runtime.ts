import { supabase } from "@/integrations/supabase/client";
import {
  journeyCompletionPercent,
  normalizeCompletionGrants,
  type NormalizedCompletionGrant,
} from "@/lib/completion-achievements";

export type CompletionReward = NormalizedCompletionGrant & {
  achievementName: string | null;
  description: string | null;
  rarity: string | null;
  iconKey: string | null;
};

export type CompletionSnapshot = {
  raw: unknown;
  awards: CompletionReward[];
  previousXp: number;
  totalXp: number;
  journeyProgressPercent: number;
};

type AchievementSummary = {
  xp?: number | string | null;
};

type AchievementHistoryRow = {
  award_id?: string | null;
  achievement_key?: string | null;
  achievement_name?: string | null;
  description?: string | null;
  rarity?: string | null;
  xp_reward?: number | null;
  icon_key?: string | null;
};

function numberOrZero(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

async function achievementSummary(tenantId: string): Promise<AchievementSummary | null> {
  // V3.1-A RPCs are introduced by this branch; generated Supabase client types
  // intentionally remain untouched until the migration is merged/generated.
  const client = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc("get_my_achievement_summary", { _tenant_id: tenantId });
  if (error) throw error;
  return data && typeof data === "object" ? (data as AchievementSummary) : null;
}

async function achievementHistory(tenantId: string): Promise<AchievementHistoryRow[]> {
  const client = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc("list_my_achievements", { _tenant_id: tenantId });
  if (error) throw error;
  return Array.isArray(data) ? (data as AchievementHistoryRow[]) : [];
}

async function resolvedStepCount(operationId: string): Promise<number> {
  const { data, error } = await supabase
    .from("journey_events")
    .select("journey_step_id, event_type")
    .eq("operation_id", operationId)
    .in("event_type", ["STEP_COMPLETED", "STEP_SKIPPED"]);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.journey_step_id).filter(Boolean)).size;
}

export async function runJourneyCommand(input: {
  fn: string;
  stepId: string;
  tenantId: string;
  operationId: string;
  totalSteps: number;
}): Promise<{ data: unknown; completion: CompletionSnapshot | null }> {
  let previousXp = 0;
  if (input.fn === "complete_journey_step") {
    try {
      previousXp = numberOrZero((await achievementSummary(input.tenantId))?.xp);
    } catch {
      // Completion must never be blocked because the decorative pre-read failed.
      // We recover after the canonical mutation using the returned XP grants.
    }
  }

  const { data, error } = await supabase.rpc(input.fn as "start_journey_step", {
    _journey_step_id: input.stepId,
  });
  if (error) throw error;

  if (input.fn !== "complete_journey_step") return { data, completion: null };

  const grants = normalizeCompletionGrants(data);
  const earnedXp = grants
    .filter((grant) => !grant.duplicate)
    .reduce((sum, grant) => sum + grant.xpReward, 0);

  let totalXp = previousXp + earnedXp;
  let history: AchievementHistoryRow[] = [];
  let progress = 0;

  const [summaryResult, historyResult, resolvedResult] = await Promise.allSettled([
    achievementSummary(input.tenantId),
    achievementHistory(input.tenantId),
    resolvedStepCount(input.operationId),
  ]);

  if (summaryResult.status === "fulfilled") {
    totalXp = numberOrZero(summaryResult.value?.xp);
    if (previousXp === 0 && earnedXp > 0) previousXp = Math.max(0, totalXp - earnedXp);
  }
  if (historyResult.status === "fulfilled") history = historyResult.value;
  if (resolvedResult.status === "fulfilled") {
    progress = journeyCompletionPercent(input.totalSteps, resolvedResult.value);
  }

  const byAwardId = new Map(
    history
      .filter((row) => typeof row.award_id === "string")
      .map((row) => [row.award_id as string, row] as const),
  );
  const byKey = new Map(
    history
      .filter((row) => typeof row.achievement_key === "string")
      .map((row) => [row.achievement_key as string, row] as const),
  );

  const awards: CompletionReward[] = grants.map((grant) => {
    const canonical =
      (grant.awardId ? byAwardId.get(grant.awardId) : undefined) ?? byKey.get(grant.achievementKey);
    return {
      ...grant,
      achievementName: canonical?.achievement_name ?? null,
      description: canonical?.description ?? null,
      rarity: canonical?.rarity ?? null,
      iconKey: canonical?.icon_key ?? null,
      xpReward: numberOrZero(canonical?.xp_reward ?? grant.xpReward),
    };
  });

  return {
    data,
    completion: {
      raw: data,
      awards,
      previousXp,
      totalXp,
      journeyProgressPercent: progress,
    },
  };
}
