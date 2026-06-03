/**
 * Quest generation interface.
 *
 * Offline, instant generation of daily quests from the bundled
 * `questDatabase.ts`, mirroring `goalGeneration.ts`. Quests are anchored to the
 * user's specific goal via the `{goal}` slot.
 *
 * Phase: **Progress mode.** Recovery is still served by the inline map in
 * `(tabs)/index.tsx` and will move here when migrated.
 */

import { DEFAULT_GOAL_PHRASE, GOAL_SLOT } from "../constants/goalDatabase";
import {
  QUEST_DATABASE,
  QUEST_DATABASE_FALLBACK,
} from "../constants/questDatabase";

export type GeneratedQuest = {
  title: string;
  type: string;
  steps: number;
};

export type QuestGenerationInput = {
  category: string;
  specificGoal?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GOAL_SLOT_PATTERN = new RegExp(escapeRegExp(GOAL_SLOT), "g");

/**
 * Offline Progress-mode quests for a category, with the user's specific goal
 * slotted in. Returns up to `count` quests (deduped, in authored order).
 */
export function generateProgressQuests(
  input: QuestGenerationInput,
  count = 5
): GeneratedQuest[] {
  const entry = QUEST_DATABASE[input.category] ?? QUEST_DATABASE_FALLBACK;
  const source = entry.progress.length > 0 ? entry.progress : QUEST_DATABASE_FALLBACK.progress;

  const goalPhrase = input.specificGoal?.trim() || DEFAULT_GOAL_PHRASE;
  const fill = (text: string) => text.replace(GOAL_SLOT_PATTERN, goalPhrase);

  const seen = new Set<string>();
  const quests: GeneratedQuest[] = [];

  for (const template of source) {
    const title = fill(template);
    if (seen.has(title)) continue;
    seen.add(title);
    quests.push({ title, type: input.category, steps: 1 });
    if (quests.length >= count) break;
  }

  return quests;
}
