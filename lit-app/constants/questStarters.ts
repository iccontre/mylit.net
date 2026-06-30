/**
 * Small, easy-to-start daily quests. Milestones on Path are benchmarks —
 * these are the actual first steps MYLIT puts on the Quest Board.
 */

export type StarterMode = "progress" | "recovery";

export const STARTER_QUESTS: Record<string, Record<StarterMode, string[]>> = {
  Health: {
    progress: [
      "Starter: drink one glass of water (about 2 minutes).",
      "Starter: take a 5-minute walk or gentle stretch.",
      "Starter: prep or eat one simple nourishing snack.",
    ],
    recovery: [
      "Starter: stretch gently for 5 minutes.",
      "Starter: drink water and rest your eyes for 5 minutes.",
      "Starter: take 3 slow breaths before your next task.",
    ],
  },
  Money: {
    progress: [
      "Starter: write one money step you can take in 10 minutes.",
      "Starter: check one account or bill — just look, no pressure.",
      "Starter: move $1 (or any small amount) toward savings.",
    ],
    recovery: [
      "Starter: journal one money worry without fixing it yet.",
      "Starter: list one free resource you already have.",
      "Starter: rest — money clarity comes easier with energy.",
    ],
  },
  Mind: {
    progress: [
      "Starter: write one honest sentence in your journal.",
      "Starter: notice one thought pattern for 5 minutes.",
      "Starter: pause before one reaction today.",
    ],
    recovery: [
      "Starter: brain-dump three thoughts onto paper.",
      "Starter: name one feeling without judging it.",
      "Starter: take 3 slow breaths.",
    ],
  },
  "Friends / Connection": {
    progress: [
      "Starter: send one low-pressure message to someone.",
      "Starter: think of one person you'd like to reconnect with.",
      "Starter: practice one small social step (even a smile counts).",
    ],
    recovery: [
      "Starter: journal about one connection that felt good recently.",
      "Starter: send a simple “thinking of you” if it feels right.",
      "Starter: rest — connection can wait until you have energy.",
    ],
  },
  "School / Work": {
    progress: [
      "Starter: open your materials and name one 10-minute task.",
      "Starter: clear one small blocker on your desk or screen.",
      "Starter: work one focused 10-minute block — timer optional.",
    ],
    recovery: [
      "Starter: pick one simple priority for tomorrow.",
      "Starter: set up what you'll need for the next work block.",
      "Starter: rest so focus can come back.",
    ],
  },
  Confidence: {
    progress: [
      "Starter: keep one tiny promise to yourself today.",
      "Starter: write down one small win from this week.",
      "Starter: do one safe action that feels slightly uncomfortable.",
    ],
    recovery: [
      "Starter: speak kindly to yourself once out loud.",
      "Starter: reflect on a moment you handled well.",
      "Starter: choose one promise you can definitely keep today.",
    ],
  },
  Creativity: {
    progress: [
      "Starter: open your project for 5 minutes — no pressure to finish.",
      "Starter: capture one idea in notes or voice memo.",
      "Starter: make one rough sketch, line, or sentence.",
    ],
    recovery: [
      "Starter: collect one piece of inspiration.",
      "Starter: journal what you'd create if energy were unlimited.",
      "Starter: rest — creativity refuels with rest.",
    ],
  },
  Sleep: {
    progress: [
      "Starter: pick a realistic bedtime target for tonight.",
      "Starter: dim screens 15 minutes earlier than usual.",
      "Starter: do one calm wind-down action before bed.",
    ],
    recovery: [
      "Starter: take one short rest break if you can.",
      "Starter: lower stimulation for 10 minutes.",
      "Starter: protect bedtime — rest is the quest today.",
    ],
  },
  "Phone Use": {
    progress: [
      "Starter: notice what pulled you to your phone once today.",
      "Starter: try one 10-minute phone-free block.",
      "Starter: move one distracting app off your home screen.",
    ],
    recovery: [
      "Starter: journal what scrolling gives you and costs you.",
      "Starter: take a 5-minute screen break.",
      "Starter: rest your eyes and hands for a few minutes.",
    ],
  },
  Purpose: {
    progress: [
      "Starter: write one sentence — what would a good first step look like today?",
      "Starter: spend 10 minutes on what matters most right now.",
      "Starter: align one small action with your path.",
    ],
    recovery: [
      "Starter: write why your path still matters to you.",
      "Starter: choose one tiny step for tomorrow.",
      "Starter: rest and reconnect with your why.",
    ],
  },
};

export const STARTER_QUESTS_FALLBACK: Record<StarterMode, string[]> = {
  progress: [
    "Starter: take one honest 10-minute step toward your path.",
    "Starter: write one sentence about what you'll do first today.",
  ],
  recovery: [
    "Starter: choose one tiny step you can keep today.",
    "Starter: rest — recovery counts as progress.",
  ],
};
