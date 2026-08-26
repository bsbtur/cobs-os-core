import { describe, expect, test } from "bun:test";

import {
  earnedXpFromCompletion,
  journeyCompletionPercent,
  normalizeCompletionGrants,
} from "./completion-achievements";

describe("completion achievements", () => {
  test("normalizes real complete_journey_step awards", () => {
    const result = {
      achievements: {
        awards: [
          {
            award_id: "award-1",
            achievement_key: "explorer",
            xp_reward: 80,
            duplicate: false,
            awarded_at: "2026-08-26T18:00:00Z",
          },
        ],
      },
    };

    expect(normalizeCompletionGrants(result)).toEqual([
      {
        awardId: "award-1",
        achievementKey: "explorer",
        xpReward: 80,
        duplicate: false,
        awardedAt: "2026-08-26T18:00:00Z",
      },
    ]);
    expect(earnedXpFromCompletion(result)).toBe(80);
  });

  test("does not count duplicate awards as newly earned XP", () => {
    const result = {
      achievements: {
        awards: [
          { achievement_key: "first_mission", xp_reward: 100, duplicate: false },
          { achievement_key: "explorer", xp_reward: 80, duplicate: true },
        ],
      },
    };

    expect(earnedXpFromCompletion(result)).toBe(100);
  });

  test("calculates journey progress from recorded resolved steps", () => {
    expect(journeyCompletionPercent(5, 3)).toBe(60);
    expect(journeyCompletionPercent(5, 8)).toBe(100);
    expect(journeyCompletionPercent(0, 0)).toBe(0);
  });
});
