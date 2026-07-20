/**
 * Regression test for the same checklist-resurrection bug pattern found a third time:
 * normalizeQueueItem (app/tomorrow-queue.tsx) also built each QueueItem from an explicit field
 * list with no deletedAt/updatedAt passthrough, so a Future Quest tombstoned via Day Plan (same
 * TOMORROW_QUEUE_KEY storage) would reappear active the moment Tomorrow Queue loaded it.
 */
import { normalizeQueueItem } from "../tomorrow-queue";

describe("normalizeQueueItem preserves deletion/audit fields through normalization", () => {
  it("preserves deletedAt on a tombstoned item instead of silently stripping it", () => {
    const item = normalizeQueueItem({ id: "q1", text: "Future quest", date: "2026-07-20", deletedAt: "2026-07-10T00:00:00.000Z" }, 0);
    expect(item.deletedAt).toBe("2026-07-10T00:00:00.000Z");
  });

  it("preserves updatedAt", () => {
    const item = normalizeQueueItem({ id: "q1", text: "Future quest", date: "2026-07-20", updatedAt: "2026-07-10T09:00:00.000Z" }, 0);
    expect(item.updatedAt).toBe("2026-07-10T09:00:00.000Z");
  });

  it("a non-deleted item still normalizes with deletedAt undefined", () => {
    const item = normalizeQueueItem({ id: "q1", text: "Active quest", date: "2026-07-20" }, 0);
    expect(item.deletedAt).toBeUndefined();
  });
});
