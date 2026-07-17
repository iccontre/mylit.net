import { computeMandatoryGateState, EAT_GATE_DELAY_MS, isEvieRecoveryExemptFromMandatoryGates } from "../mandatoryGates";
import { MANDATORY_ENERGY_QUEST_TITLE, MANDATORY_FOOD_QUEST_TITLE } from "../scheduling";

const NOW = new Date("2026-07-15T12:00:00.000Z").getTime();
const WAKE = NOW - 3 * 60 * 60 * 1000; // woke 3h ago — past the 2h eat-gate delay

function baseInput(overrides: Partial<Parameters<typeof computeMandatoryGateState>[0]> = {}) {
  return {
    afternoonCheckInRequired: false,
    wakeTimestampMs: null as number | null,
    nowMs: NOW,
    hasFoodSinceWake: true,
    hasEnergyData: true,
    energyYield: 80,
    wasProgressToday: false,
    completedTitlesToday: new Set<string>(),
    ...overrides,
  };
}

describe("no gates active when nothing is triggered", () => {
  it("returns an empty, inactive state", () => {
    const state = computeMandatoryGateState(baseInput());
    expect(state.active).toBe(false);
    expect(state.gates).toHaveLength(0);
    expect(state.locksProgress).toBe(false);
    expect(state.locksRecovery).toBe(false);
  });
});

describe("Afternoon Check-In gate supersedes everything else", () => {
  it("shows only the check-in gate even when food/energy would also trigger", () => {
    const state = computeMandatoryGateState(
      baseInput({
        afternoonCheckInRequired: true,
        wakeTimestampMs: WAKE,
        hasFoodSinceWake: false,
        wasProgressToday: true,
        energyYield: 5,
      })
    );
    expect(state.gates).toHaveLength(1);
    expect(state.gates[0].id).toBe("afternoon_checkin");
    expect(state.locksProgress).toBe(true);
    expect(state.locksRecovery).toBe(true);
  });
});

describe("food gate — wake+2h eligibility", () => {
  it("does not trigger before wake+2h has elapsed", () => {
    const recentWake = NOW - 60 * 60 * 1000; // only 1h ago
    const state = computeMandatoryGateState(baseInput({ wakeTimestampMs: recentWake, hasFoodSinceWake: false }));
    expect(state.active).toBe(false);
  });

  it("triggers exactly at wake+2h when no food has been logged since waking", () => {
    const wake = NOW - EAT_GATE_DELAY_MS;
    const state = computeMandatoryGateState(baseInput({ wakeTimestampMs: wake, hasFoodSinceWake: false }));
    expect(state.gates.map((g) => g.id)).toEqual(["food"]);
    expect(state.locksProgress).toBe(true);
    expect(state.locksRecovery).toBe(true);
  });

  it("does not trigger when wake time is unknown", () => {
    const state = computeMandatoryGateState(baseInput({ wakeTimestampMs: null, hasFoodSinceWake: false }));
    expect(state.active).toBe(false);
  });

  it("does not trigger merely because Morning Check-In just happened (no gate immediately after wake)", () => {
    const state = computeMandatoryGateState(baseInput({ wakeTimestampMs: NOW, hasFoodSinceWake: false }));
    expect(state.active).toBe(false);
  });

  it("does not trigger when a food event has already been logged since waking", () => {
    const state = computeMandatoryGateState(baseInput({ wakeTimestampMs: WAKE, hasFoodSinceWake: true }));
    expect(state.active).toBe(false);
  });

  it("clears once a completion for today exists — a stale gate never re-locks a newer completion", () => {
    const state = computeMandatoryGateState(
      baseInput({
        wakeTimestampMs: WAKE,
        hasFoodSinceWake: false,
        completedTitlesToday: new Set([MANDATORY_FOOD_QUEST_TITLE]),
      })
    );
    expect(state.gates.find((g) => g.id === "food")).toBeUndefined();
    expect(state.active).toBe(false);
  });
});

