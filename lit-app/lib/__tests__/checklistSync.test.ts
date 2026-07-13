/**
 * Regression coverage for the checklist deletion/mode-window/sync bugs fixed alongside the
 * deletedAt tombstone, checkedAt-based quest-day scoping, and recency-aware array merge (see
 * getChecklistItemsForDay/normalizeQuestItems/applyQuestBoardCapacity in questProgress.ts and
 * mergeJsonArrays/entryTimestamp in progressStore.ts).
 */
import { mergeJsonArrays } from "../progressStore";
import {
  applyQuestBoardCapacity,
  getChecklistItemsForDay,
  normalizeQuestItems,
  PROGRESS_CAPACITY_MINUTES,
  RECOVERY_CAPACITY_MINUTES,
  type HomeQuestItem,
} from "../questProgress";

describe("checklist deletion never resurrects across devices", () => {
  it("a tombstoned item beats a stale non-deleted copy regardless of merge order", () => {
    const deletedAt = "2026-07-10T12:00:00.000Z";
    const staleLocal = JSON.stringify([{ id: "habit-1", text: "Read", weekdays: ["Monday"], updatedAt: "2026-07-01T00:00:00.000Z" }]);
    const deletedCloud = JSON.stringify([{ id: "habit-1", text: "Read", weekdays: ["Monday"], deletedAt, updatedAt: deletedAt }]);

    const mergedLocalFirst = JSON.parse(mergeJsonArrays(staleLocal, deletedCloud));
    const mergedCloudFirst = JSON.parse(mergeJsonArrays(deletedCloud, staleLocal));

    expect(mergedLocalFirst).toHaveLength(1);
    expect(mergedLocalFirst[0].deletedAt).toBe(deletedAt);
    expect(mergedCloudFirst).toHaveLength(1);
    expect(mergedCloudFirst[0].deletedAt).toBe(deletedAt);
  });

  it("getChecklistItemsForDay filters tombstoned items out of every read path", () => {
    const plan = {
      weekdayChecklists: {
        Monday: [
          { id: "habit-1", text: "Read", weekdays: ["Monday"] },
          { id: "habit-2", text: "Old, deleted habit", weekdays: ["Monday"], deletedAt: "2026-07-01T00:00:00.000Z" },
        ],
      },
    };
    const items = getChecklistItemsForDay(plan as never, "Monday");
    expect(items.map((i) => i.id)).toEqual(["habit-1"]);
  });
});

describe("stale local data cannot overwrite newer cloud completion/deletion state", () => {
  it("a newer updatedAt wins a merge tie regardless of which side is iterated last", () => {
    const older = JSON.stringify([{ id: "habit-1", checked: false, updatedAt: "2026-07-10T09:00:00.000Z" }]);
    const newer = JSON.stringify([{ id: "habit-1", checked: true, updatedAt: "2026-07-10T10:00:00.000Z" }]);

    expect(JSON.parse(mergeJsonArrays(older, newer))[0].checked).toBe(true);
    expect(JSON.parse(mergeJsonArrays(newer, older))[0].checked).toBe(true);
  });
});

describe("old logical-day checklist state does not leak into today", () => {
  it("an item checked on a previous quest day is not excluded from today's board", () => {
    const checklist = [
      {
        id: "habit-1",
        text: "Stretch",
        checked: true,
        checkedAt: "2026-07-09T20:00:00.000Z", // checked yesterday
        durationMinutes: 15,
        kind: "recovery" as const,
      },
    ];
    const items = normalizeQuestItems({
      quests: [],
      checklist,
      quickThoughts: [],
      todayKey: "2026-07-10",
      completedIds: new Set(),
      missedIds: new Set(),
      now: new Date("2026-07-10T12:00:00.000Z"),
    });
    expect(items.some((i) => i.title === "Stretch")).toBe(true);
  });

  it("an item checked earlier TODAY is excluded from reappearing", () => {
    const checklist = [
      {
        id: "habit-1",
        text: "Stretch",
        checked: true,
        checkedAt: "2026-07-10T08:00:00.000Z",
        durationMinutes: 15,
        kind: "recovery" as const,
      },
    ];
    const items = normalizeQuestItems({
      quests: [],
      checklist,
      quickThoughts: [],
      todayKey: "2026-07-10",
      completedIds: new Set(),
      missedIds: new Set(),
      now: new Date("2026-07-10T12:00:00.000Z"),
    });
    expect(items.some((i) => i.title === "Stretch")).toBe(false);
  });
});

describe("Quest Board never renders the same item twice", () => {
  it("dedupes an item that appears from more than one source path", () => {
    const items = normalizeQuestItems({
      quests: [{ title: "Same Quest", type: "Health" }],
      checklist: [],
      quickThoughts: [{ id: "same-quest-2026-07-10-same-quest", text: "Same Quest", date: "2026-07-10" }],
      todayKey: "2026-07-10",
      completedIds: new Set(),
      missedIds: new Set(),
      now: new Date("2026-07-10T12:00:00.000Z"),
    });
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Progress/Recovery quest board windows", () => {
  function buildItems(count: number, minutes: number): HomeQuestItem[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `checklist-item-${i}`,
      title: `Habit ${i}`,
      source: "Checklist" as const,
      kind: "recovery" as const,
      steps: 1,
      durationMinutes: minutes,
    }));
  }

  it("Recovery mode fits items within its 5-hour window", () => {
    const { capacityMinutes } = applyQuestBoardCapacity(buildItems(3, 60), "Recovery");
    expect(capacityMinutes).toBe(RECOVERY_CAPACITY_MINUTES);
  });

  it("Progress mode fits items within its 8-hour window", () => {
    const { capacityMinutes } = applyQuestBoardCapacity(buildItems(3, 60), "Progress");
    expect(capacityMinutes).toBe(PROGRESS_CAPACITY_MINUTES);
  });

  it("a valid checklist item that fits its own duration is never dropped by the window", () => {
    // Regression: checklist habits must always show if they individually fit the window, even
    // when higher-priority items already claimed the shared capacity pool.
    const bigItem: HomeQuestItem = {
      id: "today-quest-big",
      title: "Big Today Quest",
      source: "Today's Quest",
      kind: "progress",
      steps: 10,
      durationMinutes: RECOVERY_CAPACITY_MINUTES,
      scheduledTime: "9:00 AM",
    };
    const habit: HomeQuestItem = {
      id: "checklist-habit",
      title: "Short Habit",
      source: "Checklist",
      kind: "recovery",
      steps: 1,
      durationMinutes: 15,
    };
    const { visibleItems } = applyQuestBoardCapacity([bigItem, habit], "Recovery");
    expect(visibleItems.some((i) => i.id === "checklist-habit")).toBe(true);
  });
});
