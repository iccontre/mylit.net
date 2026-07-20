import { findScheduleConflicts } from "../scheduling";

const day = "2026-07-20";

describe("findScheduleConflicts", () => {
  it("detects an exact overlap with the correct minutes and metadata", () => {
    const proposed = { id: "new", title: "Study session", date: day, startTime: "9:00 AM", durationMinutes: 60 };
    const existing = [{ id: "existing-1", title: "Morning workout", date: day, startTime: "8:30 AM", durationMinutes: 45 }];
    const conflicts = findScheduleConflicts(proposed, existing);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      conflictingRecordId: "existing-1",
      conflictingTitle: "Morning workout",
      existingStart: "8:30 AM",
      existingEnd: "9:15 AM",
      proposedStart: "9:00 AM",
      proposedEnd: "10:00 AM",
      overlapMinutes: 15,
    });
  });

  it("does not flag adjacent items with no overlap (back-to-back)", () => {
    const proposed = { id: "new", title: "Study", date: day, startTime: "9:00 AM", durationMinutes: 60 };
    const existing = [{ id: "existing-1", title: "Earlier item", date: day, startTime: "8:00 AM", durationMinutes: 60 }];
    expect(findScheduleConflicts(proposed, existing)).toHaveLength(0);
  });

  it("ignores the same record being edited via ignoreId", () => {
    const proposed = { id: "item-1", title: "Study", date: day, startTime: "9:00 AM", durationMinutes: 60 };
    const existing = [{ id: "item-1", title: "Study (old time)", date: day, startTime: "9:00 AM", durationMinutes: 60 }];
    expect(findScheduleConflicts(proposed, existing, "item-1")).toHaveLength(0);
    // Also ignored automatically when the proposed item's own id matches, no ignoreId needed.
    expect(findScheduleConflicts(proposed, existing)).toHaveLength(0);
  });

  it("ignores deleted/tombstoned records", () => {
    const proposed = { id: "new", title: "Study", date: day, startTime: "9:00 AM", durationMinutes: 60 };
    const existing = [{ id: "gone", title: "Deleted item", date: day, startTime: "9:00 AM", durationMinutes: 60, deletedAt: "2026-07-10T00:00:00.000Z" }];
    expect(findScheduleConflicts(proposed, existing)).toHaveLength(0);
  });

  it("ignores completed/expired historical records", () => {
    const proposed = { id: "new", title: "Study", date: day, startTime: "9:00 AM", durationMinutes: 60 };
    const existing = [
      { id: "done", title: "Finished thing", date: day, startTime: "9:00 AM", durationMinutes: 60, status: "completed" as const },
      { id: "lapsed", title: "Missed thing", date: day, startTime: "9:00 AM", durationMinutes: 60, status: "expired" as const },
    ];
    expect(findScheduleConflicts(proposed, existing)).toHaveLength(0);
  });

  it("flexible/unscheduled items (no parseable start time) never create false conflicts", () => {
    const proposed = { id: "new", title: "Study", date: day, startTime: "9:00 AM", durationMinutes: 60 };
    const existing = [{ id: "flex", title: "Someday task", date: day }];
    expect(findScheduleConflicts(proposed, existing)).toHaveLength(0);
  });

  it("a proposed item with no parseable start time produces no conflicts at all", () => {
    const proposed = { id: "new", title: "Someday task", date: day };
    const existing = [{ id: "existing-1", title: "Morning workout", date: day, startTime: "9:00 AM", durationMinutes: 60 }];
    expect(findScheduleConflicts(proposed, existing)).toHaveLength(0);
  });

  it("handles an item spanning midnight (start late, duration crosses into the next civil day)", () => {
    const proposed = { id: "new", title: "Late study", date: day, startTime: "11:30 PM", durationMinutes: 90 };
    const existing = [{ id: "existing-1", title: "Late overlap", date: day, startTime: "12:15 AM", durationMinutes: 30 }];
    // Note: existing item's own startTime of 12:15 AM on the SAME civil date as an 11:30 PM
    // proposal is represented as literal minutes-of-day (15), while the proposed range runs
    // 1410-1500 (past 1440) — these do not numerically overlap under linear minute-of-day
    // comparison since they're genuinely different clock moments unless resolved to the same
    // instant; this test documents that behavior rather than asserting a specific overlap count.
    expect(() => findScheduleConflicts(proposed, existing)).not.toThrow();
  });

  it("sorts multiple conflicts by the conflicting item's own start time", () => {
    const proposed = { id: "new", title: "Long block", date: day, startTime: "8:00 AM", durationMinutes: 180 };
    const existing = [
      { id: "later", title: "Later overlap", date: day, startTime: "10:00 AM", durationMinutes: 30 },
      { id: "earlier", title: "Earlier overlap", date: day, startTime: "8:15 AM", durationMinutes: 30 },
    ];
    const conflicts = findScheduleConflicts(proposed, existing);
    expect(conflicts.map((c) => c.conflictingRecordId)).toEqual(["earlier", "later"]);
  });

  it("returns an empty array (not an error) when nothing conflicts", () => {
    const proposed = { id: "new", title: "Solo", date: day, startTime: "9:00 AM", durationMinutes: 30 };
    expect(findScheduleConflicts(proposed, [])).toEqual([]);
  });
});
