/**
 * Offline goal database.
 *
 * This is the "trained database" the app ships with so milestone generation
 * works fully offline. Each category holds one or more milestone *variants*.
 * Every variant uses the `{goal}` slot, which is replaced at runtime with the
 * user's typed specific goal (wrapped in quotes so any phrasing slots in
 * grammatically).
 *
 * How this file is produced / maintained:
 *   - Seeded by hand from the Phase 1 category templates.
 *   - Regenerated / expanded by the ROG machine via
 *     `scripts/generateGoalDatabase.mjs` (run while on the ROG's network).
 *     That script calls the local Ollama model and overwrites GOAL_DATABASE.
 *
 * The app never calls the LLM at runtime — the ROG is a build-time data
 * factory, and users run entirely offline against this file.
 */

import type { GoalMilestoneSet } from "./goalMilestoneTemplates";

/** Placeholder substituted with the user's specific goal at runtime. */
export const GOAL_SLOT = "{goal}";

/** Used when the user has not typed a specific goal yet. */
export const DEFAULT_GOAL_PHRASE = "your goal";

export const GOAL_DATABASE: Record<string, GoalMilestoneSet[]> = {
  Health: [
    {
      shortTerm: "This week, move your body 20 minutes a day, 4 days — your first visible step toward “{goal}.”",
      midTerm: "Hold a steady weekly movement rhythm for 8 weeks so “{goal}” stops feeling fragile.",
      longTerm: "Make “{goal}” part of an everyday body you trust — movement, sleep, and meals on autopilot.",
    },
    {
      shortTerm: "Pick one daily habit that points at “{goal}” and keep it for the next two weeks.",
      midTerm: "Stack two supporting habits over the next 1–3 months until “{goal}” feels routine.",
      longTerm: "Live as someone for whom “{goal}” is just normal life, not a constant effort.",
    },
  ],
  Money: [
    {
      shortTerm: "Track every dollar honestly for two weeks to see exactly where “{goal}” stands today.",
      midTerm: "Build one real cushion over 1–3 months that moves you toward “{goal}.”",
      longTerm: "Reach “{goal}” and a stable floor beneath it — savings, one income skill, no avoidance.",
    },
    {
      shortTerm: "Automate one transfer or cut one recurring cost this week in service of “{goal}.”",
      midTerm: "Hit a clear mid-point checkpoint for “{goal}” within the next three months.",
      longTerm: "Make “{goal}” the baseline of a calm, boring, dependable money life.",
    },
  ],
  Mind: [
    {
      shortTerm: "Journal one honest sentence a day for two weeks about “{goal}.”",
      midTerm: "Name three recurring patterns over the next quarter that pull you away from “{goal}.”",
      longTerm: "Build a steady inner voice that keeps “{goal}” in view — daily reflection, weekly review.",
    },
    {
      shortTerm: "Spend 10 quiet minutes a day this week getting clear on why “{goal}” matters.",
      midTerm: "Turn one insight about “{goal}” into a repeatable practice over 1–3 months.",
      longTerm: "Become someone grounded enough that “{goal}” feels steady, not reactive.",
    },
  ],
  "Friends / Connection": [
    {
      shortTerm: "Reach out to one person this week as a first move toward “{goal}.”",
      midTerm: "Have three real conversations over the next two months that build “{goal}.”",
      longTerm: "Grow relationships you can show up honestly in — “{goal}” as a lasting part of life.",
    },
    {
      shortTerm: "Schedule one real hangout or call this week in service of “{goal}.”",
      midTerm: "Deepen two relationships over 1–3 months that matter for “{goal}.”",
      longTerm: "Build a circle where “{goal}” is simply how you live with the people you love.",
    },
  ],
  "School / Work": [
    {
      shortTerm: "Complete one focused work block every weekday for two weeks toward “{goal}.”",
      midTerm: "Ship one meaningful milestone for “{goal}” within the next eight weeks.",
      longTerm: "Become someone who reliably finishes — “{goal}” delivered, with steady output.",
    },
    {
      shortTerm: "Define the single next action for “{goal}” and do it before anything else this week.",
      midTerm: "Build a weekly planning rhythm over 1–3 months that keeps “{goal}” on track.",
      longTerm: "Make consistent progress on “{goal}” the default, not the exception.",
    },
  ],
  Confidence: [
    {
      shortTerm: "Keep one small daily promise to yourself for two weeks that points at “{goal}.”",
      midTerm: "Step into three uncomfortable moments over two months in service of “{goal}.”",
      longTerm: "Trust yourself by default on “{goal}” — built on evidence, not affirmation.",
    },
    {
      shortTerm: "Do one slightly scary thing this week that moves “{goal}” forward.",
      midTerm: "Collect a track record of small wins for “{goal}” over the next 1–3 months.",
      longTerm: "Become someone who backs themselves on “{goal}” without needing permission.",
    },
  ],
  Creativity: [
    {
      shortTerm: "Create something small for 20 minutes a day for two weeks toward “{goal}.”",
      midTerm: "Finish and share one piece tied to “{goal}” within two months.",
      longTerm: "Make “{goal}” part of who you are — a creative practice you don't wait for.",
    },
    {
      shortTerm: "Start a tiny daily creative rep this week in service of “{goal}.”",
      midTerm: "Complete one real project for “{goal}” over the next 1–3 months.",
      longTerm: "Live as a maker for whom “{goal}” is an ongoing practice, not a someday.",
    },
  ],
  Sleep: [
    {
      shortTerm: "Set and protect a realistic bedtime for two weeks as your base for “{goal}.”",
      midTerm: "Stabilize a sleep rhythm over 1–3 months that supports “{goal}.”",
      longTerm: "Treat sleep as the foundation of “{goal}” — consistent, intentional, undefended.",
    },
    {
      shortTerm: "Build a 30-minute wind-down this week that serves “{goal}.”",
      midTerm: "Hold the same wake time for 1–3 months to lock in “{goal}.”",
      longTerm: "Make rested-by-default the platform everything in “{goal}” stands on.",
    },
  ],
  "Phone Use": [
    {
      shortTerm: "Hold one phone-free hour daily for two weeks to create room for “{goal}.”",
      midTerm: "Cut daily screen time by a real margin over 1–3 months toward “{goal}.”",
      longTerm: "Use your phone on purpose so it serves “{goal}” instead of stealing from it.",
    },
    {
      shortTerm: "Remove one trigger app from your home screen this week in service of “{goal}.”",
      midTerm: "Replace one scrolling habit with a “{goal}” habit over the next 1–3 months.",
      longTerm: "Live with intentional, low-friction defaults so “{goal}” always wins the moment.",
    },
  ],
  Purpose: [
    {
      shortTerm: "Take one honest step this week toward “{goal}.”",
      midTerm: "Build a weekly review habit over 1–3 months that keeps “{goal}” in sight.",
      longTerm: "Live a life you'd be proud to describe, with “{goal}” at its center.",
    },
    {
      shortTerm: "Write down what “{goal}” really means to you and act on it once this week.",
      midTerm: "Align your weekly time with “{goal}” over the next 1–3 months.",
      longTerm: "Make “{goal}” the throughline of how you spend your days.",
    },
  ],
};

export const GOAL_DATABASE_FALLBACK: GoalMilestoneSet[] = [
  {
    shortTerm: "Take one concrete step this week toward “{goal}.”",
    midTerm: "Build one supporting habit over the next 1–3 months for “{goal}.”",
    longTerm: "Live in alignment with “{goal}” — steady action and honest reflection.",
  },
];
