/**
 * Time-horizoned goal templates per dream category.
 *
 * These are the Phase 1 fallback values returned by `lib/goalGeneration.ts`
 * when no LLM is available. They are intentionally generic enough to feel
 * sensible across most users while still being concrete enough to act on.
 *
 * Phase 2 will replace the lookup with an open-source LLM call conditioned
 * on the user's specific dream + goal text. The shape returned by both
 * implementations is identical, so the call sites do not need to change.
 */

export type GoalHorizon = "shortTerm" | "midTerm" | "longTerm";

export type GoalMilestoneSet = {
  shortTerm: string;
  midTerm: string;
  longTerm: string;
};

export const GOAL_HORIZON_LABELS: Record<GoalHorizon, { label: string; caption: string }> = {
  shortTerm: { label: "Short-Term Goal", caption: "Next 1–2 weeks" },
  midTerm: { label: "Mid-Term Goal", caption: "Next 1–3 months" },
  longTerm: { label: "Long-Term Goal", caption: "Next 6–12 months" },
};

export const GOAL_MILESTONE_TEMPLATES: Record<string, GoalMilestoneSet> = {
  Health: {
    shortTerm: "Move your body for 20 minutes a day, four days this week.",
    midTerm: "Hold a consistent weekly movement rhythm for eight weeks.",
    longTerm: "Build a body you trust — daily movement, stable sleep, regular meals.",
  },
  Money: {
    shortTerm: "Track every dollar honestly for the next two weeks.",
    midTerm: "Save one meaningful cushion (one month of expenses) over three months.",
    longTerm: "Build a stable financial floor — emergency fund, one income skill, no avoidance.",
  },
  Mind: {
    shortTerm: "Journal once a day for two weeks, even just one sentence.",
    midTerm: "Notice and name three recurring thought patterns over the next quarter.",
    longTerm: "Develop a steady inner voice — daily reflection, weekly review, less reactivity.",
  },
  "Friends / Connection": {
    shortTerm: "Reach out to one person you've been missing this week.",
    midTerm: "Have three real conversations with people who matter over the next two months.",
    longTerm: "Build relationships you can show up honestly in.",
  },
  "School / Work": {
    shortTerm: "Complete one focus block every weekday for two weeks.",
    midTerm: "Ship one meaningful project or milestone in the next eight weeks.",
    longTerm: "Become someone who reliably finishes — clear priorities, steady output, weekly review.",
  },
  Confidence: {
    shortTerm: "Keep one small daily promise to yourself for two weeks.",
    midTerm: "Speak up in three uncomfortable moments over the next two months.",
    longTerm: "Trust yourself by default — built on evidence, not affirmation.",
  },
  Creativity: {
    shortTerm: "Create something small, 20 minutes a day, for the next two weeks.",
    midTerm: "Finish one creative piece you actually share with someone in two months.",
    longTerm: "Make creative practice part of who you are, not what you wait for.",
  },
  Sleep: {
    shortTerm: "Set and protect a realistic bedtime for the next two weeks.",
    midTerm: "Stabilize a sleep rhythm: same wake time, gentle wind-down, less late stimulation.",
    longTerm: "Treat sleep as the foundation — consistent, intentional, undefended.",
  },
  "Phone Use": {
    shortTerm: "Hold one phone-free hour daily for two weeks.",
    midTerm: "Cut your daily screen time by a meaningful margin over the next two months.",
    longTerm: "Use your phone instead of being used by it — intentional, low-friction defaults.",
  },
  Purpose: {
    shortTerm: "Take one honest step toward what matters this week.",
    midTerm: "Build a weekly review habit that keeps your path in sight.",
    longTerm: "Live in a way you'd be proud to describe — direction, daily action, honest reflection.",
  },
};

export const FALLBACK_MILESTONE_SET: GoalMilestoneSet = {
  shortTerm: "Take one honest step toward your goal this week.",
  midTerm: "Build one supporting habit over the next two months.",
  longTerm: "Live in alignment with what this goal really means to you.",
};
