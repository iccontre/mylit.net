import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  computeTotalEarnedSteps,
  getTodayKey,
  loadTodayCompletions,
  markItemComplete,
  reconcileMonotonicTotalSteps,
  saveTodayCompletions,
  type CompletionEntry,
  type HomeQuestItem,
} from "../questProgress";

const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const TODAY_PROGRESS_DATE_KEY = "lit_today_progress_date";
const TOTAL_STEPS_FLOOR_KEY = "lit_total_steps_floor";

function yesterdayKey(today: string): string {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function checklistItem(id: string, title: string, steps: number): HomeQuestItem {
  return { id, title, source: "Checklist", kind: "progress", steps, durationMinutes: 30 };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("stale cross-day completion entries never block today's recurring items (root cause)", () => {
  it("a stale completion from a previous day for the SAME recurring id does not appear in today's completions", async () => {
    const today = getTodayKey();
    const stale = yesterdayKey(today);
    // Simulate what a cross-device array-merge (union by id) can leave behind: a leftover
    // entry for a recurring checklist item's STATIC id (buildStableItemId returns the bare
    // rawId with no date component), dated yesterday, sitting in "today's" storage bucket
    // alongside a correctly-reset date marker.
    await AsyncStorage.setItem(TODAY_PROGRESS_DATE_KEY, today);
    await AsyncStorage.setItem(
      COMPLETED_QUESTS_KEY,
      JSON.stringify([
        { id: "checklist-recurring-1", title: "Recurring Habit", steps: 4, source: "Checklist", dateKey: stale, completedAt: `${stale}T08:00:00.000Z` },
      ])
    );

    const todaysCompletions = await loadTodayCompletions();
    expect(todaysCompletions).toHaveLength(0);
  });

  it("completing the same recurring id again today succeeds instead of silently no-op'ing", async () => {
    const today = getTodayKey();
    const stale = yesterdayKey(today);
    await AsyncStorage.setItem(TODAY_PROGRESS_DATE_KEY, today);
    await AsyncStorage.setItem(
      COMPLETED_QUESTS_KEY,
      JSON.stringify([
        { id: "checklist-recurring-1", title: "Recurring Habit", steps: 4, source: "Checklist", dateKey: stale, completedAt: `${stale}T08:00:00.000Z` },
      ])
    );

    const existing = await loadTodayCompletions();
    const item = checklistItem("checklist-recurring-1", "Recurring Habit", 4);
    const next = await markItemComplete(item, existing);

    expect(next).toHaveLength(1);
    expect(next[0].dateKey).toBe(today);
    expect(next[0].steps).toBe(4);
  });

  it("saveTodayCompletions prunes stale-day entries so corrupted storage self-heals", async () => {
    const today = getTodayKey();
    const stale = yesterdayKey(today);
    const mixed: CompletionEntry[] = [
      { id: "a", title: "A", steps: 4, source: "Checklist", dateKey: today, completedAt: new Date().toISOString() },
      { id: "b", title: "B", steps: 2, source: "Checklist", dateKey: stale, completedAt: `${stale}T08:00:00.000Z` },
    ];
    await saveTodayCompletions(mixed);

    const reloaded = await loadTodayCompletions();
    expect(reloaded.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("reward idempotency and accumulation", () => {
  it("one completion adds exactly its configured steps", async () => {
    const item = checklistItem("solo-1", "Solo Habit", 4);
    const next = await markItemComplete(item, []);
    expect(next).toHaveLength(1);
    expect(next[0].steps).toBe(4);
  });

  it("two different completions accumulate correctly", async () => {
    const first = await markItemComplete(checklistItem("multi-a", "A", 4), []);
    const second = await markItemComplete(checklistItem("multi-b", "B", 2), first);
    expect(second).toHaveLength(2);
    const total = second.reduce((sum, e) => sum + e.steps, 0);
    expect(total).toBe(6);
  });

  it("completing the same quest twice does not double-award", async () => {
    const item = checklistItem("dup-1", "Dup Habit", 4);
    const first = await markItemComplete(item, []);
    const second = await markItemComplete(item, first);
    expect(second).toHaveLength(1);
    expect(second).toBe(first); // markItemComplete returns the SAME array unchanged, not a new one
  });
});

describe("Home and Stats read the same authoritative total", () => {
  it("computeTotalEarnedSteps produces an identical result from identical inputs (the same selector both screens call)", () => {
    const todayCompletions: CompletionEntry[] = [
      { id: "x", title: "X", steps: 4, source: "Checklist", dateKey: getTodayKey(), completedAt: new Date().toISOString() },
    ];
    const homeInput = { dayPlan: null, quickThoughts: [], todayCompletions, userStats: { totalSteps: 10 } };
    const statsInput = { dayPlan: null, quickThoughts: [], todayCompletions, userStats: { totalSteps: 10 } };
    expect(computeTotalEarnedSteps(homeInput)).toBe(computeTotalEarnedSteps(statsInput));
    expect(computeTotalEarnedSteps(homeInput)).toBe(14);
  });
});

describe("totals persist and never regress (reload / cross-device)", () => {
  it("reconcileMonotonicTotalSteps never lets the displayed total drop below a previously seen value", async () => {
    const first = await reconcileMonotonicTotalSteps(20);
    expect(first).toBe(20);
    // A transient lower recompute (e.g. today's completions momentarily empty during a reload)
    // must not regress the displayed/ranked total.
    const second = await reconcileMonotonicTotalSteps(5);
    expect(second).toBe(20);
    const third = await reconcileMonotonicTotalSteps(35);
    expect(third).toBe(35);
  });

  it("the floor survives being re-read fresh (simulating a reload)", async () => {
    await reconcileMonotonicTotalSteps(42);
    const stored = await AsyncStorage.getItem(TOTAL_STEPS_FLOOR_KEY);
    expect(JSON.parse(stored ?? "0")).toBe(42);
  });
});
