import { collectQuickThoughtScheduledItems } from "../scheduling";

describe("collectQuickThoughtScheduledItems tombstone filtering", () => {
  it("excludes items with deletedAt set — Day Plan, Calendar, and Home's board all read through this one mapper", () => {
    const items = [
      { id: "a", text: "Keep me", date: "2026-07-20" },
      { id: "b", text: "Delete me", date: "2026-07-20", deletedAt: "2026-07-15T00:00:00.000Z" },
    ];
    const result = collectQuickThoughtScheduledItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("a stable steps value passed in (e.g. a planned-ahead final reward) is preserved as-is", () => {
    const items = [{ id: "a", text: "Planned quest", date: "2026-07-20", steps: 3 }];
    const result = collectQuickThoughtScheduledItems(items);
    expect(result[0].steps).toBe(3);
  });
});
