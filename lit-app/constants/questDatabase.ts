/**
 * Offline quest database — tiered for a sustainable, escalating journey.
 *
 * Each category holds four Progress-mode tiers that change the *action*, not
 * just the number:
 *
 *   foundation → build → push → peak
 *
 * `lib/questProgression.ts` maps the day-level to a tier, so as the user's
 * streak grows the quests genuinely level up (show-up habits → consistent work
 * → harder reps → sustained mastery) instead of only scaling minutes. This is
 * what lets the board stay fresh well past two weeks.
 *
 * Every quest uses the `{goal}` slot, replaced at runtime with the user's
 * specific goal. The app never calls the LLM at runtime.
 *
 * `QUEST_DATABASE` keeps a flat `progress` view (all tiers concatenated) so the
 * legacy `generateProgressQuests` helper keeps working unchanged.
 */

export type QuestMode = "progress" | "recovery";

export type QuestTier = "foundation" | "build" | "push" | "peak";

export const QUEST_TIER_ORDER: QuestTier[] = [
  "foundation",
  "build",
  "push",
  "peak",
];

export type TieredQuests = Record<QuestTier, string[]>;

export type CategoryQuests = {
  progress: string[];
  tiers: TieredQuests;
  recovery?: string[];
};

const TIERED_QUESTS: Record<string, TieredQuests> = {
  Health: {
    foundation: [
      "Do 10 minutes of easy movement toward “{goal}.”",
      "Drink water before each meal for “{goal}.”",
      "Add one vegetable to a meal for “{goal}.”",
      "Take a short walk after one meal for “{goal}.”",
    ],
    build: [
      "Do 25 minutes of intentional movement toward “{goal}.”",
      "Hit your protein target for “{goal}” today.",
      "Log everything you eat to support “{goal}.”",
      "Prep one healthy meal in advance for “{goal}.”",
    ],
    push: [
      "Do 40 minutes of focused training for “{goal}.”",
      "Push one workout harder than last session for “{goal}.”",
      "Hit protein and water targets together for “{goal}.”",
      "Add a second movement session today for “{goal}.”",
    ],
    peak: [
      "Train 50 minutes with progressive overload for “{goal}.”",
      "Hold a full clean-eating day for “{goal}.”",
      "Beat one personal record toward “{goal}.”",
      "Plan next week's training around “{goal}.”",
      "Coach someone else one health habit for “{goal}.”",
    ],
  },
  Money: {
    foundation: [
      "Check your balance once for “{goal}.”",
      "Save one small amount toward “{goal}.”",
      "Write one income idea for “{goal}.”",
      "Cancel one tiny unused cost for “{goal}.”",
    ],
    build: [
      "Move a set amount into savings for “{goal}.”",
      "Spend 20 minutes building an income skill for “{goal}.”",
      "Track today's spending against “{goal}.”",
      "Cut one non-essential expense for “{goal}.”",
    ],
    push: [
      "Take one concrete action on an income lead for “{goal}.”",
      "Spend 40 minutes growing a money skill for “{goal}.”",
      "Raise or negotiate one rate or price for “{goal}.”",
      "Automate one saving or payment for “{goal}.”",
    ],
    peak: [
      "Pitch or apply to one real opportunity for “{goal}.”",
      "Build one step of a second income stream for “{goal}.”",
      "Review and rebalance your money plan for “{goal}.”",
      "Reinvest one gain back into “{goal}.”",
      "Teach one money habit you've learned for “{goal}.”",
    ],
  },
  Mind: {
    foundation: [
      "Write one honest sentence about “{goal}.”",
      "Take one quiet minute for “{goal}.”",
      "Name one feeling around “{goal}.”",
      "Do one 5-minute focus block on “{goal}.”",
    ],
    build: [
      "Journal one focused page about “{goal}.”",
      "Do one 15-minute deep-work block on “{goal}.”",
      "Reframe one limiting thought about “{goal}.”",
      "Read or learn something that advances “{goal}.”",
    ],
    push: [
      "Do two 25-minute deep-work blocks on “{goal}.”",
      "Sit one 10-minute meditation for “{goal}.”",
      "Confront one avoided thought about “{goal}.”",
      "Teach back one thing you learned for “{goal}.”",
    ],
    peak: [
      "Hold a 45-minute deep-work session for “{goal}.”",
      "Run your full focus routine for “{goal}.”",
      "Design a system to protect attention for “{goal}.”",
      "Review the week's thinking on “{goal}.”",
      "Mentor yourself through one block on “{goal}.”",
    ],
  },
  "Friends / Connection": {
    foundation: [
      "Think of one person tied to “{goal}.”",
      "Send one low-pressure text for “{goal}.”",
      "React to one friend's post for “{goal}.”",
      "Write one connection barrier around “{goal}.”",
    ],
    build: [
      "Reach out first to one person for “{goal}.”",
      "Start one real conversation for “{goal}.”",
      "Follow up with someone you owe for “{goal}.”",
      "Make a small plan to meet for “{goal}.”",
    ],
    push: [
      "Invite someone to do something for “{goal}.”",
      "Have one honest, deeper talk for “{goal}.”",
      "Reconnect with one drifted friend for “{goal}.”",
      "Join one group space for “{goal}.”",
    ],
    peak: [
      "Host or organize one gathering for “{goal}.”",
      "Introduce two people who help “{goal}.”",
      "Deepen one key relationship for “{goal}.”",
      "Ask for or offer real support for “{goal}.”",
      "Strengthen your circle around “{goal}.”",
    ],
  },
  "School / Work": {
    foundation: [
      "Open your top task for “{goal}.”",
      "List three priorities for “{goal}.”",
      "Do 10 minutes on “{goal}.”",
      "Set up your workspace for “{goal}.”",
    ],
    build: [
      "Finish one focus block on “{goal}.”",
      "Do the most important task for “{goal}” first.",
      "Finish one section of your “{goal}” project.",
      "Clear one small blocker on “{goal}.”",
    ],
    push: [
      "Complete two focus blocks on “{goal}.”",
      "Ship one visible piece of “{goal}.”",
      "Start the next deadline early for “{goal}.”",
      "Remove one big blocker on “{goal}.”",
    ],
    peak: [
      "Run a deep-work morning on “{goal}.”",
      "Deliver one high-quality result for “{goal}.”",
      "Get a full day ahead on “{goal}.”",
      "Improve a process that speeds “{goal}.”",
      "Help a teammate move “{goal}” forward.",
    ],
  },
  Confidence: {
    foundation: [
      "Keep one small promise for “{goal}.”",
      "Write one thing you handled for “{goal}.”",
      "Reset your posture for “{goal}.”",
      "Say one kind, true thing for “{goal}.”",
    ],
    build: [
      "Do one slightly uncomfortable action for “{goal}.”",
      "Speak up once for “{goal}.”",
      "Ask one question for “{goal}.”",
      "Finish one visible task for “{goal}.”",
    ],
    push: [
      "Do one clearly uncomfortable action for “{goal}.”",
      "Share one idea openly for “{goal}.”",
      "Take the lead on one thing for “{goal}.”",
      "Handle one thing you'd usually avoid for “{goal}.”",
    ],
    peak: [
      "Put yourself fully forward for “{goal}.”",
      "Own one big ask for “{goal}.”",
      "Present or perform for “{goal}.”",
      "Stand by one hard decision for “{goal}.”",
      "Help someone else feel braver for “{goal}.”",
    ],
  },
  Creativity: {
    foundation: [
      "Save one idea for “{goal}.”",
      "Collect one reference for “{goal}.”",
      "Work 5 minutes on “{goal}.”",
      "Name the project for “{goal}.”",
    ],
    build: [
      "Create 25 focused minutes toward “{goal}.”",
      "Turn one idea into a draft for “{goal}.”",
      "Finish one rough section of “{goal}.”",
      "Study one technique for “{goal}.”",
    ],
    push: [
      "Create 45 focused minutes toward “{goal}.”",
      "Ship one small piece of “{goal}.”",
      "Revise one piece toward “{goal}.”",
      "Share a draft for feedback on “{goal}.”",
    ],
    peak: [
      "Complete one finished work for “{goal}.”",
      "Publish or submit one piece for “{goal}.”",
      "Push your craft past comfort for “{goal}.”",
      "Build a body of work for “{goal}.”",
      "Teach one technique you've mastered for “{goal}.”",
    ],
  },
  Sleep: {
    foundation: [
      "Pick a realistic bedtime for “{goal}.”",
      "Set one pre-sleep intention for “{goal}.”",
      "Dim your room early for “{goal}.”",
      "Put your phone away 10 minutes for “{goal}.”",
    ],
    build: [
      "Start wind-down 30 minutes early for “{goal}.”",
      "Cut screens before bed for “{goal}.”",
      "Keep the same wake time for “{goal}.”",
      "Avoid late caffeine for “{goal}.”",
    ],
    push: [
      "Hold a full no-screen wind-down for “{goal}.”",
      "Hit a consistent bedtime tonight for “{goal}.”",
      "Prep tomorrow before bed for “{goal}.”",
      "Protect a full sleep window for “{goal}.”",
    ],
    peak: [
      "Run your full sleep routine for “{goal}.”",
      "Keep a steady sleep-wake rhythm for “{goal}.”",
      "Optimize your room for deep sleep for “{goal}.”",
      "Review your sleep data and adjust for “{goal}.”",
      "Hold the rhythm even on a hard day for “{goal}.”",
    ],
  },
  "Phone Use": {
    foundation: [
      "Notice one scroll trigger for “{goal}.”",
      "Take one 5-minute phone break for “{goal}.”",
      "Move one app off your home screen for “{goal}.”",
      "Charge away from bed for “{goal}.”",
    ],
    build: [
      "Hold one phone-free focus block for “{goal}.”",
      "Turn off one set of notifications for “{goal}.”",
      "Replace one scroll with action on “{goal}.”",
      "Check screen time once for “{goal}.”",
    ],
    push: [
      "Hold two phone-free focus blocks for “{goal}.”",
      "Set and keep one app limit for “{goal}.”",
      "Have a phone-free meal or hour for “{goal}.”",
      "Cut 30 minutes of scrolling for “{goal}.”",
    ],
    peak: [
      "Run a half-day low-phone block for “{goal}.”",
      "Keep every app limit today for “{goal}.”",
      "Design a phone-free routine for “{goal}.”",
      "Replace a scroll habit with a real one for “{goal}.”",
      "Hold your limits on a stressful day for “{goal}.”",
    ],
  },
  Purpose: {
    foundation: [
      "Write what matters today for “{goal}.”",
      "Choose one honest step for “{goal}.”",
      "Look at your path map for “{goal}.”",
      "Spend 10 minutes on “{goal}.”",
    ],
    build: [
      "Take one concrete step toward “{goal}.”",
      "Spend 20 focused minutes on “{goal}.”",
      "Align one decision with “{goal}.”",
      "Remove one obstacle to “{goal}.”",
    ],
    push: [
      "Make one decision you've avoided for “{goal}.”",
      "Spend 40 minutes on what matters most for “{goal}.”",
      "Say no to one distraction from “{goal}.”",
      "Build one piece of your life system for “{goal}.”",
    ],
    peak: [
      "Commit to one bold step for “{goal}.”",
      "Compound yesterday's progress on “{goal}.”",
      "Review your direction and recommit to “{goal}.”",
      "Build a system that sustains “{goal}.”",
      "Help someone else move toward their goal for “{goal}.”",
    ],
  },
};

