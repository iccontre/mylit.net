/**
 * Goal milestone feedback log.
 *
 * Every time a user saves their PATH SETUP we record:
 *   - the (category, dream, specificGoal) that drove generation
 *   - the milestones we generated for them
 *   - the milestones they ultimately saved
 *   - per-horizon flags for whether they edited that milestone
 *
 * This log is the seed dataset for Phase 2 / 3 fine-tuning. User edits
 * are an explicit signal that the template (or eventual LLM output)
 * fell short — they should be weighted more heavily than accepted
 * milestones during training.
 *
 * Stored under AsyncStorage key `lit_goal_feedback_log` as a JSON array.
 * Bounded to MAX_ENTRIES to keep AsyncStorage healthy on long-lived
 * installs; Phase 2 will sync to a backend before trimming.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { diffMilestoneSets, type GenerationMode } from "./goalGeneration";
import type { GoalMilestoneSet } from "../constants/goalMilestoneTemplates";

export const FEEDBACK_LOG_KEY = "lit_goal_feedback_log";

const MAX_ENTRIES = 200;

export type GoalFeedbackEntry = {
  id: string;
  timestamp: string;
  category: string;
  dream: string;
  specificGoal: string;
  mode: GenerationMode | null;
  generated: GoalMilestoneSet;
  final: GoalMilestoneSet;
  edits: { shortTerm: boolean; midTerm: boolean; longTerm: boolean };
};

function makeId(): string {
  // Lightweight uuid-ish; collisions are not a concern at this scale.
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
}

export async function logGoalFeedback(input: {
  category: string;
  dream: string;
  specificGoal: string;
  mode: GenerationMode | null;
  generated: GoalMilestoneSet;
  final: GoalMilestoneSet;
}): Promise<GoalFeedbackEntry> {
  const entry: GoalFeedbackEntry = {
    id: makeId(),
    timestamp: new Date().toISOString(),
    category: input.category,
    dream: input.dream,
    specificGoal: input.specificGoal,
    mode: input.mode,
    generated: input.generated,
    final: input.final,
    edits: diffMilestoneSets(input.generated, input.final),
  };

  try {
    const existing = await AsyncStorage.getItem(FEEDBACK_LOG_KEY);
    const parsed: GoalFeedbackEntry[] = existing ? JSON.parse(existing) : [];
    const next = [...parsed, entry].slice(-MAX_ENTRIES);
    await AsyncStorage.setItem(FEEDBACK_LOG_KEY, JSON.stringify(next));
  } catch {
    // AsyncStorage failure is not user-facing. Drop silently.
  }

  return entry;
}

export async function readGoalFeedbackLog(): Promise<GoalFeedbackEntry[]> {
  try {
    const existing = await AsyncStorage.getItem(FEEDBACK_LOG_KEY);
    return existing ? (JSON.parse(existing) as GoalFeedbackEntry[]) : [];
  } catch {
    return [];
  }
}
