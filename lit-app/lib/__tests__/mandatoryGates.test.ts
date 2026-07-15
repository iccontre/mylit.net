import { computeMandatoryGateState } from "../mandatoryGates";
import { MANDATORY_ENERGY_QUEST_TITLE, MANDATORY_FOOD_QUEST_TITLE } from "../scheduling";

function baseInput(overrides: Partial<Parameters<typeof computeMandatoryGateState>[0]> = {}) {
  return {
    afternoonCheckInRequired: false,
    eatenSinceMorning: undefined as boolean | undefined,
    fuel: 80,
    hasEnergyData: true,
    energyYield: 80,
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
      baseInput({ afternoonCheckInRequired: true, fuel: 5, energyYield: 5 })
    );
    expect(state.gates).toHaveLength(1);
    expect(state.gates[0].id).toBe("afternoon_checkin");
    expect(state.locksProgress).toBe(true);
    expect(state.locksRecovery).toBe(true);
  });
});

describe("food gate", () => {
  it("triggers when fuel is at/below the threshold", () => {
    const state = computeMandatoryGateState(baseInput({ fuel: 29 }));
    expect(state.gates.map((g) => g.id)).toEqual(["food"]);
    expect(state.locksProgress).toBe(true);
    expect(state.locksRecovery).toBe(true);
  });

  it("triggers on an explicit 'didn't eat' answer even with healthy fuel", () => {
    const state = computeMandatoryGateState(baseInput({ fuel: 90, eatenSinceMorning: false }));
    expect(state.gates.map((g) => g.id)).toEqual(["food"]);
  });

  it("does not trigger when fuel is healthy and eatenSinceMorning is undefined/true", () => {
    expect(computeMandatoryGateState(baseInput({ fuel: 90 })).active).toBe(false);
    expect(computeMandatoryGateState(baseInput({ fuel: 90, eatenSinceMorning: true })).active).toBe(false);
  });

  it("clears once a completion for today exists — a stale gate never re-locks a newer completion", () => {
    const state = computeMandatoryGateState(
      baseInput({ fuel: 5, completedTitlesToday: new Set([MANDATORY_FOOD_QUEST_TITLE]) })
    );
    expect(state.gates.find((g) => g.id === "food")).toBeUndefined();
    expect(state.active).toBe(false);
  });
});

describe("energy/rest gate", () => {
  it("does not trigger above the mild threshold", () => {
    expect(computeMandatoryGateState(baseInput({ energyYield: 60 })).active).toBe(false);
  });

  it("mild tier (30-59) locks Progress only, not Recovery", () => {
    const state = computeMandatoryGateState(baseInput({ energyYield: 45 }));
    expect(state.gates).toHaveLength(1);
    expect(state.gates[0].durationMinutes).toBe(15);
    expect(state.locksProgress).toBe(true);
    expect(state.locksRecovery).toBe(false);
  });

  it("severe tier (<30) locks both Progress and Recovery", () => {
    const state = computeMandatoryGateState(baseInput({ energyYield: 10 }));
    expect(state.gates[0].durationMinutes).toBe(30);
    expect(state.locksProgress).toBe(true);
    expect(state.locksRecovery).toBe(true);
  });

  it("never triggers without energy data yet (Morning Check-In not done)", () => {
    expect(computeMandatoryGateState(baseInput({ hasEnergyData: false, energyYield: 5 })).active).toBe(false);
  });

  it("clears once a completion for today exists", () => {
    const state = computeMandatoryGateState(
      baseInput({ energyYield: 10, completedTitlesToday: new Set([MANDATORY_ENERGY_QUEST_TITLE]) })
    );
    expect(state.active).toBe(false);
  });
});

describe("multiple simultaneous gates resolve independently", () => {
  it("shows both food and energy gates at once when both are triggered", () => {
    const state = computeMandatoryGateState(baseInput({ fuel: 10, energyYield: 20 }));
    const ids = state.gates.map((g) => g.id).sort();
    expect(ids).toEqual(["energy", "food"]);
    expect(state.active).toBe(true);
  });

  it("resolving only ONE of the two gates leaves the other still active", () => {
    const state = computeMandatoryGateState(
      baseInput({ fuel: 10, energyYield: 20, completedTitlesToday: new Set([MANDATORY_FOOD_QUEST_TITLE]) })
    );
    expect(state.gates.map((g) => g.id)).toEqual(["energy"]);
    expect(state.active).toBe(true);
  });

  it("resolving BOTH gates fully unlocks (no blockers remain)", () => {
    const state = computeMandatoryGateState(
      baseInput({
        fuel: 10,
        energyYield: 20,
        completedTitlesToday: new Set([MANDATORY_FOOD_QUEST_TITLE, MANDATORY_ENERGY_QUEST_TITLE]),
      })
    );
    expect(state.active).toBe(false);
    expect(state.gates).toHaveLength(0);
  });
});
