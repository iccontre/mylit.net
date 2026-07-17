import { MANDATORY_ENERGY_QUEST_TITLE, MANDATORY_FOOD_QUEST_TITLE } from "./scheduling";
import type { HomeQuestItem } from "./questProgress";

/**
 * Centralized Luna mandatory eat/rest gate state machine. Previously this logic was scattered
 * across two near-duplicate tap-handler conditions and a handful of ad-hoc booleans in
 * app/(tabs)/index.tsx (mandatoryFoodQuest, mandatoryEnergyQuest, mandatoryActive,
 * mandatoryLocksRecoveryToo — plus a comment referencing a "getMandatoryGateQuests" function
 * that never actually existed), making it easy for one call site to drift out of sync with
 * another. This module is now the single source of truth: given the same inputs, both the
 * quest board's tap handlers and its rendering must derive the identical gate list.
 *
 * Eat and Rest are both evidence-gated so that Morning Check-In alone can never create either:
 * - Eat requires an absolute wake+2h timestamp (see eatGateEligibleAt below) — waking into
 *   Recovery, or not having a recorded wake time at all, can never trigger it on its own.
 * - Rest requires proof the user was actually in Progress earlier the same quest-day
 *   (wasProgressToday) — waking directly into Recovery from Morning Check-In can never trigger
 *   it either, since that evidence is only recorded once currentMode has actually read Progress.
 */

export const MANDATORY_MILD_ENERGY_THRESHOLD = 60;
export const MANDATORY_MILD_DURATION_MINUTES = 15;
export const MANDATORY_SEVERE_ENERGY_THRESHOLD = 30;
export const MANDATORY_SEVERE_DURATION_MINUTES = 30;

/** Absolute delay after a reported wake time before the Eat gate becomes eligible. */
export const EAT_GATE_DELAY_MS = 2 * 60 * 60 * 1000;

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
  /** Epoch ms of today's reported wake time (see resolveWakeTimestamp), or null when no wake
   *  time has been recorded yet — the Eat gate can never trigger without this. */
  wakeTimestampMs: number | null;
  /** Epoch ms "now" — passed in (not read from Date.now()) so this stays pure/testable. */
  nowMs: number;
  /** True once a food event with eatenAt >= wakeTimestampMs exists — a real logged meal/snack
   *  at or after waking, not merely "fuel is high" (fuel decays over time independent of this). */
  hasFoodSinceWake: boolean;
  hasEnergyData: boolean;
  energyYield: number;
  /** True once currentMode has actually read "Progress" (energyYield >= 60) at some point during
   *  today's quest-day — see markProgressToday in app/(tabs)/index.tsx. Waking straight into
   *  Recovery, or the app starting in Recovery with no earlier same-day Progress evidence, both
   *  leave this false, so the Rest gate never fires from either case alone. */
  wasProgressToday: boolean;
  /** Titles of quests already completed TODAY (day-scoped — see loadTodayCompletions) — a gate
   *  resolved today must never re-lock from a stale prior-day record satisfying this same check. */
  completedTitlesToday: Set<string>;
};

/** Exposed for callers that need to display/derive the eligibility timestamp directly. */
export function computeEatGateEligibleAt(wakeTimestampMs: number | null): number | null {
  return wakeTimestampMs === null ? null : wakeTimestampMs + EAT_GATE_DELAY_MS;
}

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
  const eatGateEligibleAt = computeEatGateEligibleAt(input.wakeTimestampMs);
  const foodTriggered = eatGateEligibleAt !== null && input.nowMs >= eatGateEligibleAt && !input.hasFoodSinceWake;
  if (foodTriggered && !foodAlreadyDone) {
    gates.push({
      id: "food",
      title: MANDATORY_FOOD_QUEST_TITLE,
      durationMinutes: MANDATORY_MILD_DURATION_MINUTES,
      locksProgress: true,
      locksRecovery: true,
    });
  }

  if (input.hasEnergyData && input.wasProgressToday) {
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

/** "Path Quest" = quests the path/pipeline system itself surfaced (Evie's suggested quest, the
 *  post-progress recovery starter) — not a separately stored field, just what suggested/starter
 *  already mean. Mirrors app/(tabs)/index.tsx's own getQuestSourceType exactly; that screen now
 *  delegates to this copy so there's one definition, not two that can drift. */
export function getQuestSourceType(item: Pick<HomeQuestItem, "source" | "suggested" | "starter">): "regular" | "today" | "path" {
  if (item.source === "Today's Quest") return "today";
  if (item.suggested || item.starter) return "path";
  return "regular";
}

/**
 * Centralized mandatory-gate eligibility exception: an Evie Path/suggestion quest saved as
 * Recovery-kind stays startable while a mandatory Eat/Rest gate is active, even a severe gate
 * that otherwise locks Recovery-kind items too — resting is exactly what the gate itself is
 * trying to encourage, so blocking Evie's own Recovery suggestion behind it would be
 * self-defeating. Both quest-board tap handlers (openQuestItem, startTimedItem in
 * app/(tabs)/index.tsx) call this SAME function — never re-derive this condition inline in a
 * handler. Card color/visual state is never consulted here, only the item's own source/kind
 * metadata (already computed elsewhere, before the board ever renders) — items that reach this
 * point are already guaranteed not-deleted/not-expired/not-completed by normalizeQuestItems'
 * own filtering (completed/missed/expired items never make it into the board's item list).
 */
export function isEvieRecoveryExemptFromMandatoryGates(item: Pick<HomeQuestItem, "source" | "suggested" | "starter" | "kind" | "mandatory">): boolean {
  return !item.mandatory && item.kind === "recovery" && getQuestSourceType(item) === "path";
}
