import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  computeTodayScopedEarnedSteps,
  computeTotalEarnedSteps,
  getTodayKey,
  loadTodayCompletions,
  markItemComplete,
  reconcileMonotonicTotalSteps,
  saveTodayCompletions,
  type CompletionEntry,
  type HomeQuestItem,
} from "../questProgress";
import { mergeDailyStepsLog } from "../progressStore";

const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const TODAY_PROGRESS_DATE_KEY = "lit_today_progress_date";
const TOTAL_STEPS_FLOOR_KEY = "lit_total_steps_floor";
const DAILY_STEPS_LOG_KEY = "lit_daily_steps_log";

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

  it("a regular (Quest Board) completion rewards its configured steps through the same authoritative path", async () => {
    const item: HomeQuestItem = { id: "quest-1", title: "Regular Quest", source: "Quest", kind: "progress", steps: 5, durationMinutes: 30 };
    const next = await markItemComplete(item, []);
    expect(next[0].steps).toBe(5);
  });

  it("the mandatory Eat-to-restore-energy quest rewards steps on completion", async () => {
    const item: HomeQuestItem = { id: "mandatory-food", title: "Eat to restore energy", source: "Quest", kind: "recovery", steps: 1, durationMinutes: 15 };
    const next = await markItemComplete(item, []);
    expect(next).toHaveLength(1);
    expect(next[0].steps).toBe(1);
    expect(next[0].title).toBe("Eat to restore energy");
  });

  it("the mandatory Relax-to-restore-energy quest rewards steps on completion", async () => {
    const item: HomeQuestItem = { id: "mandatory-rest", title: "Relax to restore energy", source: "Quest", kind: "recovery", steps: 1, durationMinutes: 15 };
    const next = await markItemComplete(item, []);
    expect(next).toHaveLength(1);
    expect(next[0].steps).toBe(1);
    expect(next[0].title).toBe("Relax to restore energy");
  });

  it("affirmations reward +1 step each via the all-time affirmationsCount input, not a per-completion event", () => {
    const withThree = computeTotalEarnedSteps({ dayPlan: null, quickThoughts: [], todayCompletions: [], affirmationsCount: 3 });
    const withFive = computeTotalEarnedSteps({ dayPlan: null, quickThoughts: [], todayCompletions: [], affirmationsCount: 5 });
    expect(withFive - withThree).toBe(2);
  });

  it("multiple rapid completions in quick succession all land without losing an increment", async () => {
    let completions: CompletionEntry[] = [];
    for (let i = 0; i < 10; i++) {
      completions = await markItemComplete(checklistItem(`rapid-${i}`, `Rapid ${i}`, 3), completions);
    }
    expect(completions).toHaveLength(10);
    expect(completions.reduce((sum, e) => sum + e.steps, 0)).toBe(30);
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

describe("two-device synchronization converges without double-counting or regression", () => {
  it("mergeDailyStepsLog takes the higher value per day and sums to the correct combined total", () => {
    // Device A earned 20 on day 1 and 8 on day 2; Device B independently earned 15 on day 1
    // (less than A saw) and hasn't synced day 2 yet.
    const deviceA = JSON.stringify({ "2026-07-13": 20, "2026-07-14": 8 });
    const deviceB = JSON.stringify({ "2026-07-13": 15 });
    const merged = JSON.parse(mergeDailyStepsLog(deviceA, deviceB));
    expect(merged).toEqual({ "2026-07-13": 20, "2026-07-14": 8 });
    const total = Object.values(merged as Record<string, number>).reduce((s, v) => s + v, 0);
    expect(total).toBe(28);
  });

  it("merging is commutative — order of local/cloud does not change the converged result", () => {
    const a = JSON.stringify({ "2026-07-13": 20, "2026-07-14": 8 });
    const b = JSON.stringify({ "2026-07-13": 15, "2026-07-14": 12 });
    expect(JSON.parse(mergeDailyStepsLog(a, b))).toEqual(JSON.parse(mergeDailyStepsLog(b, a)));
  });

  it("merging never loses a day that only exists on one side", () => {
    const local = JSON.stringify({ "2026-07-10": 5 });
    const cloud = JSON.stringify({ "2026-07-11": 9 });
    expect(JSON.parse(mergeDailyStepsLog(local, cloud))).toEqual({ "2026-07-10": 5, "2026-07-11": 9 });
  });
});

describe("totals persist and never regress within a day (reload / cross-device)", () => {
  it("reconcileMonotonicTotalSteps never lets today's total drop below a previously seen value", async () => {
    const first = await reconcileMonotonicTotalSteps(20);
    expect(first).toBe(20);
    // A transient lower recompute (e.g. today's completions momentarily empty during a reload)
    // must not regress the displayed/ranked total.
    const second = await reconcileMonotonicTotalSteps(5);
    expect(second).toBe(20);
    const third = await reconcileMonotonicTotalSteps(35);
    expect(third).toBe(35);
  });

  it("the ledger survives being re-read fresh (simulating a reload)", async () => {
    await reconcileMonotonicTotalSteps(42);
    const stored = await AsyncStorage.getItem(DAILY_STEPS_LOG_KEY);
    const log = JSON.parse(stored ?? "{}");
    expect(log[getTodayKey()]).toBe(42);
  });
});

describe("steps actually accumulate across days instead of freezing at one historical peak (the 156-cap bug)", () => {
  it("a NEW day's completions ADD on top of a previous day's banked total, rather than being maxed against it", async () => {
    // Day 1: user earns 20 steps.
    const day1Total = await reconcileMonotonicTotalSteps(20);
    expect(day1Total).toBe(20);

    // Simulate crossing into day 2: today's live sources reset to a small number (e.g. one
    // new checklist item), and the stored bank date is stale (still "day 1" from the caller's
    // perspective) by writing yesterday's entry directly and clearing today's key — the real
    // app instead relies on getTodayKey() changing, so here we manipulate the ledger directly
    // to prove the SUM behavior rather than the date-detection plumbing (covered by the
    // "stale cross-day completion" suite above).
    const raw = await AsyncStorage.getItem(DAILY_STEPS_LOG_KEY);
    const log = JSON.parse(raw ?? "{}");
    const today = getTodayKey();
    log["2000-01-01"] = log[today] ?? 0; // pretend today's 20 was actually earned "yesterday"
    delete log[today];
    await AsyncStorage.setItem(DAILY_STEPS_LOG_KEY, JSON.stringify(log));

    // Today (a "new day" relative to the banked 2000-01-01 entry) the user earns 5 more steps.
    const combined = await reconcileMonotonicTotalSteps(5);
    // The old max()-based behavior would have returned max(5, 20) = 20 forever. The fixed
    // behavior sums every banked day: 20 (banked) + 5 (today) = 25.
    expect(combined).toBe(25);
  });

  it("an existing user's pre-migration TOTAL_STEPS_FLOOR_KEY value is carried forward exactly once as a legacy entry, never lost", async () => {
    await AsyncStorage.setItem(TOTAL_STEPS_FLOOR_KEY, JSON.stringify(156));
    const total = await reconcileMonotonicTotalSteps(3);
    expect(total).toBe(159); // 156 legacy + 3 earned today
    const raw = await AsyncStorage.getItem(DAILY_STEPS_LOG_KEY);
    const log = JSON.parse(raw ?? "{}");
    expect(log.__legacy__).toBe(156);
  });

  it("computeTodayScopedEarnedSteps excludes affirmations/userStats so they are never double-banked into the daily ledger", () => {
    const todayCompletions: CompletionEntry[] = [
      { id: "x", title: "X", steps: 4, source: "Checklist", dateKey: getTodayKey(), completedAt: new Date().toISOString() },
    ];
    const todayScoped = computeTodayScopedEarnedSteps({ dayPlan: null, quickThoughts: [], todayCompletions });
    expect(todayScoped).toBe(4);
    // computeTotalEarnedSteps adds the always-cumulative pieces on top, confirming the split
    // is consistent with the combined selector Home/Stats also expose.
    const full = computeTotalEarnedSteps({ dayPlan: null, quickThoughts: [], todayCompletions, userStats: { totalSteps: 10 }, affirmationsCount: 2 });
    expect(full).toBe(16);
  });
});
