import { normalizeQuestItems, computePlannedAheadReward, markItemComplete, type CompletionEntry } from "../questProgress";
import { getStepsForItem, getMondayWeekKey } from "../scheduling";

describe("a planned-ahead future quest's precomputed finalSteps flows through to the board and completion unchanged", () => {
  const todayKey = "2026-07-20";

  it("normalizeQuestItems uses the persisted steps value (not a re-derived one) for a Quick Thought item", () => {
    const baseSteps = getStepsForItem(30, "progress");
    const reward = computePlannedAheadReward(new Date(2026, 6, 10), getMondayWeekKey(new Date(2026, 6, 20)), baseSteps);
    expect(reward.eligible).toBe(true);
    expect(reward.finalSteps).toBeGreaterThan(baseSteps);

    const items = normalizeQuestItems({
      quests: [],
      checklist: [],
      quickThoughts: [
        {
          id: "future-1",
          date: todayKey,
          title: "Planned ahead quest",
          durationMinutes: 30,
          classification: "progress",
          steps: reward.finalSteps,
        },
      ],
      todayKey,
      completedIds: new Set(),
      missedIds: new Set(),
      now: new Date(2026, 6, 20, 12, 0),
    });

    const found = items.find((item) => item.title === "Planned ahead quest");
    expect(found).toBeDefined();
    expect(found!.steps).toBe(reward.finalSteps);
    expect(found!.steps).not.toBe(baseSteps);
  });

  it("completing that item awards exactly its precomputed finalSteps once, idempotently", async () => {
    const baseSteps = getStepsForItem(30, "progress");
    const reward = computePlannedAheadReward(new Date(2026, 6, 10), getMondayWeekKey(new Date(2026, 6, 20)), baseSteps);

    const item = {
      id: "future-2",
      title: "Planned ahead quest",
      source: "Quick Thought" as const,
      kind: "progress" as const,
      steps: reward.finalSteps,
      durationMinutes: 30,
    };

    let completions: CompletionEntry[] = [];
    completions = await markItemComplete(item, completions);
    expect(completions).toHaveLength(1);
    expect(completions[0].steps).toBe(reward.finalSteps);

    // Retry / duplicate completion of the same id must not double-award.
    const again = await markItemComplete(item, completions);
    expect(again).toHaveLength(1);
    expect(again[0].steps).toBe(reward.finalSteps);
  });
});
