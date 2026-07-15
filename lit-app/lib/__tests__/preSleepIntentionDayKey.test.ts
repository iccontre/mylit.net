import { getQuestDayKey } from "../scheduling";
import { getTodayKey } from "../questProgress";

/**
 * Regression guard for the Pre-Sleep Intention "doesn't save" bug: the screen used to stamp
 * its `date` field with a plain calendar date (`toLocaleDateString`) while every consumer —
 * index.tsx's loadPreSleepStatus, the Log History screen, LDM's routine/quest projection —
 * already expected the app's logical quest-day key (6 AM boundary, see getQuestDayKey). Those
 * two only diverge between midnight and 6 AM, which is squarely inside the automatic 9 PM-5:59
 * AM LDM window this screen is meant for, so a save made in that window looked successful but
 * was invisible everywhere else. The fix makes pre-sleep-intention.tsx stamp with
 * getQuestDayKey() (imported directly in app/pre-sleep-intention.tsx) instead of its own local
 * calendar-date helper — this test locks in that getQuestDayKey is exactly the function every
 * other consumer already keys by (getTodayKey in questProgress.ts is a documented alias of it),
 * across the exact boundary where the old calendar-date approach diverged from it.
 */
describe("Pre-Sleep Intention day-key contract", () => {
  it("getTodayKey (used by index.tsx's loadPreSleepStatus) is exactly getQuestDayKey", () => {
    expect(getTodayKey()).toBe(getQuestDayKey());
  });

  it("a save made just after midnight keys to the PREVIOUS calendar date, not the new one", () => {
    const justAfterMidnight = new Date("2026-07-15T02:00:00");
    const calendarDate = justAfterMidnight.toLocaleDateString("en-CA");
    const questDayKey = getQuestDayKey(justAfterMidnight);
    expect(questDayKey).not.toBe(calendarDate);
    expect(questDayKey).toBe("2026-07-14");
  });

  it("a save made just before the 6 AM boundary still keys to the previous quest-day", () => {
    const justBeforeBoundary = new Date("2026-07-15T05:59:00");
    expect(getQuestDayKey(justBeforeBoundary)).toBe("2026-07-14");
  });

  it("a save made at/after the 6 AM boundary keys to the new quest-day", () => {
    const atBoundary = new Date("2026-07-15T06:00:00");
    expect(getQuestDayKey(atBoundary)).toBe("2026-07-15");
  });

  it("a save made in the evening keys the same as the plain calendar date (no divergence outside the LDM window)", () => {
    const evening = new Date("2026-07-15T22:00:00");
    expect(getQuestDayKey(evening)).toBe(evening.toLocaleDateString("en-CA"));
  });
});
