import {
  AFTERNOON_UNLOCK_HOURS_AFTER_WAKE,
  DEFAULT_AFTERNOON_UNLOCK_TIME,
  computeAfternoonUnlockLabel,
  computeAfternoonUnlockTimestamp,
  isLdmActive,
  isMorningReflectionAvailable,
  isOvernightBeforeQuestDay,
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

describe("LDM overrides never fire outside its 9 PM–12:59 AM window (guide/flame/check-in gating source of truth)", () => {
  it("is inactive at 8:59 PM — one minute before LDM starts", () => {
    expect(isLdmActive(at(20, 59))).toBe(false);
  });

  it("is active at exactly 9:00 PM — LDM begins", () => {
    expect(isLdmActive(at(21, 0))).toBe(true);
  });

  it("remains active at 11:59 PM", () => {
    expect(isLdmActive(at(23, 59))).toBe(true);
  });

  it("remains active at midnight (12:00 AM)", () => {
    expect(isLdmActive(at(0, 0))).toBe(true);
  });

  it("remains active at 12:59 AM — the last minute of LDM", () => {
    expect(isLdmActive(at(0, 59))).toBe(true);
  });

  it("is inactive at exactly 1:00 AM — LDM ends", () => {
    expect(isLdmActive(at(1, 0))).toBe(false);
  });

  it("is false at the 6:00 AM quest-day boundary", () => {
    expect(isLdmActive(at(6, 0))).toBe(false);
  });

  it("is false throughout the Afternoon Check-In's unlock window (early afternoon)", () => {
    expect(isLdmActive(at(11, 30))).toBe(false);
    expect(isLdmActive(at(16, 30))).toBe(false);
  });
});

describe("isOvernightBeforeQuestDay covers the wider 9 PM–5:59 AM span that must keep hiding daytime UI even after LDM itself ends at 1 AM", () => {
  it("is inactive at 8:59 PM", () => {
    expect(isOvernightBeforeQuestDay(at(20, 59))).toBe(false);
  });

  it("is active at 9:00 PM", () => {
    expect(isOvernightBeforeQuestDay(at(21, 0))).toBe(true);
  });

  it("is active at midnight", () => {
    expect(isOvernightBeforeQuestDay(at(0, 0))).toBe(true);
  });

  it("stays active at 1:00 AM, unlike isLdmActive — this is the gap where LDM has ended but daytime UI must still stay hidden", () => {
    expect(isOvernightBeforeQuestDay(at(1, 0))).toBe(true);
    expect(isLdmActive(at(1, 0))).toBe(false);
  });

  it("stays active at 5:59 AM", () => {
    expect(isOvernightBeforeQuestDay(at(5, 59))).toBe(true);
  });

  it("is inactive at exactly 6:00 AM — the quest-day boundary", () => {
    expect(isOvernightBeforeQuestDay(at(6, 0))).toBe(false);
  });
});

describe("isMorningReflectionAvailable is available 6:00 AM through 8:59:59 PM", () => {
  it("is locked at 5:59 AM", () => {
    expect(isMorningReflectionAvailable(at(5, 59))).toBe(false);
  });

  it("is available at exactly 6:00 AM", () => {
    expect(isMorningReflectionAvailable(at(6, 0))).toBe(true);
  });

  it("is available at noon", () => {
    expect(isMorningReflectionAvailable(at(12, 0))).toBe(true);
  });

  it("is available at 8:59 PM — the last minute before it locks", () => {
    expect(isMorningReflectionAvailable(at(20, 59))).toBe(true);
  });

  it("is locked at exactly 9:00 PM — the same moment LDM starts", () => {
    expect(isMorningReflectionAvailable(at(21, 0))).toBe(false);
  });

  it("is locked through the night", () => {
    expect(isMorningReflectionAvailable(at(23, 30))).toBe(false);
    expect(isMorningReflectionAvailable(at(0, 0))).toBe(false);
    expect(isMorningReflectionAvailable(at(3, 0))).toBe(false);
  });
});
