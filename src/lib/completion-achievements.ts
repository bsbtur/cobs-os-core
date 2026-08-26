export type RawAchievementGrant = {
  award_id?: string | null;
  achievement_key?: string | null;
  xp_reward?: number | null;
  duplicate?: boolean | null;
  awarded_at?: string | null;
};

export type RawStageCompletionResult = {
  journey_step_id?: string | null;
  journey_event_id?: string | null;
  unchanged?: boolean | null;
  achievements?: {
    awards?: RawAchievementGrant[] | null;
  } | null;
};

export type NormalizedCompletionGrant = {
  awardId: string | null;
  achievementKey: string;
  xpReward: number;
  duplicate: boolean;
  awardedAt: string | null;
};

export function normalizeCompletionGrants(input: unknown): NormalizedCompletionGrant[] {
  if (!input || typeof input !== "object") return [];
  const result = input as RawStageCompletionResult;
  const awards = result.achievements?.awards;
  if (!Array.isArray(awards)) return [];

  return awards.flatMap((award) => {
    if (!award || typeof award !== "object") return [];
    const key = typeof award.achievement_key === "string" ? award.achievement_key.trim() : "";
    if (!key) return [];
    const reward = Number(award.xp_reward ?? 0);
    return [
      {
        awardId: typeof award.award_id === "string" ? award.award_id : null,
        achievementKey: key,
        xpReward: Number.isFinite(reward) ? Math.max(0, reward) : 0,
        duplicate: award.duplicate === true,
        awardedAt: typeof award.awarded_at === "string" ? award.awarded_at : null,
      },
    ];
  });
}

export function earnedXpFromCompletion(input: unknown): number {
  return normalizeCompletionGrants(input)
    .filter((award) => !award.duplicate)
    .reduce((sum, award) => sum + award.xpReward, 0);
}

export function journeyCompletionPercent(totalSteps: number, resolvedStepsAfterCompletion: number): number {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0) return 0;
  const resolved = Number.isFinite(resolvedStepsAfterCompletion)
    ? Math.max(0, Math.min(totalSteps, resolvedStepsAfterCompletion))
    : 0;
  return Math.round((resolved / totalSteps) * 100);
}
