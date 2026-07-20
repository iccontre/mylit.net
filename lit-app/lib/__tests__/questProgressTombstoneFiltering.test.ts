import {
  computeUserScheduledMinutesForDay,
  hasTodayQuickThoughts,
  collectExpiredUnresolvedQuickThoughts,
} from "../questProgress";

const dateKey = "2026-07-20";

describe("computeUserScheduledMinutesForDay excludes tombstoned quick thoughts/Future Quests from capacity", () => {
  it("a deleted item does not count toward the day's scheduled minutes", () => {
    const minutes = computeUserScheduledMinutesForDay({
      dateKey,
      weekday: "Monday",
      quickThoughts: [
        { id: "keep", date: dateKey, durationMinutes: 30, status: "scheduled" },
        { id: "gone", date: dateKey, durationMinutes: 90, status: "scheduled", deletedAt: "2026-07-10T00:00:00.000Z" },
      ] as never,
      dayPlan: null,
    });
    expect(minutes).toBe(30);
  });
});

describe("hasTodayQuickThoughts excludes tombstoned items", () => {
  it("a deleted item does not count as a quick thought scheduled today", () => {
    const result = hasTodayQuickThoughts({
      quickThoughts: [{ id: "gone", date: dateKey, text: "Deleted", deletedAt: "2026-07-10T00:00:00.000Z" }] as never,
      todayKey: dateKey,
    });
    expect(result).toBe(false);
  });
});

describe("collectExpiredUnresolvedQuickThoughts excludes tombstoned items — deletion is not a miss", () => {
  it("a deleted, unresolved item never gets swept into missed", () => {
    const results = collectExpiredUnresolvedQuickThoughts({
      quickThoughts: [{ id: "gone", date: "2026-07-01", text: "Old deleted thing", deletedAt: "2026-07-10T00:00:00.000Z" }] as never,
      completedIds: new Set(),
      missedIds: new Set(),
    });
    expect(results).toHaveLength(0);
  });
});
