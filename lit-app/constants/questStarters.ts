/**
 * Small, easy-to-start daily quests. Milestones on Path are benchmarks —
 * these are the actual first steps MYLIT puts on the Quest Board.
 */

export type StarterMode = "progress" | "recovery";

export const STARTER_QUESTS: Record<string, Record<StarterMode, string[]>> = {
  Health: {
    progress: [
      "Drink one glass of water (about 2 minutes).",
      "Take a 5-minute walk or gentle stretch.",
      "Prep or eat one simple nourishing snack.",
    ],
    recovery: [
      "Stretch gently for 5 minutes.",
      "Drink water and rest your eyes for 5 minutes.",
      "Take 3 slow breaths before your next task.",
    ],
  },
  Money: {
    progress: [
      "Write one money step you can take in 10 minutes.",
      "Check one account or bill — just look, no pressure.",
      "Move $1 (or any small amount) toward savings.",
    ],
    recovery: [
      "Journal one money worry without fixing it yet.",
      "List one free resource you already have.",
      "Rest — money clarity comes easier with energy.",
    ],
  },
  Mind: {
    progress: [
      "Write one honest sentence in your journal.",
      "Notice one thought pattern for 5 minutes.",
      "Pause before one reaction today.",
    ],
    recovery: [
      "Brain-dump three thoughts onto paper.",
      "Name one feeling without judging it.",
      "Take 3 slow breaths.",
    ],
  },
  "Friends / Connection": {
    progress: [
      "Send one low-pressure message to someone.",
      "Think of one person you'd like to reconnect with.",
      "Practice one small social step (even a smile counts).",
    ],
    recovery: [
      "Journal about one connection that felt good recently.",
      "Send a simple “thinking of you” if it feels right.",
      "Rest — connection can wait until you have energy.",
    ],
  },
  "School / Work": {
    progress: [
      "Open your materials and name one 10-minute task.",
      "Clear one small blocker on your desk or screen.",
      "Work one focused 10-minute block — timer optional.",
    ],
    recovery: [
      "Pick one simple priority for tomorrow.",
      "Set up what you'll need for the next work block.",
      "Rest so focus can come back.",
    ],
  },
  Confidence: {
    progress: [
      "Keep one tiny promise to yourself today.",
      "Write down one small win from this week.",
      "Do one safe action that feels slightly uncomfortable.",
    ],
    recovery: [
      "Speak kindly to yourself once out loud.",
      "Reflect on a moment you handled well.",
      "Choose one promise you can definitely keep today.",
    ],
  },
  Creativity: {
    progress: [
      "Open your project for 5 minutes — no pressure to finish.",
      "Capture one idea in notes or voice memo.",
      "Make one rough sketch, line, or sentence.",
    ],
    recovery: [
      "Collect one piece of inspiration.",
      "Journal what you'd create if energy were unlimited.",
      "Rest — creativity refuels with rest.",
    ],
  },
  Sleep: {
    progress: [
      "Pick a realistic bedtime target for tonight.",
      "Dim screens 15 minutes earlier than usual.",
      "Do one calm wind-down action before bed.",
    ],
    recovery: [
      "Take one short rest break if you can.",
      "Lower stimulation for 10 minutes.",
      "Protect bedtime — rest is the quest today.",
    ],
  },
  "Phone Use": {
    progress: [
      "Notice what pulled you to your phone once today.",
      "Try one 10-minute phone-free block.",
      "Move one distracting app off your home screen.",
    ],
    recovery: [
      "Journal what scrolling gives you and costs you.",
      "Take a 5-minute screen break.",
      "Rest your eyes and hands for a few minutes.",
    ],
  },
  Purpose: {
    progress: [
      "Write one sentence — what would a good first step look like today?",
      "Spend 10 minutes on what matters most right now.",
      "Align one small action with your path.",
    ],
    recovery: [
      "Write why your path still matters to you.",
      "Choose one tiny step for tomorrow.",
      "Rest and reconnect with your why.",
    ],
  },
};

export const STARTER_QUESTS_FALLBACK: Record<StarterMode, string[]> = {
  progress: [
    "Take one honest 10-minute step toward your path.",
    "Write one sentence about what you'll do first today.",
  ],
  recovery: [
    "Choose one tiny step you can keep today.",
    "Rest — recovery counts as progress.",
  ],
};
