/**
 * Goal milestone generation interface.
 *
 * This module is the single swap-in point for moving from Phase 1
 * (deterministic templates) to Phase 2 (open-source LLM call).
 *
 * All call sites use `generateGoalMilestones()` and never reach into
 * the template constants directly. That way, switching to an LLM
 * (or to a fine-tuned model in Phase 3) is a single-file change.
 *
 * See: Notion spec "Goal Setting & Quest Board Pipeline (5/27 follow-up)"
 */

import {
  FALLBACK_MILESTONE_SET,
  GOAL_MILESTONE_TEMPLATES,
  type GoalMilestoneSet,
} from "../constants/goalMilestoneTemplates";

export type GenerationMode = "Progress" | "Recovery" | "Neutral";

export type GenerationInput = {
  category: string;
  dream?: string;
  specificGoal?: string;
  mode?: GenerationMode;
};

export type GenerationResult = GoalMilestoneSet & {
  source: "template" | "llm";
};

function pickTemplate(category: string): GoalMilestoneSet {
  const exact = GOAL_MILESTONE_TEMPLATES[category];
  if (exact) return exact;

  const trimmed = category?.trim();
  if (trimmed && GOAL_MILESTONE_TEMPLATES[trimmed]) {
    return GOAL_MILESTONE_TEMPLATES[trimmed];
  }

  return FALLBACK_MILESTONE_SET;
}

/**
 * Phase 1 implementation: deterministic templates per (category).
 *
 * Phase 2 will replace this with a structured-output LLM call:
 *   const response = await callLLM({ system, user, jsonSchema });
 *   return { ...response, source: "llm" };
 *
 * The template path will remain as a fallback when the LLM is
 * unavailable (offline, rate-limited, etc.).
 */
export function generateGoalMilestones(input: GenerationInput): GenerationResult {
  const template = pickTemplate(input.category);

  return {
    shortTerm: template.shortTerm,
    midTerm: template.midTerm,
    longTerm: template.longTerm,
    source: "template",
  };
}

/**
 * Detect whether two milestone sets differ in each horizon.
 * Used by `feedbackLog` to record which milestones the user edited.
 */
export function diffMilestoneSets(
  generated: GoalMilestoneSet,
  final: GoalMilestoneSet
): { shortTerm: boolean; midTerm: boolean; longTerm: boolean } {
  const normalize = (value: string) => value.trim().toLowerCase();

  return {
    shortTerm: normalize(generated.shortTerm) !== normalize(final.shortTerm),
    midTerm: normalize(generated.midTerm) !== normalize(final.midTerm),
    longTerm: normalize(generated.longTerm) !== normalize(final.longTerm),
  };
}