const FALLBACK_TIERS: TieredQuests = {
  foundation: [
    "Take one small step toward “{goal}.”",
    "Spend 10 minutes on “{goal}.”",
    "Name one next action for “{goal}.”",
  ],
  build: [
    "Take one concrete step toward “{goal}.”",
    "Spend 20 focused minutes on “{goal}.”",
    "Remove one obstacle to “{goal}.”",
  ],
  push: [
    "Push past one limit on “{goal}.”",
    "Spend 40 focused minutes on “{goal}.”",
    "Do the hard part of “{goal}” first.",
  ],
  peak: [
    "Go fully after “{goal}” today.",
    "Compound yesterday's progress on “{goal}.”",
    "Build a system that sustains “{goal}.”",
  ],
};

function flattenTiers(tiers: TieredQuests): string[] {
  const seen = new Set<string>();
  const flat: string[] = [];

  for (const tier of QUEST_TIER_ORDER) {
    for (const quest of tiers[tier]) {
      if (seen.has(quest)) continue;
      seen.add(quest);
      flat.push(quest);
    }
  }

  return flat;
}

/** Direct tier access for the progression engine. */
export const QUEST_TIERS: Record<string, TieredQuests> = TIERED_QUESTS;
export const QUEST_TIERS_FALLBACK: TieredQuests = FALLBACK_TIERS;

/** Flat per-category view, kept for `generateProgressQuests` back-compat. */
export const QUEST_DATABASE: Record<string, CategoryQuests> = Object.fromEntries(
  Object.entries(TIERED_QUESTS).map(([category, tiers]) => [
    category,
    { progress: flattenTiers(tiers), tiers },
  ])
);

export const QUEST_DATABASE_FALLBACK: CategoryQuests = {
  progress: flattenTiers(FALLBACK_TIERS),
  tiers: FALLBACK_TIERS,
};
