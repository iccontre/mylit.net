import * as Haptics from "expo-haptics";

export type CompletionGuide = "evie" | "luna";
export type CompletionEnergyEffect = "restore" | "consume" | "neutral";

export type QuestCompletionFeedback = {
  completionId: string;
  questId: string;
  stepsAwarded: number;
  guide: CompletionGuide;
  energyEffect: CompletionEnergyEffect;
};

type Listener = (event: QuestCompletionFeedback) => void;

/**
 * Single shared coordinator for quest/checklist completion feedback (haptic + "+N STEPS" toast +
 * guide reaction + flame reaction) — every completion path (Home's timed quests, checklist
 * complete, Forced Recovery, mandatory Luna gates, Day Plan's checklist toggle) calls
 * emitQuestCompletionFeedback exactly once per genuinely NEW completion instead of each
 * duplicating its own haptic/visual logic.
 */
const listeners = new Set<Listener>();
const recentlyEmitted = new Set<string>();
const RECENT_ID_CAP = 50;

const queue: QuestCompletionFeedback[] = [];
let draining = false;
/** Keeps rapid completions from overlapping haptic/sound/visual — each event gets its own beat. */
const MIN_SPACING_MS = 700;

export function subscribeToCompletionFeedback(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function playCompletionHaptic(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics may be unavailable (web preview, permissions, platform) — must never block
    // completion or the rest of the feedback sequence.
  }
}

function rememberId(id: string): void {
  recentlyEmitted.add(id);
  if (recentlyEmitted.size > RECENT_ID_CAP) {
    const oldest = recentlyEmitted.values().next().value;
    if (oldest !== undefined) recentlyEmitted.delete(oldest);
  }
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const event = queue.shift();
      if (!event) continue;
      await playCompletionHaptic();
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.warn("completionFeedback listener error:", error);
        }
      }
      if (queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, MIN_SPACING_MS));
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Emits ONE piece of completion feedback for a genuinely new completion. Deduped by
 * completionId — hydration, cloud replay, rerenders, or an accidental duplicate completion call
 * can never fire feedback twice for the same event. Callers should pass a stable id (the
 * completion/reward-event id already used to persist the reward), not the quest id alone, so
 * two different completions of the same recurring item each still get their own feedback.
 */
export function emitQuestCompletionFeedback(event: QuestCompletionFeedback): void {
  if (!event.completionId || recentlyEmitted.has(event.completionId)) return;
  rememberId(event.completionId);
  queue.push(event);
  void drainQueue();
}

/** Test-only reset — clears dedup memory and any queued-but-undrained events. */
export function __resetCompletionFeedbackForTests(): void {
  listeners.clear();
  recentlyEmitted.clear();
  queue.length = 0;
  draining = false;
}
