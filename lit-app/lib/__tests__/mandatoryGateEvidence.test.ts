import { mergeMandatoryGateEvidence } from "../progressStore";

function evidence(questDayKey: string, wasProgressToday: boolean) {
  return JSON.stringify({ questDayKey, wasProgressToday });
}

describe("mergeMandatoryGateEvidence", () => {
  it("returns whichever side is non-empty when the other is empty", () => {
    const local = evidence("2026-07-15", true);
    expect(mergeMandatoryGateEvidence(local, "")).toBe(local);
    expect(mergeMandatoryGateEvidence("", local)).toBe(local);
  });

  it("ORs the booleans when both sides agree on today's quest-day", () => {
    const trueSide = evidence("2026-07-15", true);
    const falseSide = evidence("2026-07-15", false);
    // A stale device that hasn't observed Progress yet must never erase another device's
    // already-recorded true for the same day.
    expect(JSON.parse(mergeMandatoryGateEvidence(falseSide, trueSide)).wasProgressToday).toBe(true);
    expect(JSON.parse(mergeMandatoryGateEvidence(trueSide, falseSide)).wasProgressToday).toBe(true);
  });

  it("keeps false when both sides agree today has had no Progress evidence yet", () => {
    const falseSide = evidence("2026-07-15", false);
    expect(JSON.parse(mergeMandatoryGateEvidence(falseSide, falseSide)).wasProgressToday).toBe(false);
  });

  it("a newer quest-day always wins over a stale prior-day record, regardless of its boolean", () => {
    const today = evidence("2026-07-15", false);
    const yesterday = evidence("2026-07-14", true);
    expect(mergeMandatoryGateEvidence(today, yesterday)).toBe(today);
    expect(mergeMandatoryGateEvidence(yesterday, today)).toBe(today);
  });
});
