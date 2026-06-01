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
import { LLM_CONFIG, llmChatUrl } from "./llmConfig";

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
 * Synchronous, always-available generation from deterministic templates.
 *
 * This is the instant path: call sites render this immediately so the user
 * never stares at an empty form, then optionally upgrade to LLM output via
 * `generateGoalMilestonesAsync` once it arrives.
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

const SYSTEM_PROMPT =
  "You are Luna, a warm but concrete coach inside a sleep & productivity app. " +
  "Given a user's category, long-term dream, and a specific goal, produce exactly " +
  "three milestones: shortTerm (next 1-2 weeks), midTerm (next 1-3 months), and " +
  "longTerm (next 6-12 months). Each milestone must be ONE concrete, encouraging " +
  "sentence the user can act on, grounded in their specific goal. Avoid generic filler. " +
  "Respond strictly as JSON with keys shortTerm, midTerm, longTerm.";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    shortTerm: { type: "string" },
    midTerm: { type: "string" },
    longTerm: { type: "string" },
  },
  required: ["shortTerm", "midTerm", "longTerm"],
} as const;

function buildUserPrompt(input: GenerationInput): string {
  const parts = [`Category: ${input.category}.`];
  if (input.dream?.trim()) parts.push(`Long-term dream: ${input.dream.trim()}.`);
  if (input.specificGoal?.trim()) parts.push(`Specific goal: ${input.specificGoal.trim()}.`);
  if (input.mode && input.mode !== "Neutral") {
    parts.push(
      input.mode === "Recovery"
        ? "The user is in a low-energy recovery state; keep milestones gentle and low-pressure."
        : "The user is in an active progress state; milestones can be ambitious but realistic."
    );
  }
  return parts.join(" ");
}

function isMilestoneSet(value: unknown): value is GoalMilestoneSet {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.shortTerm === "string" &&
    typeof v.midTerm === "string" &&
    typeof v.longTerm === "string" &&
    v.shortTerm.trim().length > 0 &&
    v.midTerm.trim().length > 0 &&
    v.longTerm.trim().length > 0
  );
}

/**
 * Phase 2: attempt structured-output generation from the local Ollama model,
 * falling back to templates on any failure (disabled, off-network, timeout,
 * malformed output). This is safe to call from anywhere — it never throws.
 *
 * Callers that want instant feedback should render `generateGoalMilestones`
 * first, then await this and swap in the result if `source === "llm"`.
 */
export async function generateGoalMilestonesAsync(
  input: GenerationInput
): Promise<GenerationResult> {
  const fallback = generateGoalMilestones(input);

  if (!LLM_CONFIG.enabled) return fallback;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_CONFIG.timeoutMs);

  try {
    const response = await fetch(llmChatUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: LLM_CONFIG.model,
        stream: false,
        format: RESPONSE_SCHEMA,
        options: { temperature: 0.7 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
    });

    if (!response.ok) return fallback;

    const data = (await response.json()) as { message?: { content?: string } };
    const content = data?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content);
    if (!isMilestoneSet(parsed)) return fallback;

    return {
      shortTerm: parsed.shortTerm.trim(),
      midTerm: parsed.midTerm.trim(),
      longTerm: parsed.longTerm.trim(),
      source: "llm",
    };
  } catch {
    // Network error, abort/timeout, or JSON parse failure — use templates.
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
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
