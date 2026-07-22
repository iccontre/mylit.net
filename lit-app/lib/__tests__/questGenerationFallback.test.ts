import { buildFallbackQuestGeneration } from "../questGenerationFallback";
import type { QuestGenerationContext } from "../agentTypes";

function baseContext(overrides: Partial<QuestGenerationContext> = {}): QuestGenerationContext {
  return {
    requestId: "req-1",
    logicalDayKey: "2026-07-20",
    source: "morning_checkin",
    acceptedPathContextIds: [],
    acceptedLunaContextIds: [],
    calendarSnapshotHash: "hash",
    lifeProfile: {},
    learningMemory: { lastUpdatedAt: new Date(0).toISOString() },
    ...overrides,
  };
}

describe("buildFallbackQuestGeneration — morning_checkin", () => {
  it("produces exactly two same-goal alternatives when an intention is set", () => {
    const result = buildFallbackQuestGeneration(baseContext({ intention: "finish the reading for class" }), "missing_key");
    expect(result.proposals).toHaveLength(2);
    const push = result.proposals.find((p) => p.variantLabel === "push_forward")!;
    const focused = result.proposals.find((p) => p.variantLabel === "focused_pace")!;
    expect(push).toBeDefined();
    expect(focused).toBeDefined();
    expect(push.title).toBe(focused.title);
    expect(push.durationMinutes).toBeGreaterThan(focused.durationMinutes);
  });

  it("Push Forward costs more energy than Focused Pace for a progress intention", () => {
    const result = buildFallbackQuestGeneration(baseContext({ intention: "write the essay outline" }), "error");
    const push = result.proposals.find((p) => p.variantLabel === "push_forward")!;
    const focused = result.proposals.find((p) => p.variantLabel === "focused_pace")!;
    expect(push.mode).toBe("progress");
    // Progress energy cost is negative — "costs more" means a larger magnitude (more negative).
    expect(push.energyCost).toBeLessThan(focused.energyCost);
  });

  it("produces no proposals when there is no intention", () => {
    const result = buildFallbackQuestGeneration(baseContext({ intention: "" }), "missing_key");
    expect(result.proposals).toHaveLength(0);
  });

  it("marks the result with the fallback reason and requestId", () => {
    const result = buildFallbackQuestGeneration(baseContext({ intention: "go for a run" }), "quota_exceeded");
    expect(result.aiUnavailableReason).toBe("quota_exceeded");
    expect(result.requestId).toBe("req-1");
  });
});

describe("buildFallbackQuestGeneration — afternoon_checkin", () => {
  it("produces at most one progress and one recovery proposal", () => {
    const result = buildFallbackQuestGeneration(
      baseContext({ source: "afternoon_checkin", intention: "finish the reading", availableMinutes: 60 }),
      "error"
    );
    const progressCount = result.proposals.filter((p) => p.mode === "progress").length;
    const recoveryCount = result.proposals.filter((p) => p.mode === "recovery").length;
    expect(progressCount).toBeLessThanOrEqual(1);
    expect(recoveryCount).toBeLessThanOrEqual(1);
  });

  it("omits the progress proposal when very little time remains", () => {
    const result = buildFallbackQuestGeneration(
      baseContext({ source: "afternoon_checkin", intention: "finish the reading", availableMinutes: 5 }),
      "error"
    );
    expect(result.proposals.some((p) => p.mode === "progress")).toBe(false);
  });
});

describe("buildFallbackQuestGeneration — onboarding_week", () => {
  it("produces one progress and one recovery proposal per target date", () => {
    const dates = ["2026-07-20", "2026-07-21", "2026-07-22"];
    const result = buildFallbackQuestGeneration(
      baseContext({ source: "onboarding_week", targetWeekDates: dates, milestones: { twoWeek: "Finish chapter 1" } }),
      "missing_key"
    );
    for (const dateKey of dates) {
      const dayProposals = result.proposals.filter((p) => p.targetDateKey === dateKey);
      expect(dayProposals.some((p) => p.mode === "progress")).toBe(true);
      expect(dayProposals.some((p) => p.mode === "recovery")).toBe(true);
    }
  });
});
