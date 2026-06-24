/**
 * Sustainable quest progression.
 *
 * Turns the static Progress-mode quest list into a day-over-day journey: each
 * day the user finishes their quests, the category's `level` rolls forward, so
 * the next day's quests go one step further — durations scale up, the quest set
 * rotates, and a "one step past yesterday" capstone is offered.
 *
 * Fully offline. State lives in AsyncStorage, keyed per category, mirroring the
 * rest of the Quest Board. The model is never called at runtime.
 *
 * Day model (pinned per calendar day so quests never jump mid-day):
 *  - `level`         : which day of the journey today is (starts at 1 = Day 1).
 *  - `streak`        : consecutive fully-completed days, not counting today.
 *  - `completedToday`: did the user finish today's quests yet.
 *  - `lastActiveDate`: the day this state was last rolled forward to.
 *
 * Level only ever moves up (momentum is preserved — missing a day resets the
 * streak but never demotes the journey), which keeps it forgiving / sustainable.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_GOAL_PHRASE, GOAL_SLOT } from "../constants/goalDatabase";
import {
  QUEST_TIERS,
  QUEST_TIERS_FALLBACK,
  type QuestTier,
} from "../constants/questDatabase";
import type { GeneratedQuest, QuestGenerationInput } from "./questGeneration";

export type ProgressionState = {
  level: number;
  streak: number;
  completedToday: boolean;
  lastActiveDate: string | null;
};

export type ProgressionQuest = GeneratedQuest & { description?: string };

const PROGRESSION_KEY = "lit_quest_progression";

// Duration growth: +8% per level, capped at +80% so quests stay realistic.
const GROWTH_PER_LEVEL = 0.08;
const MAX_GROWTH_LEVELS = 10;

function defaultState(): ProgressionState {
  return { level: 1, streak: 0, completedToday: false, lastActiveDate: null };
}

function dayDiff(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Advance a pinned day-state to `today`. Runs once per calendar day:
 * a finished previous day bumps the level (and extends or restarts the streak);
 * a skipped day keeps the level but resets the streak.
 */
function rollForward(state: ProgressionState, today: string): ProgressionState {
  if (state.lastActiveDate === today) return state;

  let { level, streak } = state;

  if (state.lastActiveDate) {
    if (state.completedToday) {
      level += 1;
      streak = dayDiff(state.lastActiveDate, today) === 1 ? streak + 1 : 1;
    } else {
      streak = 0;
    }
  }

  return { level, streak, completedToday: false, lastActiveDate: today };
}

