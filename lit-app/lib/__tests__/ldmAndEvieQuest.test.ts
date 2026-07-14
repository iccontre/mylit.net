import { isLdmActive } from "../scheduling";
import { applyQuestBoardCapacity, type HomeQuestItem } from "../questProgress";
import { generateQuestFromMorningIntent } from "../questGeneration";
import { mergeEvieMorningQuest } from "../progressStore";

function at(hours: number, minutes: number): Date {
  const d = new Date("2026-07-10T00:00:00");
  d.setHours(hours, minutes, 0, 0);
  return d;
}

describe("LDM 9:00 PM / 6:00 AM boundaries", () => {
  it("is inactive right before 9:00 PM", () => {
    expect(isLdmActive(at(20, 59))).toBe(false);
  });

  it("is active at exactly 9:00 PM", () => {
    expect(isLdmActive(at(21, 0))).toBe(true);
  });

  it("stays active through the night", () => {
    expect(isLdmActive(at(23, 30))).toBe(true);
    expect(isLdmActive(at(0, 0))).toBe(true);
    expect(isLdmActive(at(3, 0))).toBe(true);
  });

  it("is active up to 5:59 AM and ends at 6:00 AM", () => {
    expect(isLdmActive(at(5, 59))).toBe(true);
    expect(isLdmActive(at(6, 0))).toBe(false);
  });

  it("is inactive during normal daytime hours", () => {
    expect(isLdmActive(at(12, 0))).toBe(false);
    expect(isLdmActive(at(18, 0))).toBe(false);
  });
});

describe("LDM 120-minute board capacity", () => {
  function item(id: string, minutes: number, overrides: Partial<HomeQuestItem> = {}): HomeQuestItem {
    return { id, title: id, source: "Checklist", kind: "recovery", steps: 1, durationMinutes: minutes, ...overrides };
  }
  // The real pre-sleep routine quest is `mandatory: true` (see index.tsx), which sorts into
  // the highest priority tier — matched here so the test reflects real usage.
  function routineItem(minutes: number): HomeQuestItem {
    return { id: "routine", title: "Start pre-sleep routine", source: "Quest", kind: "recovery", steps: 1, durationMinutes: minutes, mandatory: true };
  }

  it("caps total planned duration at 120 minutes when the override is passed", () => {
    const items = [routineItem(60), item("a", 30), item("b", 30), item("c", 30)];
    const { visibleItems, plannedMinutes, capacityMinutes } = applyQuestBoardCapacity(items, "Recovery", 120);
    expect(capacityMinutes).toBe(120);
    expect(plannedMinutes).toBeLessThanOrEqual(120);
    // The 60-min routine (mandatory, highest priority) plus at most 60 more minutes of others.
    expect(visibleItems.some((i) => i.id === "routine")).toBe(true);
  });

  it("never deletes overflow items — they're just not in visibleItems (deferred)", () => {
    const items = [routineItem(60), item("a", 30), item("b", 30), item("c", 30)];
    const { hiddenCount } = applyQuestBoardCapacity(items, "Recovery", 120);
    expect(hiddenCount).toBeGreaterThan(0);
  });

  it("without an override, falls back to the normal mode-derived capacity", () => {
    const items = [item("a", 30)];
    const withOverride = applyQuestBoardCapacity(items, "Recovery", 120);
    const withoutOverride = applyQuestBoardCapacity(items, "Recovery");
    expect(withOverride.capacityMinutes).toBe(120);
    expect(withoutOverride.capacityMinutes).not.toBe(120);
  });
});

describe("Evie Morning Check-In quest — deterministic generation", () => {
  it("preserves the user's own words as the title", () => {
    const quest = generateQuestFromMorningIntent("finish my history essay");
    expect(quest.title).toBe("finish my history essay");
  });

  it("estimates duration from an explicit time mention", () => {
    const quest = generateQuestFromMorningIntent("study for 45 minutes");
    expect(quest.durationMinutes).toBe(45);
  });

  it("defaults to 30 minutes with no explicit duration", () => {
    const quest = generateQuestFromMorningIntent("clean my room");
    expect(quest.durationMinutes).toBe(30);
  });

  it("classifies recovery-flavored text as recovery, independent of anything else", () => {
    const quest = generateQuestFromMorningIntent("rest and recover today");
    expect(quest.kind).toBe("recovery");
  });

  it("classifies plain task text as progress by default", () => {
    const quest = generateQuestFromMorningIntent("finish my history essay");
    expect(quest.kind).toBe("progress");
  });

  it("is marked suggested (renders as an Evie Path quest, not a generic one)", () => {
    const quest = generateQuestFromMorningIntent("finish my history essay");
    expect(quest.suggested).toBe(true);
  });
});

describe("Evie Morning Check-In quest — cross-device idempotency", () => {
  function quest(questDayKey: string, createdAt: string, title: string) {
    return JSON.stringify({ questDayKey, createdAt, title, id: `evie-morning-quest-${questDayKey}` });
  }

  it("the earliest-created quest for the same day wins on either side of the merge", () => {
    const first = quest("2026-07-10", "2026-07-10T07:00:00.000Z", "Quest A");
    const second = quest("2026-07-10", "2026-07-10T07:05:00.000Z", "Quest B");

    const mergedLocalFirst = JSON.parse(mergeEvieMorningQuest(first, second));
    const mergedCloudFirst = JSON.parse(mergeEvieMorningQuest(second, first));

    expect(mergedLocalFirst.title).toBe("Quest A");
    expect(mergedCloudFirst.title).toBe("Quest A");
  });

  it("a newer quest-day's quest wins over a stale earlier day's leftover quest", () => {
    const stale = quest("2026-07-09", "2026-07-09T07:00:00.000Z", "Yesterday's Quest");
    const fresh = quest("2026-07-10", "2026-07-10T07:00:00.000Z", "Today's Quest");

    expect(JSON.parse(mergeEvieMorningQuest(stale, fresh)).title).toBe("Today's Quest");
    expect(JSON.parse(mergeEvieMorningQuest(fresh, stale)).title).toBe("Today's Quest");
  });
});
