// Shared helpers for the per-feature History popups (Journal, Dream, Meditation,
// Reflection, Pre-Sleep). Each entry page reads its existing synced log key and
// normalizes rows into HistoryEntry, then HistoryModal groups them by week.
// These read the SAME keys the entry pages already write (and sync/merge), so no
// new storage keys are introduced and nothing is duplicated or double-awarded.

export type HistoryEntry = {
  id: string;
  at: number; // ms timestamp used for sorting + weekly grouping
  whenLabel: string;
  heading?: string;
  preview: string;
  body: string;
  meta?: string;
};

export type HistoryNormalizer = (items: Record<string, unknown>[]) => HistoryEntry[];

export function parseLogArray(raw: string | null): Record<string, unknown>[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function toAt(createdAt: unknown, id: unknown): number {
  const raw = str(createdAt);
  if (raw) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const idNum = Number(id);
  return Number.isFinite(idNum) ? idNum : 0;
}

function whenLabel(createdAt: unknown, at: number): string {
  const raw = str(createdAt);
  const parsed = raw ? Date.parse(raw) : NaN;
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (raw) return raw; // already a locale string
  if (at) return new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return "";
}

function clip(value: string, max = 120): string {
  return value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`;
}

export const normalizeJournalLogs: HistoryNormalizer = (items) =>
  items
    .map((it, index): HistoryEntry | null => {
      const content = str(it.content);
      const mood = str(it.mood);
      const type = str(it.type) || "Journal";
      if (!content && !mood) return null;
      const at = toAt(it.createdAt, it.id);
      return {
        id: `journal-${str(it.id) || index}`,
        at,
        whenLabel: whenLabel(it.createdAt, at),
        heading: `${type} Journal`,
        preview: clip(content || `Mood ${mood}/10`),
        body: content,
        meta: mood ? `Mood: ${mood}/10` : undefined,
      };
    })
    .filter((e): e is HistoryEntry => e !== null);

export const normalizeDreamLogs: HistoryNormalizer = (items) =>
  items
    .map((it, index): HistoryEntry | null => {
      const title = str(it.title);
      const summary = str(it.summary);
      const feeling = str(it.feeling);
      if (!title && !summary) return null;
      const at = toAt(it.createdAt, it.id);
      return {
        id: `dream-${str(it.id) || index}`,
        at,
        whenLabel: whenLabel(it.createdAt, at),
        heading: title || "Dream",
        preview: clip(summary || title),
        body: summary,
        meta: feeling || undefined,
      };
    })
    .filter((e): e is HistoryEntry => e !== null);

export const normalizeMeditationLogs: HistoryNormalizer = (items) =>
  items
    .map((it, index): HistoryEntry | null => {
      const truth = str(it.truth);
      const mood = str(it.mood);
      const legacy = [it.attentionFocus, it.automaticOrIntentional, it.pulledAway, it.broughtBack]
        .map(str)
        .filter(Boolean)
        .join("\n\n");
      const body = truth || legacy;
      if (!body && !mood) return null;
      const at = toAt(it.createdAt, it.id);
      return {
        id: `meditation-${str(it.id) || index}`,
        at,
        whenLabel: whenLabel(it.createdAt, at),
        heading: "Meditation",
        preview: clip(body || (mood ? `Mood: ${mood}` : "")),
        body,
        meta: mood ? `Mood: ${mood}` : undefined,
      };
    })
    .filter((e): e is HistoryEntry => e !== null);

export const normalizeReflectionLogs: HistoryNormalizer = (items) =>
  items.map((it, index): HistoryEntry => {
    const quest = str(it.quest);
    const gotInTheWay = str(it.whatGotInTheWay);
    const wasOff = str(it.whatWasOff);
    const smaller = str(it.smallerVersion);
    const parts: string[] = [];
    if (gotInTheWay) parts.push(`What got in the way: ${gotInTheWay}`);
    if (wasOff) parts.push(`Was the step too big: ${wasOff}`);
    if (smaller) parts.push(`Smaller next step: ${smaller}`);
    const at = toAt(it.createdAt, it.id);
    return {
      id: `reflection-${str(it.id) || index}`,
      at,
      whenLabel: whenLabel(it.createdAt, at),
      heading: "Reflection",
      preview: clip(gotInTheWay || smaller || quest || "Reflection"),
      body: parts.join("\n\n") || "Reflected on this quest.",
      meta: quest ? `On: ${quest}` : undefined,
    };
  });

export const normalizePreSleepLogs: HistoryNormalizer = (items) =>
  items
    .map((it, index): HistoryEntry | null => {
      const intention = str(it.intention);
      if (!intention) return null;
      const feeling = str(it.feeling);
      const support = Array.isArray(it.support) ? (it.support as unknown[]).map(str).filter(Boolean) : [];
      const metaParts = [feeling, support.join(", ")].filter(Boolean);
      const at = toAt(it.createdAt, it.id);
      return {
        id: `pre_sleep-${str(it.id) || index}`,
        at,
        whenLabel: whenLabel(it.createdAt, at),
        heading: "Pre-Sleep Intention",
        preview: clip(intention),
        body: intention,
        meta: metaParts.length ? metaParts.join(" · ") : undefined,
      };
    })
    .filter((e): e is HistoryEntry => e !== null);

function startOfWeekMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); // Monday
  return d.getTime();
}

export type HistoryWeek = { key: number; label: string; entries: HistoryEntry[] };

/** Groups entries into Mon–Sun weeks, newest week first, newest entry first within a week. */
export function groupHistoryByWeek(entries: HistoryEntry[]): HistoryWeek[] {
  const sorted = [...entries].sort((a, b) => b.at - a.at);
  const byWeek = new Map<number, HistoryEntry[]>();
  for (const entry of sorted) {
    const wk = startOfWeekMs(entry.at || Date.now());
    const list = byWeek.get(wk);
    if (list) list.push(entry);
    else byWeek.set(wk, [entry]);
  }
  return [...byWeek.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, list]) => ({
      key,
      label: `Week of ${new Date(key).toLocaleDateString([], { month: "short", day: "numeric" })}`,
      entries: list,
    }));
}