describe("energy/rest gate — requires an actual Progress→Recovery transition", () => {
  it("does not trigger merely because Morning Check-In assigned Recovery (no prior Progress evidence)", () => {
    const state = computeMandatoryGateState(baseInput({ energyYield: 10, wasProgressToday: false }));
    expect(state.active).toBe(false);
  });

  it("does not trigger above the mild threshold even with Progress evidence", () => {
    expect(
      computeMandatoryGateState(baseInput({ energyYield: 60, wasProgressToday: true })).active
    ).toBe(false);
  });

  it("mild tier (30-59) locks Progress only, not Recovery, once Progress evidence exists", () => {
    const state = computeMandatoryGateState(baseInput({ energyYield: 45, wasProgressToday: true }));
    expect(state.gates).toHaveLength(1);
    expect(state.gates[0].durationMinutes).toBe(15);
    expect(state.locksProgress).toBe(true);
    expect(state.locksRecovery).toBe(false);
  });

  it("severe tier (<30) locks both Progress and Recovery once Progress evidence exists", () => {
    const state = computeMandatoryGateState(baseInput({ energyYield: 10, wasProgressToday: true }));
    expect(state.gates[0].durationMinutes).toBe(30);
    expect(state.locksProgress).toBe(true);
    expect(state.locksRecovery).toBe(true);
  });

  it("a direct drop from Progress straight below 30 creates only the 30-minute gate", () => {
    const state = computeMandatoryGateState(baseInput({ energyYield: 5, wasProgressToday: true }));
    expect(state.gates).toHaveLength(1);
    expect(state.gates[0].durationMinutes).toBe(30);
  });

  it("never triggers without energy data yet (Morning Check-In not done)", () => {
    expect(
      computeMandatoryGateState(baseInput({ hasEnergyData: false, energyYield: 5, wasProgressToday: true })).active
    ).toBe(false);
  });

  it("clears once a completion for today exists", () => {
    const state = computeMandatoryGateState(
      baseInput({
        energyYield: 10,
        wasProgressToday: true,
        completedTitlesToday: new Set([MANDATORY_ENERGY_QUEST_TITLE]),
      })
    );
    expect(state.active).toBe(false);
  });
});

describe("multiple simultaneous gates resolve independently", () => {
  it("shows both food and energy gates at once when both are triggered", () => {
    const state = computeMandatoryGateState(
      baseInput({ wakeTimestampMs: WAKE, hasFoodSinceWake: false, energyYield: 20, wasProgressToday: true })
    );
    const ids = state.gates.map((g) => g.id).sort();
    expect(ids).toEqual(["energy", "food"]);
    expect(state.active).toBe(true);
  });

  it("resolving only ONE of the two gates leaves the other still active", () => {
    const state = computeMandatoryGateState(
      baseInput({
        wakeTimestampMs: WAKE,
        hasFoodSinceWake: false,
        energyYield: 20,
        wasProgressToday: true,
        completedTitlesToday: new Set([MANDATORY_FOOD_QUEST_TITLE]),
      })
    );
    expect(state.gates.map((g) => g.id)).toEqual(["energy"]);
    expect(state.active).toBe(true);
  });

  it("resolving BOTH gates fully unlocks (no blockers remain)", () => {
    const state = computeMandatoryGateState(
      baseInput({
        wakeTimestampMs: WAKE,
        hasFoodSinceWake: false,
        energyYield: 20,
        wasProgressToday: true,
        completedTitlesToday: new Set([MANDATORY_FOOD_QUEST_TITLE, MANDATORY_ENERGY_QUEST_TITLE]),
      })
    );
    expect(state.active).toBe(false);
    expect(state.gates).toHaveLength(0);
  });
});

describe("isEvieRecoveryExemptFromMandatoryGates", () => {
  it("exempts a suggested Recovery-kind quest", () => {
    expect(isEvieRecoveryExemptFromMandatoryGates({ source: "Quest", suggested: true, kind: "recovery" })).toBe(true);
  });

  it("exempts a starter Recovery-kind quest", () => {
    expect(isEvieRecoveryExemptFromMandatoryGates({ source: "Quest", starter: true, kind: "recovery" })).toBe(true);
  });

  it("does not exempt a Progress-kind Evie suggestion — only Recovery-kind is exempt", () => {
    expect(isEvieRecoveryExemptFromMandatoryGates({ source: "Quest", suggested: true, kind: "progress" })).toBe(false);
  });

  it("does not exempt an ordinary Recovery-kind item that isn't an Evie suggestion", () => {
    expect(isEvieRecoveryExemptFromMandatoryGates({ source: "Checklist", kind: "recovery" })).toBe(false);
  });

  it("does not exempt a Today's Quest even if Recovery-kind", () => {
    expect(isEvieRecoveryExemptFromMandatoryGates({ source: "Today's Quest", kind: "recovery" })).toBe(false);
  });

  it("never exempts an item already flagged mandatory (the gate quest itself)", () => {
    expect(isEvieRecoveryExemptFromMandatoryGates({ source: "Quest", suggested: true, kind: "recovery", mandatory: true })).toBe(false);
  });
});
