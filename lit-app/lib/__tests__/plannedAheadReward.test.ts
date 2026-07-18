import {
  getMondayWeekKey,
  getNextMondayWeekKey,
  getTargetWeekStartsAt,
  isPlannedAheadEligible,
} from "../scheduling";
import { computePlannedAheadReward } from "../questProgress";

describe("getMondayWeekKey", () => {
  it("resolves a Wednesday to that same week's Monday", () => {
    // 2026-07-15 is a Wednesday
    expect(getMondayWeekKey(new Date(2026, 6, 15))).toBe("2026-07-13");
  });

  it("resolves a Monday to itself", () => {
    expect(getMondayWeekKey(new Date(2026, 6, 13))).toBe("2026-07-13");
  });

  it("resolves a Sunday to the Monday that started that week (not the next one)", () => {
    // 2026-07-19 is a Sunday, belongs to the week that started Monday 2026-07-13
    expect(getMondayWeekKey(new Date(2026, 6, 19))).toBe("2026-07-13");
  });
});

describe("getNextMondayWeekKey", () => {
  it("is exactly 7 days after the current week's Monday", () => {
    expect(getNextMondayWeekKey(new Date(2026, 6, 15))).toBe("2026-07-20");
  });
});

describe("getTargetWeekStartsAt", () => {
  it("is the given week's Monday at exactly 6:00 AM local", () => {
    const startsAt = getTargetWeekStartsAt("2026-07-20");
    expect(startsAt.getFullYear()).toBe(2026);
    expect(startsAt.getMonth()).toBe(6);
    expect(startsAt.getDate()).toBe(20);
    expect(startsAt.getHours()).toBe(6);
    expect(startsAt.getMinutes()).toBe(0);
  });
});

describe("isPlannedAheadEligible", () => {
  const targetWeekKey = "2026-07-20"; // Monday

  it("is eligible when created any time before that Monday 6:00 AM", () => {
    expect(isPlannedAheadEligible(new Date(2026, 6, 19, 23, 59), targetWeekKey)).toBe(true);
    expect(isPlannedAheadEligible(new Date(2026, 6, 13, 0, 0), targetWeekKey)).toBe(true);
  });

  it("is NOT eligible when created exactly at that Monday 6:00 AM", () => {
    expect(isPlannedAheadEligible(new Date(2026, 6, 20, 6, 0), targetWeekKey)).toBe(false);
  });

  it("is NOT eligible when created after that Monday 6:00 AM", () => {
    expect(isPlannedAheadEligible(new Date(2026, 6, 20, 6, 1), targetWeekKey)).toBe(false);
    expect(isPlannedAheadEligible(new Date(2026, 6, 21, 12, 0), targetWeekKey)).toBe(false);
  });
});

describe("computePlannedAheadReward", () => {
  const targetWeekKey = "2026-07-20"; // Monday

  it("applies 1.5x and rounds up (Math.ceil) when created ahead of the target week", () => {
    const createdAt = new Date(2026, 6, 15); // the prior week — eligible
    expect(computePlannedAheadReward(createdAt, targetWeekKey, 1)).toEqual({
      eligible: true, multiplier: 1.5, targetWeekKey, baseSteps: 1, finalSteps: 2,
    });
    expect(computePlannedAheadReward(createdAt, targetWeekKey, 2).finalSteps).toBe(3);
    expect(computePlannedAheadReward(createdAt, targetWeekKey, 3).finalSteps).toBe(5);
    expect(computePlannedAheadReward(createdAt, targetWeekKey, 4).finalSteps).toBe(6);
  });

  it("applies 1x (no rounding change) when created at or after the target week's Monday 6:00 AM", () => {
    const createdAt = new Date(2026, 6, 20, 6, 0);
    expect(computePlannedAheadReward(createdAt, targetWeekKey, 3)).toEqual({
      eligible: false, multiplier: 1, targetWeekKey, baseSteps: 3, finalSteps: 3,
    });
  });
});
