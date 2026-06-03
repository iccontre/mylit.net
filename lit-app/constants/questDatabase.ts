/**
 * Offline quest database.
 *
 * Mirrors `goalDatabase.ts`: the app ships these so the Quest Board works fully
 * offline. Each category holds daily, actionable quests per mode. Every quest
 * uses the `{goal}` slot, replaced at runtime with the user's specific goal.
 *
 * Phase: **Progress mode first.** Recovery quests still come from the inline
 * map in `(tabs)/index.tsx` until they're migrated here too.
 *
 * These are concise, tile-friendly seeds. `scripts/generateQuestDatabase.mjs`
 * can regenerate them from the ROG model (Tailscale 100.116.162.41); keep
 * quests short when reviewing model output. The app never calls the LLM at
 * runtime.
 */

export type QuestMode = "progress" | "recovery";

export type CategoryQuests = {
  progress: string[];
  recovery?: string[];
};

export const QUEST_DATABASE: Record<string, CategoryQuests> = {
  Health: {
    progress: [
      "Do 25 minutes of intentional movement toward “{goal}.”",
      "Log everything you eat today to support “{goal}.”",
      "Hit your protein and water targets for “{goal}.”",
      "Push one workout slightly harder than yesterday for “{goal}.”",
      "Prep one healthy meal in advance for “{goal}.”",
    ],
  },
  Money: {
    progress: [
      "Move a set amount into savings today toward “{goal}.”",
      "Spend 20 minutes building one income skill for “{goal}.”",
      "Cut or cancel one non-essential expense for “{goal}.”",
      "Review today's spending against “{goal}.”",
      "Take one concrete action on an income opportunity for “{goal}.”",
    ],
  },
  Mind: {
    progress: [
      "Journal one focused page about “{goal}.”",
      "Do one 15-minute deep-work block on “{goal}.”",
      "Notice and reframe one limiting thought about “{goal}.”",
      "Read or learn something that advances “{goal}.”",
      "Plan tomorrow's top step for “{goal}.”",
    ],
  },
  "Friends / Connection": {
    progress: [
      "Reach out to one person to move “{goal}” forward.",
      "Start one real conversation that serves “{goal}.”",
      "Make a concrete plan to meet someone for “{goal}.”",
      "Follow up with someone you owe a reply for “{goal}.”",
      "Do one intentional, kind act for a relationship in “{goal}.”",
    ],
  },
  "School / Work": {
    progress: [
      "Finish one focused work block on “{goal}.”",
      "Do the single most important task for “{goal}” first.",
      "Make visible progress on your top “{goal}” project.",
      "Clear one blocker standing in the way of “{goal}.”",
      "Plan tomorrow's top three steps for “{goal}.”",
    ],
  },
  Confidence: {
    progress: [
      "Do one slightly uncomfortable action toward “{goal}.”",
      "Keep a promise to yourself today for “{goal}.”",
      "Speak up once in service of “{goal}.”",
      "Write down one win you earned toward “{goal}.”",
      "Take initiative on one thing for “{goal}” without waiting.",
    ],
  },
  Creativity: {
    progress: [
      "Spend 25 focused minutes creating toward “{goal}.”",
      "Ship or share one small piece for “{goal}.”",
      "Push one idea for “{goal}” from notes into a draft.",
      "Finish one rough section of your “{goal}” project.",
      "Study one craft technique that serves “{goal}.”",
    ],
  },
  Sleep: {
    progress: [
      "Lock in your target bedtime tonight for “{goal}.”",
      "Start your wind-down 30 minutes early for “{goal}.”",
      "Cut screens an hour before bed to support “{goal}.”",
      "Keep the same wake time today for “{goal}.”",
      "Prep your room for better sleep toward “{goal}.”",
    ],
  },
  "Phone Use": {
    progress: [
      "Hold one phone-free focus block for “{goal}.”",
      "Replace one scroll session with action on “{goal}.”",
      "Turn off one set of notifications to protect “{goal}.”",
      "Keep your phone out of reach during “{goal}” work.",
      "Track today's screen time against “{goal}.”",
    ],
  },
  Purpose: {
    progress: [
      "Take one honest, concrete step toward “{goal}.”",
      "Spend 20 minutes on what matters most for “{goal}.”",
      "Align one decision today with “{goal}.”",
      "Review your progress and adjust toward “{goal}.”",
      "Say no to one thing that distracts from “{goal}.”",
    ],
  },
};

export const QUEST_DATABASE_FALLBACK: CategoryQuests = {
  progress: [
    "Take one concrete step toward “{goal}” today.",
    "Spend 20 focused minutes on “{goal}.”",
    "Remove one obstacle in the way of “{goal}.”",
  ],
};
