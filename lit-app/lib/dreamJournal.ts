import AsyncStorage from "@react-native-async-storage/async-storage";

import { persistProgressKeys } from "./progressStore";
import { DREAM_JOURNAL_KEY, USER_STATS_KEY } from "./storageKeys";
import { recordAgentEvent } from "./mylitAgents";

export type DreamEntry = {
  id: string;
  title: string;
  summary: string;
  feeling: string;
  createdAt: string;
  updatedAt?: string;
};

export async function loadDreamEntries(): Promise<DreamEntry[]> {
  const saved = await AsyncStorage.getItem(DREAM_JOURNAL_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The one shared dream-save path — used by both the full Dream Journal page and the inline
 * modal opened from Morning Check-In (see components/DreamJournalEntryModal.tsx), so a dream
 * saved from either place earns its step exactly once through the same ledger and shows up in
 * the same history either way.
 */
export async function saveDreamEntry(input: { title: string; summary: string; feeling: string }): Promise<DreamEntry | null> {
  if (!input.title.trim() && !input.summary.trim()) return null;

  const entry: DreamEntry = {
    id: String(Date.now()),
    title: input.title.trim(),
    summary: input.summary.trim(),
    feeling: input.feeling,
    createdAt: new Date().toISOString(),
  };

  const existing = await loadDreamEntries();
  await persistProgressKeys({ [DREAM_JOURNAL_KEY]: JSON.stringify([entry, ...existing]) });

  const savedStats = await AsyncStorage.getItem(USER_STATS_KEY);
  const currentStats: Record<string, unknown> = savedStats ? JSON.parse(savedStats) : {};
  await persistProgressKeys({
    [USER_STATS_KEY]: JSON.stringify({ ...currentStats, totalSteps: Number(currentStats.totalSteps ?? 0) + 1 }),
  });

  void recordAgentEvent({ type: "dream_saved", sourcePage: "dream-journal", relatedItemId: entry.id, stepDelta: 1, metadata: { feeling: input.feeling } });

  return entry;
}

/**
 * Edit-in-place path — same id, no new record, no second step award (unlike saveDreamEntry,
 * this never touches USER_STATS_KEY). createdAt is preserved; only updatedAt changes.
 */
export async function updateDreamEntry(
  id: string,
  input: { title: string; summary: string; feeling: string }
): Promise<DreamEntry | null> {
  if (!input.title.trim() && !input.summary.trim()) return null;

  const existing = await loadDreamEntries();
  let updated: DreamEntry | null = null;
  const next = existing.map((entry) => {
    if (entry.id !== id) return entry;
    updated = { ...entry, title: input.title.trim(), summary: input.summary.trim(), feeling: input.feeling, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (!updated) return null;

  await persistProgressKeys({ [DREAM_JOURNAL_KEY]: JSON.stringify(next) });
  void recordAgentEvent({ type: "dream_saved", sourcePage: "dream-journal", relatedItemId: id, metadata: { feeling: input.feeling, edited: true } });

  return updated;
}
