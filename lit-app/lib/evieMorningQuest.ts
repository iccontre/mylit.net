import { generateQuestFromMorningIntent, type GeneratedQuest } from "./questGeneration";
import { persistProgressKeys } from "./progressStore";
import { readJson } from "./readJson";
import { getQuestDayKey, getStepsForItem } from "./scheduling";
import { EVIE_MORNING_QUEST_KEY } from "./storageKeys";
import type { GeneratedQuestProposal } from "./agentTypes";

export type EvieMorningQuest = GeneratedQuest & {
  id: string;
  questDayKey: string;
  sourceText: string;
  createdAt: string;
  /** Set metadata — always "evie_path" per the Evie Path quest classification. */
  source: "evie_path";
};

/**
 * Loads today's already-generated Evie Morning quest, if any — never regenerates for a
 * quest-day that already has one (retries/refreshes/another device all see the SAME quest;
 * cross-device races are resolved by mergeEvieMorningQuest's "earliest createdAt wins" rule
 * in progressStore.ts).
 */
export async function loadTodaysEvieMorningQuest(): Promise<EvieMorningQuest | null> {
  const saved = await readJson<EvieMorningQuest | null>(EVIE_MORNING_QUEST_KEY, null);
  if (!saved || saved.questDayKey !== getQuestDayKey()) return null;
  return saved;
}

/**
 * Generates (if not already generated today) and persists Evie's one concrete quest from the
 * Morning Check-In answer. Uses the deterministic path-agent transform in questGeneration.ts —
 * reliable enough to be the primary path, not just an AI-failure fallback (see
 * generateQuestFromMorningIntent's docstring).
 */
export async function ensureEvieMorningQuest(sourceText: string): Promise<EvieMorningQuest | null> {
  const trimmed = sourceText.trim();
  if (!trimmed) return null;

  const existing = await loadTodaysEvieMorningQuest();
  if (existing) return existing;

  const generated = generateQuestFromMorningIntent(trimmed);
  const quest: EvieMorningQuest = {
    ...generated,
    id: `evie-morning-quest-${getQuestDayKey()}`,
    questDayKey: getQuestDayKey(),
    sourceText: trimmed,
    createdAt: new Date().toISOString(),
    source: "evie_path",
  };

  await persistProgressKeys({ [EVIE_MORNING_QUEST_KEY]: JSON.stringify(quest) });
  return quest;
}

/**
 * Accepts a user-chosen AI-generated proposal (Push Forward / Focused Pace, see
 * lib/questGenerationAi.ts) as today's Evie Morning quest — the SAME canonical slot
 * ensureEvieMorningQuest writes to, so an accepted proposal flows through every existing
 * Home/Calendar/completion/reward path unchanged. Idempotent per quest-day: accepting again
 * (e.g. a retried save) simply replaces this same single-record slot, never duplicates it.
 */
export async function acceptGeneratedMorningQuest(proposal: GeneratedQuestProposal, sourceText: string): Promise<EvieMorningQuest> {
  const quest: EvieMorningQuest = {
    title: proposal.title,
    type: "Evie Path",
    kind: proposal.mode,
    steps: getStepsForItem(proposal.durationMinutes, proposal.mode),
    durationMinutes: proposal.durationMinutes,
    suggested: true,
    description: proposal.rationale || proposal.description,
    id: `evie-morning-quest-${getQuestDayKey()}`,
    questDayKey: getQuestDayKey(),
    sourceText: sourceText.trim(),
    createdAt: new Date().toISOString(),
    source: "evie_path",
  };

  await persistProgressKeys({ [EVIE_MORNING_QUEST_KEY]: JSON.stringify(quest) });
  return quest;
}
