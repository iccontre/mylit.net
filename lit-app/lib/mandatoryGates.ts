import { MANDATORY_ENERGY_QUEST_TITLE, MANDATORY_FOOD_QUEST_TITLE } from "./scheduling";
import { FOOD_GATE_FUEL_THRESHOLD } from "./fuel";

/**
 * Centralized Luna mandatory eat/rest gate state machine. Previously this logic was scattered
 * across two near-duplicate tap-handler conditions and a handful of ad-hoc booleans in
 * app/(tabs)/index.tsx (mandatoryFoodQuest, mandatoryEnergyQuest, mandatoryActive,
 * mandatoryLocksRecoveryToo — plus a comment referencing a "getMandatoryGateQuests" function
 * that never actually existed), making it easy for one call site to drift out of sync with
 * another. This module is now the single source of truth: given the same inputs, both the
 * quest board's tap handlers and its rendering must derive the identical gate list.
 */

export const MANDATORY_MILD_ENERGY_THRESHOLD = 60;
export const MANDATORY_MILD_DURATION_MINUTES = 15;
export const MANDATORY_SEVERE_ENERGY_THRESHOLD = 30;
export const MANDATORY_SEVERE_DURATION_MINUTES = 30;

export type MandatoryGateId = "afternoon_checkin" | "food" | "energy";

export type MandatoryGateInfo = {
  id: MandatoryGateId;
  title: string;
  durationMinutes: number;
  /** Whether this gate blocks starting/opening ordinary Progress-kind items. */
  locksProgress: boolean;
  /** Whether this gate blocks starting/opening ordinary Recovery-kind items too. */
  locksRecovery: boolean;
};

export type MandatoryGateState = {
  /** Every currently-active mandatory requirement, most-urgent first. Multiple gates can be
   *  active at once (e.g. both food and energy) — each is shown and must resolve independently. */
  gates: MandatoryGateInfo[];
  active: boolean;
  locksProgress: boolean;
  locksRecovery: boolean;
};

export type MandatoryGateInput = {
  /** True only once Morning Check-In exists AND today's Afternoon Check-In is unlocked
   *  (5h post-wake) AND not yet completed AND LDM is not active — see isAfternoonCheckInGateActive. */
  afternoonCheckInRequired: boolean;
  /** latestCheckIn?.eatenSinceMorning — undefined/true means "no explicit no", only an explicit
   *  false activates the check-in-driven trigger (fuel is the primary trigger otherwise). */
  eatenSinceMorning: boolean | undefined;
  fuel: number;
  hasEnergyData: boolean;
  energyYield: number;
  /** Titles of quests already completed TODAY (day-scoped — see loadTodayCompletions) — a gate
   *  resolved today must never re-lock from a stale prior-day record satisfying this same check. */
  completedTitlesToday: Set<string>;
};

/**
 * Priority order (matches the existing product spec): (1) missing Afternoon Check-In takes over
 * the whole board — no other gate is shown until it resolves; (2) food; (3) energy/rest. Food and
 * energy can be simultaneously active and both must be shown/resolved independently.
 */
export function computeMandatoryGateState(input: MandatoryGateInput): MandatoryGateState {
  if (input.afternoonCheckInRequired) {
    return {
      gates: [
        {
          id: "afternoon_checkin",
          title: "Complete Afternoon Check-In",
          durationMinutes: 0,
          locksProgress: true,
          locksRecovery: true,
        },
      ],
      active: true,
      locksProgress: true,
      locksRecovery: true,
    };
  }

  const gates: MandatoryGateInfo[] = [];

  const foodAlreadyDone = input.completedTitlesToday.has(MANDATORY_FOOD_QUEST_TITLE);
  const foodTriggered = input.fuel <= FOOD_GATE_FUEL_THRESHOLD || input.eatenSinceMorning === false;
  if (foodTriggered && !foodAlreadyDone) {
    gates.push({
      id: "food",
      title: MANDATORY_FOOD_QUEST_TITLE,
      durationMinutes: MANDATORY_MILD_DURATION_MINUTES,
      locksProgress: true,
      locksRecovery: true,
    });
  }

  if (input.hasEnergyData) {
    const energyAlreadyDone = input.completedTitlesToday.has(MANDATORY_ENERGY_QUEST_TITLE);
    if (!energyAlreadyDone && input.energyYield < MANDATORY_MILD_ENERGY_THRESHOLD) {
      const severe = input.energyYield < MANDATORY_SEVERE_ENERGY_THRESHOLD;
      gates.push({
        id: "energy",
        title: MANDATORY_ENERGY_QUEST_TITLE,
        durationMinutes: severe ? MANDATORY_SEVERE_DURATION_MINUTES : MANDATORY_MILD_DURATION_MINUTES,
        locksProgress: true,
        locksRecovery: severe,
      });
    }
  }

  return {
    gates,
    active: gates.length > 0,
    locksProgress: gates.some((g) => g.locksProgress),
    locksRecovery: gates.some((g) => g.locksRecovery),
  };
}
