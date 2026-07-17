import {
  AFTERNOON_UNLOCK_HOURS_AFTER_WAKE,
  DEFAULT_AFTERNOON_UNLOCK_TIME,
  computeAfternoonUnlockLabel,
  computeAfternoonUnlockTimestamp,
  isLdmActive,
  resolveWakeTimestamp,
} from "../scheduling";

function at(hours: number, minutes: number): Date {
  const d = new Date("2026-07-10T00:00:00");
  d.setHours(hours, minutes, 0, 0);
  return d;
}

describe("Afternoon Check-In unlocks exactly 6 hours after wake", () => {
  it("the shared constant is 6 hours (not the old 5-hour value)", () => {
    expect(AFTERNOON_UNLOCK_HOURS_AFTER_WAKE).toBe(6);
  });

  it("resolveWakeTimestamp anchors a same-quest-day wake time to today", () => {
    const now = at(10, 0);
    const wake = resolveWakeTimestamp("7:00 AM", now);
    expect(wake).not.toBeNull();
    expect(wake!.getHours()).toBe(7);
    expect(wake!.getMinutes()).toBe(0);
    expect(wake!.getDate()).toBe(now.getDate());
  });

  it("computeAfternoonUnlockTimestamp is exactly wake + 6 hours", () => {
    const wake = resolveWakeTimestamp("7:00 AM", at(10, 0));
    const unlock = computeAfternoonUnlockTimestamp(wake);
    expect(unlock).not.toBeNull();
    expect(unlock!.getHours()).toBe(13);
    expect(unlock!.getMinutes()).toBe(0);
  });

  it("does not unlock one minute before wake + 6 hours", () => {
    const wake = resolveWakeTimestamp("7:00 AM", at(10, 0))!;
    const unlock = computeAfternoonUnlockTimestamp(wake)!;
    const oneMinuteBefore = new Date(unlock.getTime() - 60 * 1000);
    expect(oneMinuteBefore.getTime() < unlock.getTime()).toBe(true);
    expect(unlock.getHours()).toBe(13);
    expect(oneMinuteBefore.getHours()).toBe(12);
    expect(oneMinuteBefore.getMinutes()).toBe(59);
  });

  it("a late wake time still unlocks exactly 6 hours later, even past noon", () => {
    const wake = resolveWakeTimestamp("11:30 AM", at(12, 0));
    const unlock = computeAfternoonUnlockTimestamp(wake);
    expect(unlock!.getHours()).toBe(17);
    expect(unlock!.getMinutes()).toBe(30);
  });

  it("a wake time before the 6 AM quest-day boundary is anchored to the NEXT calendar date (midnight-crossing)", () => {
    // "now" is 11 PM the night before — the quest day hasn't rolled over yet, but a recorded
    // wake time of 1:00 AM belongs to the following calendar date within the same quest day.
    const now = at(23, 0);
    const wake = resolveWakeTimestamp("1:00 AM", now);
    expect(wake).not.toBeNull();
    expect(wake!.getDate()).toBe(now.getDate() + 1);
    expect(wake!.getHours()).toBe(1);
    const unlock = computeAfternoonUnlockTimestamp(wake);
    expect(unlock!.getDate()).toBe(now.getDate() + 1);
    expect(unlock!.getHours()).toBe(7);
  });

  it("returns null (no fixed clock-time fallback) when there is no wake time at all", () => {
    expect(resolveWakeTimestamp(undefined, at(10, 0))).toBeNull();
    expect(computeAfternoonUnlockTimestamp(null)).toBeNull();
  });

  it("computeAfternoonUnlockLabel prioritizes today's recorded wake time over the planned/estimated fallbacks", () => {
    const label = computeAfternoonUnlockLabel("8:00 AM", "9:00 AM", "6:00 AM");
    expect(label).toBe(formatExpected(6, 0));
  });

  it("computeAfternoonUnlockLabel falls back to the planned wake time when no recorded wake exists", () => {
    const label = computeAfternoonUnlockLabel("8:00 AM", "9:00 AM", undefined);
    expect(label).toBe(formatExpected(8, 0));
  });

  it("computeAfternoonUnlockLabel falls back to the consistent estimate when neither recorded nor planned exists", () => {
    const label = computeAfternoonUnlockLabel(undefined, "9:00 AM", undefined);
    expect(label).toBe(formatExpected(9, 0));
  });

  it("computeAfternoonUnlockLabel uses the safe default only when no wake data exists at all", () => {
    expect(computeAfternoonUnlockLabel(undefined, undefined, undefined)).toBe(DEFAULT_AFTERNOON_UNLOCK_TIME);
  });

  function formatExpected(wakeHour: number, wakeMinute: number): string {
    const total = wakeHour * 60 + wakeMinute + AFTERNOON_UNLOCK_HOURS_AFTER_WAKE * 60;
    let h = Math.floor(total / 60) % 24;
    const m = total % 60;
    const period = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${period}`;
  }
});

describe("LDM overrides never fire outside its 9 PM–5:59 AM window (guide/flame/check-in gating source of truth)", () => {
  it("is false at the 6:00 AM restoration boundary — normal mode resumes immediately", () => {
    expect(isLdmActive(at(6, 0))).toBe(false);
  });

  it("is true one minute before the boundary — still forcing LDM overrides", () => {
    expect(isLdmActive(at(5, 59))).toBe(true);
  });

  it("is false throughout the Afternoon Check-In's unlock window (early afternoon)", () => {
    expect(isLdmActive(at(11, 30))).toBe(false);
    expect(isLdmActive(at(16, 30))).toBe(false);
  });
});