async function loadMap(): Promise<Record<string, ProgressionState>> {
  const saved = await AsyncStorage.getItem(PROGRESSION_KEY);
  if (!saved) return {};

  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveMap(map: Record<string, ProgressionState>): Promise<void> {
  await AsyncStorage.setItem(PROGRESSION_KEY, JSON.stringify(map));
}

/**
 * Today's pinned progression for a category, rolling the journey forward if a
 * new day has started. Persists any roll-forward so the level is stable for the
 * rest of the day.
 */
export async function getCategoryProgressionState(
  category: string,
  today: string
): Promise<ProgressionState> {
  const map = await loadMap();
  const current = map[category] ?? defaultState();
  const rolled = rollForward(current, today);

  if (rolled !== current) {
    map[category] = rolled;
    await saveMap(map);
  }

  return rolled;
}

/**
 * Mark today's quests as finished for a category. Idempotent within a day; the
 * level itself advances on the next day's roll-forward, so today stays stable.
 */
export async function markProgressionDayComplete(
  category: string,
  today: string
): Promise<ProgressionState> {
  const map = await loadMap();
  const current = rollForward(map[category] ?? defaultState(), today);

  const next: ProgressionState = current.completedToday
    ? current
    : { ...current, completedToday: true };

  map[category] = next;
  await saveMap(map);

  return next;
}

/** Streak to show today, optimistically counting today once it's finished. */
export function displayStreak(state: ProgressionState | null): number {
  if (!state) return 0;
  return state.streak + (state.completedToday ? 1 : 0);
}

function roundToNice(value: number): number {
  if (value <= 10) return Math.round(value);
  if (value < 60) return Math.round(value / 5) * 5;
  return Math.round(value / 10) * 10;
}

/**
 * Scale the minute-durations inside a quest title up with the level, so the same
 * action asks for a little more than yesterday. Non-duration quests are returned
 * unchanged (the rotation + capstone carry the progression for those).
 */
export function scaleQuestTitleForLevel(title: string, level: number): string {
  if (level <= 1) return title;

  const steps = Math.min(level - 1, MAX_GROWTH_LEVELS);
  const multiplier = 1 + steps * GROWTH_PER_LEVEL;

  return title.replace(
    /(\d+)(\s*-?\s*)(minutes|minute|min)\b/gi,
    (_match, num: string, gap: string, unit: string) => {
      const scaled = roundToNice(parseInt(num, 10) * multiplier);
      return `${scaled}${gap}${unit}`;
    }
  );
}

function rotate<T>(items: T[], by: number): T[] {
  if (items.length === 0) return items;
  const offset = ((by % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

// Day-level → tier. Widening windows so the journey keeps climbing through the
// first two weeks, then settles into the peak band (which keeps cycling).
export function tierForLevel(level: number): QuestTier {
  if (level <= 3) return "foundation";
  if (level <= 7) return "build";
  if (level <= 13) return "push";
  return "peak";
}

const TIER_LABEL: Record<QuestTier, string> = {
  foundation: "Foundation",
  build: "Build",
  push: "Push",
  peak: "Peak",
};

export function tierLabelForLevel(level: number): string {
  return TIER_LABEL[tierForLevel(level)];
}

const STRETCH_TITLE: Record<QuestTier, (goal: string) => string> = {
  foundation: (goal) => `Lay one more brick toward “${goal}”`,
  build: (goal) => `Build one level higher on “${goal}”`,
  push: (goal) => `Push past yesterday's limit on “${goal}”`,
  peak: (goal) => `Hold your peak and stretch “${goal}” further`,
};

function fillGoal(text: string, goal: string): string {
  return text.split(GOAL_SLOT).join(goal);
}

/**
 * Today's escalating Progress-mode quests. The day-level selects a tier (whose
 * *actions* level up — show-up → consistent → harder → mastery), the list is
 * rotated by the day so it stays fresh within the tier, and minute-durations are
 * nudged up for the current level.
 */
export function buildProgressionQuests(
  input: QuestGenerationInput,
  level: number,
  count = 4
): ProgressionQuest[] {
  const tiers = QUEST_TIERS[input.category] ?? QUEST_TIERS_FALLBACK;
  const tier = tierForLevel(level);
  const pool = tiers[tier]?.length ? tiers[tier] : QUEST_TIERS_FALLBACK[tier];

  const goal = input.specificGoal?.trim() || DEFAULT_GOAL_PHRASE;

  const seen = new Set<string>();
  const filled: string[] = [];
  for (const template of pool) {
    const title = fillGoal(template, goal);
    if (seen.has(title)) continue;
    seen.add(title);
    filled.push(title);
  }

  return rotate(filled, level - 1)
    .slice(0, count)
    .map((title) => ({
      title: scaleQuestTitleForLevel(title, level),
      type: input.category,
      steps: 1,
    }));
}

/**
 * The daily capstone that makes the "one step further than yesterday" idea
 * explicit. Its framing changes with the tier so it never feels identical.
 * Worth 2 steps and surfaces at the top of the board.
 */
export function buildStretchQuest(
  input: QuestGenerationInput,
  level: number
): ProgressionQuest {
  const goal = input.specificGoal?.trim() || DEFAULT_GOAL_PHRASE;
  const tier = tierForLevel(level);

  return {
    title: STRETCH_TITLE[tier](goal),
    type: input.category,
    steps: 2,
    description:
      level <= 1
        ? "Set today's baseline — tomorrow builds one step further."
        : `Day ${level} · ${TIER_LABEL[tier]}: go one notch beyond yesterday.`,
  };
}
