/**
 * Quest generation — daily actionable quests, separate from Path milestones.
 *
 * Path short/mid/long-term goals are benchmarks for direction.
 * Quest Board shows small starter steps and category quests instead.
 */

import { DEFAULT_GOAL_PHRASE, GOAL_SLOT } from "../constants/goalDatabase";
import {
  QUEST_DATABASE,
  QUEST_DATABASE_FALLBACK,
} from "../constants/questDatabase";
import {
  STARTER_QUESTS,
  STARTER_QUESTS_FALLBACK,
  type StarterMode,
} from "../constants/questStarters";
import { getTodayKey } from "./questProgress";

export type GeneratedQuest = {
  title: string;
  type: string;
  steps: number;
  description?: string;
  starter?: boolean;
  suggested?: boolean;
  durationMinutes?: number;
};

export type QuestProfileContext = {
  category: string;
  specificGoal?: string;
  progressMeaning?: string;
  /** Benchmarks only — used in descriptions, never as quest titles. */
  shortTermBenchmark?: string;
  midTermBenchmark?: string;
  longTermBenchmark?: string;
};

const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  "Social Life": "Friends / Connection",
};

export function normalizeQuestCategory(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return "Purpose";
  return LEGACY_CATEGORY_ALIASES[trimmed] ?? trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GOAL_SLOT_PATTERN = new RegExp(escapeRegExp(GOAL_SLOT), "g");

/** Anchor for {goal} slots — specific goal or progress meaning, never a milestone title. */
export function getQuestGoalAnchor(context: QuestProfileContext): string {
  return (
    context.specificGoal?.trim() ||
    context.progressMeaning?.trim() ||
    DEFAULT_GOAL_PHRASE
  );
}

function fillGoalSlot(text: string, goalPhrase: string): string {
  return text.replace(GOAL_SLOT_PATTERN, goalPhrase);
}

function pickRotatingTemplate(templates: string[], salt: string): string {
  if (templates.length === 0) return "";
  let hash = 0;
  for (let i = 0; i < salt.length; i += 1) {
    hash = (hash + salt.charCodeAt(i) * (i + 1)) % templates.length;
  }
  return templates[hash] ?? templates[0];
}

function benchmarkHint(context: QuestProfileContext): string | undefined {
  const short = context.shortTermBenchmark?.trim();
  if (!short) return undefined;
  return `Path benchmark (2 weeks): ${short}`;
}

/**
 * One small, easy quest that should appear first after check-in.
 */
export function generateStarterQuest(
  context: QuestProfileContext,
  mode: StarterMode
): GeneratedQuest {
  const category = normalizeQuestCategory(context.category);
  const pool = STARTER_QUESTS[category]?.[mode] ?? STARTER_QUESTS_FALLBACK[mode];
  const title = pickRotatingTemplate(pool, `${getTodayKey()}-${category}-${mode}`);

  return {
    title,
    type: "Starter",
    steps: 1,
    starter: true,
    suggested: true,
    durationMinutes: 10,
    description:
      benchmarkHint(context) ??
      "A small first step — milestones on your Path are benchmarks, not today's whole quest.",
  };
}

function buildSuggestedStarterSequence(context: QuestProfileContext, mode: StarterMode): GeneratedQuest[] {
  const category = normalizeQuestCategory(context.category);
  const pool = STARTER_QUESTS[category]?.[mode] ?? STARTER_QUESTS_FALLBACK[mode];
  const hint =
    benchmarkHint(context) ??
    "Optional direction from MYLIT — milestones on your Path are benchmarks, not today's whole quest.";
  const firstTitle = pickRotatingTemplate(pool, `${getTodayKey()}-${category}-${mode}`);
  const seen = new Set<string>();
  const quests: GeneratedQuest[] = [];

  const pushTitle = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    quests.push({
      title: trimmed,
      type: "Starter",
      steps: 1,
      starter: quests.length === 0,
      suggested: true,
      durationMinutes: 10,
      description: hint,
    });
  };

  pushTitle(firstTitle);
  for (const title of pool) pushTitle(title);
  for (const title of STARTER_QUESTS_FALLBACK[mode]) pushTitle(title);

  return quests;
}

/** Full optional direction chain for the day — only one is shown on the board at a time. */
export function generateSuggestedQuestSequence(
  context: QuestProfileContext,
  mode: StarterMode
): GeneratedQuest[] {
  const starters = buildSuggestedStarterSequence(context, mode);
  const followUps = (mode === "progress" ? generateProgressQuests(context, 4) : generateRecoveryQuests(context, 3)).map(
    (quest) => ({
      ...quest,
      suggested: true,
    })
  );
  return [...starters, ...followUps];
}

