/**
 * Regression test for the checklist-resurrection root cause: createChecklist (called from
 * normalizePlan on every loadDayPlan) used to build each ChecklistItem from an explicit field
 * list with no deletedAt/updatedAt/checkedAt passthrough, silently stripping tombstones on
 * every load. Once stripped from both `dayPlan` and `committedPlanRef.current`, a deleted item
 * reappeared in the Day Plan checklist UI, and loadDayPlan's own migration re-persist could
 * permanently overwrite canonical storage with the now-tombstone-free version.
 */
import { createChecklist } from "../day-plan";

describe("createChecklist preserves deletion/audit fields through normalization", () => {
  it("preserves deletedAt on a tombstoned item instead of silently stripping it", () => {
    const [item] = createChecklist("Monday", [
      { id: "habit-1", text: "Read", weekdays: ["Monday"], deletedAt: "2026-07-10T12:00:00.000Z" },
    ]);
    expect(item.deletedAt).toBe("2026-07-10T12:00:00.000Z");
  });

  it("preserves updatedAt and checkedAt", () => {
    const [item] = createChecklist("Monday", [
      { id: "habit-1", text: "Read", weekdays: ["Monday"], updatedAt: "2026-07-10T09:00:00.000Z", checkedAt: "2026-07-09T08:00:00.000Z" },
    ]);
    expect(item.updatedAt).toBe("2026-07-10T09:00:00.000Z");
    expect(item.checkedAt).toBe("2026-07-09T08:00:00.000Z");
  });

  it("a non-deleted item still normalizes with deletedAt undefined", () => {
    const [item] = createChecklist("Monday", [{ id: "habit-1", text: "Read", weekdays: ["Monday"] }]);
    expect(item.deletedAt).toBeUndefined();
  });
});
