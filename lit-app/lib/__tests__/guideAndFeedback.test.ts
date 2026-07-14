import {
  computeAfternoonUnlockLabel,
  DEFAULT_AFTERNOON_UNLOCK_TIME,
  getGuideMessageSlot,
  isMandatoryQuestTitle,
  MANDATORY_ENERGY_QUEST_TITLE,
  MANDATORY_FOOD_QUEST_TITLE,
  MANDATORY_QUEST_TITLE,
  pickGuideMessage,
} from "../scheduling";
import {
  emitQuestCompletionFeedback,
  subscribeToCompletionFeedback,
  __resetCompletionFeedbackForTests,
  type QuestCompletionFeedback,
} from "../completionFeedback";

function at(hours: number, minutes: number): Date {
  const d = new Date("2026-07-10T00:00:00");
  d.setHours(hours, minutes, 0, 0);
  return d;
}

describe("guide message time-slot selection", () => {
  it("6:00 AM is slot 0, and every 30 minutes advances one slot", () => {
    expect(getGuideMessageSlot(at(6, 0))).toBe(0);
    expect(getGuideMessageSlot(at(6, 29))).toBe(0);
    expect(getGuideMessageSlot(at(6, 30))).toBe(1);
    expect(getGuideMessageSlot(at(7, 0))).toBe(2);
  });

  it("11:30 PM is the final slot, and later times do not advance further", () => {
    const finalSlot = getGuideMessageSlot(at(23, 30));
    expect(getGuideMessageSlot(at(23, 45))).toBe(finalSlot);
    expect(getGuideMessageSlot(at(23, 59))).toBe(finalSlot);
  });

  it("midnight through 5:59 AM has no rotation — always resolves to the same (first) slot", () => {
    expect(getGuideMessageSlot(at(0, 0))).toBe(getGuideMessageSlot(at(3, 17)));
    expect(getGuideMessageSlot(at(3, 17))).toBe(getGuideMessageSlot(at(5, 59)));
    expect(getGuideMessageSlot(at(5, 59))).toBe(0);
  });

  it("a mid-slot refresh never changes the resolved slot", () => {
    const slotA = getGuideMessageSlot(at(14, 1));
    const slotB = getGuideMessageSlot(at(14, 20));
    expect(slotA).toBe(slotB);
  });
});

describe("guide message selection is deterministic by user + quest-day + slot", () => {
  const pool = ["a", "b", "c", "d", "e"];

  it("the same salt always resolves to the same message across repeated calls (cross-device agreement)", () => {
    const salt = "alice-2026-07-10-12";
    const first = pickGuideMessage(pool, salt);
    const second = pickGuideMessage(pool, salt);
    expect(first).toBe(second);
  });

  it("a different quest-day salt can resolve to different content", () => {
    const messages = new Set([
      pickGuideMessage(pool, "alice-2026-07-10-12"),
      pickGuideMessage(pool, "alice-2026-07-11-12"),
      pickGuideMessage(pool, "alice-2026-07-12-12"),
      pickGuideMessage(pool, "alice-2026-07-13-12"),
    ]);
    expect(messages.size).toBeGreaterThan(1);
  });
});

describe("mandatory quest title recognition", () => {
  it("recognizes the legacy combined title and both new split titles", () => {
    expect(isMandatoryQuestTitle(MANDATORY_QUEST_TITLE)).toBe(true);
    expect(isMandatoryQuestTitle(MANDATORY_FOOD_QUEST_TITLE)).toBe(true);
    expect(isMandatoryQuestTitle(MANDATORY_ENERGY_QUEST_TITLE)).toBe(true);
  });

  it("rejects ordinary quest titles", () => {
    expect(isMandatoryQuestTitle("Read for 30 minutes")).toBe(false);
    expect(isMandatoryQuestTitle(undefined)).toBe(false);
  });
});

describe("Afternoon Check-In unlock time (gate #1 persistence input)", () => {
  it("falls back to the safe default with no wake-time data", () => {
    expect(computeAfternoonUnlockLabel(undefined, undefined)).toBe(DEFAULT_AFTERNOON_UNLOCK_TIME);
  });

  it("computes 5 hours after the planned wake time", () => {
    expect(computeAfternoonUnlockLabel("8:00 AM", undefined)).toBe("1:00 PM");
  });

  it("prefers the planned wake time over the learned estimate", () => {
    expect(computeAfternoonUnlockLabel("7:00 AM", "9:00 AM")).toBe("12:00 PM");
  });
});

describe("completion feedback: reward idempotency + rapid-completion queueing", () => {
  beforeEach(() => {
    __resetCompletionFeedbackForTests();
  });

  function makeEvent(completionId: string): QuestCompletionFeedback {
    return { completionId, questId: completionId, stepsAwarded: 1, guide: "evie", energyEffect: "neutral" };
  }

  it("delivers exactly once per completionId even if emitted multiple times (hydration/rerender/replay-safe)", async () => {
    const received: QuestCompletionFeedback[] = [];
    subscribeToCompletionFeedback((event) => received.push(event));

    emitQuestCompletionFeedback(makeEvent("quest-1"));
    emitQuestCompletionFeedback(makeEvent("quest-1"));
    emitQuestCompletionFeedback(makeEvent("quest-1"));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toHaveLength(1);
  });

  it("queues rapid completions instead of dropping or overlapping them", async () => {
    const received: QuestCompletionFeedback[] = [];
    subscribeToCompletionFeedback((event) => received.push(event));

    emitQuestCompletionFeedback(makeEvent("a"));
    emitQuestCompletionFeedback(makeEvent("b"));
    emitQuestCompletionFeedback(makeEvent("c"));

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(received.map((e) => e.completionId)).toEqual(["a", "b", "c"]);
  }, 10000);

  it("an unsubscribed listener stops receiving events", async () => {
    const received: QuestCompletionFeedback[] = [];
    const unsubscribe = subscribeToCompletionFeedback((event) => received.push(event));
    unsubscribe();

    emitQuestCompletionFeedback(makeEvent("after-unsubscribe"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toHaveLength(0);
  });
});