export function getActiveSuggestedQuest(
  context: QuestProfileContext,
  mode: StarterMode,
  completedTitles: Set<string>,
  missedTitles: Set<string>
): GeneratedQuest | null {
  for (const quest of generateSuggestedQuestSequence(context, mode)) {
    if (completedTitles.has(quest.title) || missedTitles.has(quest.title)) continue;
    return quest;
  }
  return null;
}

const RECOVERY_CATEGORY_QUESTS: Record<string, string[]> = {
  Health: [
    "Stretch for 5 calm minutes",
    "Choose one easy healthy meal",
    "Rest and protect sleep tonight",
  ],
  Money: [
    "Write one small money step for tomorrow",
    "Review your goal without pressure",
    "Protect sleep so you can act with more energy",
  ],
  Mind: [
    "Write a gentle brain-dump",
    "Name one feeling without judging it",
    "Take 3 deep breaths before your next task",
  ],
  "Friends / Connection": [
    "Reflect on one person you want to reconnect with",
    "Send a low-pressure message if it feels realistic",
    "Journal about what makes connection hard",
  ],
  "School / Work": [
    "Pick one simple work/school priority",
    "Set up materials for tomorrow",
    "Rest so your focus can recover",
  ],
  Confidence: [
    "Choose one tiny promise you can keep",
    "Speak kindly to yourself once today",
    "Reflect on a moment you handled well",
  ],
  Creativity: [
    "Open your project for 5 minutes",
    "Collect one inspiration",
    "Rest so your creativity can recharge",
  ],
  Sleep: [
    "Take one short rest break",
    "Use a low-stimulation wind-down",
    "Protect your bedtime tonight",
  ],
  "Phone Use": [
    "Use one short phone break",
    "Move distracting apps out of reach",
    "Journal what pulls you into scrolling",
  ],
  Purpose: [
    "Write one reason your path matters",
    "Choose one tiny step for tomorrow",
    "Rest and reconnect with your why",
  ],
};

const RECOVERY_FALLBACK = [
  "Choose one gentle step for today",
  "Rest without guilt",
  "Journal one honest line about your day",
];

export function generateRecoveryQuests(context: QuestProfileContext, count = 3): GeneratedQuest[] {
  const category = normalizeQuestCategory(context.category);
  const source = RECOVERY_CATEGORY_QUESTS[category] ?? RECOVERY_FALLBACK;
  const hint = benchmarkHint(context);

  return source.slice(0, count).map((title) => ({
    title,
    type: category,
    steps: 1,
    durationMinutes: 20,
    description: hint,
  }));
}

/**
 * Progress-mode follow-up quests (after the starter). Uses specific goal anchor only.
 */
/**
 * One small optional quest sourced from the user's Supplementary Path category —
 * kept separate from the Main Path quest chain above. Main Path still drives most
 * quest generation; this just gives Supplementary Path a way to surface smaller
 * day-to-day goals (e.g. Main = School/Work, Supplementary = Health).
 */
export function generateSupplementaryQuest(
  supplementaryCategory: string | undefined,
  mode: StarterMode,
  goalPhrase: string = DEFAULT_GOAL_PHRASE
): GeneratedQuest | null {
  const trimmed = supplementaryCategory?.trim();
  if (!trimmed) return null;

  const category = normalizeQuestCategory(trimmed);
  const entry = QUEST_DATABASE[category] ?? QUEST_DATABASE_FALLBACK;
  const source =
    mode === "progress"
      ? entry.progress.length > 0
        ? entry.progress
        : QUEST_DATABASE_FALLBACK.progress
      : RECOVERY_CATEGORY_QUESTS[category] ?? RECOVERY_FALLBACK;

  const template = pickRotatingTemplate(source, `${getTodayKey()}-supplementary-${category}-${mode}`);
  if (!template) return null;

  return {
    title: fillGoalSlot(template, goalPhrase),
    type: category,
    steps: 1,
    durationMinutes: 15,
    suggested: true,
    description: `Supplementary Path (${category}) — a smaller goal alongside your Main Path.`,
  };
}

export function generateProgressQuests(context: QuestProfileContext, count = 4): GeneratedQuest[] {
  const category = normalizeQuestCategory(context.category);
  const entry = QUEST_DATABASE[category] ?? QUEST_DATABASE_FALLBACK;
  const source = entry.progress.length > 0 ? entry.progress : QUEST_DATABASE_FALLBACK.progress;

  const goalPhrase = getQuestGoalAnchor(context);
  const hint = benchmarkHint(context);
  const seen = new Set<string>();
  const quests: GeneratedQuest[] = [];

  for (const template of source) {
    const title = fillGoalSlot(template, goalPhrase);
    if (seen.has(title)) continue;
    seen.add(title);
    quests.push({
      title,
      type: category,
      steps: 1,
      durationMinutes: 30,
      description: hint,
    });
    if (quests.length >= count) break;
  }

  return quests;
}
