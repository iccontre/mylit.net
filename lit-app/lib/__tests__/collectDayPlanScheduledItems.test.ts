import { collectDayPlanScheduledItems } from "../scheduling";

describe("collectDayPlanScheduledItems tombstone filtering (Calendar/conflict-check/capacity source)", () => {
  const plan = {
    weekdayChecklists: {
      Monday: [
        { id: "keep-1", text: "Morning run", weekdays: ["Monday"], startTime: "7:00 AM", durationMinutes: 30 },
        { id: "gone-1", text: "Old deleted habit", weekdays: ["Monday"], startTime: "8:00 AM", durationMinutes: 30, deletedAt: "2026-07-10T00:00:00.000Z" },
      ],
    },
  };
  const resolveDateForWeekday = (weekday: string) => (weekday === "Monday" ? "2026-07-20" : undefined);

  it("excludes tombstoned checklist items from the Calendar/conflict/capacity source", () => {
    const items = collectDayPlanScheduledItems(plan, resolveDateForWeekday);
    const ids = items.map((i) => i.id);
    expect(ids).toContain("keep-1");
    expect(ids).not.toContain("gone-1");
  });

  it("a deleted item is not double-counted or leaked across other weekdays it was assigned to", () => {
    const multiDayPlan = {
      weekdayChecklists: {
        Monday: [{ id: "multi-1", text: "Multi-day habit", weekdays: ["Monday", "Wednesday"], deletedAt: "2026-07-10T00:00:00.000Z" }],
      },
    };
    const items = collectDayPlanScheduledItems(multiDayPlan, resolveDateForWeekday);
    expect(items).toHaveLength(0);
  });
});
