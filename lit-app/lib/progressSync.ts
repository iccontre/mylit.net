import AsyncStorage from "@react-native-async-storage/async-storage";

import { getSession } from "./auth";
import {
  COMPLETED_QUESTS_KEY,
  DAY_PLAN_KEY,
  MISSED_QUESTS_KEY,
  TOMORROW_QUEUE_KEY,
  USER_STATS_KEY,
  type CompletionEntry,
  type HomeQuestItem,
  type MissedEntry,
} from "./questProgress";
import { persistProgressKeys } from "./progressStore";
import { getDateKey } from "./scheduling";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

type QuestEventStatus = "scheduled" | "started" | "completed" | "missed";

type ScheduledItemInput = {
  local_id: string;
  title: string;
  source?: string | null;
  kind?: string | null;
  steps?: number;
  duration_minutes?: number | null;
  scheduled_for?: string | null;
  scheduled_time?: string | null;
  weekdays?: string[] | null;
  status?: string;
};

type DailySnapshotInput = {
  date?: string;
  energy_score?: number | null;
  mode?: string | null;
  sleep_hours?: number | null;
  mood_score?: number | null;
  stress_score?: number | null;
  total_steps?: number;
};

async function getAuthenticatedUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const session = await getSession();
  return session?.user?.id ?? null;
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function upsertQuestEvent(
  localId: string,
  patch: {
    title: string;
    source?: string | null;
    kind?: string | null;
    steps?: number;
    duration_minutes?: number | null;
    status: QuestEventStatus;
    started_at?: string | null;
    completed_at?: string | null;
    missed_at?: string | null;
  }
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const userId = await getAuthenticatedUserId();
    if (!supabase || !userId || !localId) return;

    const { error } = await supabase.from("quest_events").upsert(
      {
        user_id: userId,
        local_id: localId,
        title: patch.title,
        source: patch.source ?? null,
        kind: patch.kind ?? null,
        steps: patch.steps ?? 0,
        duration_minutes: patch.duration_minutes ?? null,
        status: patch.status,
        started_at: patch.started_at ?? null,
        completed_at: patch.completed_at ?? null,
        missed_at: patch.missed_at ?? null,
      },
      { onConflict: "user_id,local_id" }
    );

    if (error) {
      console.warn("upsertQuestEvent failed:", error.message);
    }
  } catch (error) {
    console.warn("upsertQuestEvent error:", error);
  }
}

async function upsertScheduledItem(item: ScheduledItemInput): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const userId = await getAuthenticatedUserId();
    if (!supabase || !userId || !item.local_id) return;

    const { error } = await supabase.from("scheduled_items").upsert(
      {
        user_id: userId,
        local_id: item.local_id,
        title: item.title,
        source: item.source ?? null,
        kind: item.kind ?? null,
        steps: item.steps ?? 0,
        duration_minutes: item.duration_minutes ?? null,
        scheduled_for: item.scheduled_for ?? null,
        scheduled_time: item.scheduled_time ?? null,
        weekdays: item.weekdays ?? null,
        status: item.status ?? "scheduled",
      },
      { onConflict: "user_id,local_id" }
    );

    if (error) {
      console.warn("upsertScheduledItem failed:", error.message);
    }
  } catch (error) {
    console.warn("upsertScheduledItem error:", error);
  }
}

export async function syncQuestStarted(item: HomeQuestItem): Promise<void> {
  const now = new Date().toISOString();
  await upsertQuestEvent(item.id, {
    title: item.title,
    source: item.source,
    kind: item.kind,
    steps: item.steps,
    duration_minutes: item.durationMinutes,
    status: "started",
    started_at: now,
  });
}

export async function syncQuestCompleted(item: HomeQuestItem): Promise<void> {
  const now = new Date().toISOString();
  await upsertQuestEvent(item.id, {
    title: item.title,
    source: item.source,
    kind: item.kind,
    steps: item.steps,
    duration_minutes: item.durationMinutes,
    status: "completed",
    completed_at: now,
  });
}

export async function syncQuestMissed(item: HomeQuestItem): Promise<void> {
  const now = new Date().toISOString();
  await upsertQuestEvent(item.id, {
    title: item.title,
    source: item.source,
    kind: item.kind,
    steps: 0,
    duration_minutes: item.durationMinutes,
    status: "missed",
    missed_at: now,
  });
}

export async function syncCompletedQuest(entry: CompletionEntry): Promise<void> {
  await upsertQuestEvent(entry.id, {
    title: entry.title,
    source: entry.source,
    kind: "progress",
    steps: entry.steps,
    duration_minutes: null,
    status: "completed",
    completed_at: entry.completedAt,
  });
}

export async function syncMissedQuest(entry: MissedEntry): Promise<void> {
  await upsertQuestEvent(entry.id, {
    title: entry.title,
    source: "Quest",
    kind: "progress",
    steps: 0,
    duration_minutes: null,
    status: "missed",
    missed_at: entry.missedAt,
  });
}

export async function syncScheduledItems(items: ScheduledItemInput[]): Promise<void> {
  for (const item of items) {
    await upsertScheduledItem(item);
  }
}

export async function syncDayPlanScheduledItems(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DAY_PLAN_KEY);
    const plan = parseJson<Record<string, unknown> | null>(raw, null);
    if (!plan) return;

    const todayKey = getDateKey();
    const items: ScheduledItemInput[] = [];

    const todayQuest = plan.todayQuest as Record<string, unknown> | undefined;
    if (todayQuest?.title && String(todayQuest.title).trim()) {
      const localId = String(todayQuest.id ?? `today-quest-${todayKey}`);
      items.push({
        local_id: localId,
        title: String(todayQuest.title),
        source: "Today's Quest",
        kind: typeof todayQuest.kind === "string" ? todayQuest.kind : null,
        steps: safeNumber(todayQuest.steps),
        duration_minutes: safeNumber(todayQuest.durationMinutes, 30),
        scheduled_for: todayKey,
        scheduled_time: typeof todayQuest.startTime === "string" ? todayQuest.startTime : null,
        status: typeof todayQuest.status === "string" ? todayQuest.status : "scheduled",
      });
    }

    const weekdayChecklists = plan.weekdayChecklists as Record<string, unknown[]> | undefined;
    if (weekdayChecklists) {
      for (const [weekday, checklist] of Object.entries(weekdayChecklists)) {
        if (!Array.isArray(checklist)) continue;
        for (const entry of checklist) {
          const row = entry as Record<string, unknown>;
          const title = String(row.text ?? row.title ?? "").trim();
          if (!title) continue;
          const localId = String(row.id ?? `checklist-${weekday}-${title.slice(0, 24)}`);
          items.push({
            local_id: localId,
            title,
            source: "Checklist",
            kind: typeof row.kind === "string" ? row.kind : null,
            steps: safeNumber(row.steps),
            duration_minutes: safeNumber(row.durationMinutes, 30),
            scheduled_for: todayKey,
            scheduled_time: typeof row.startTime === "string" ? row.startTime : typeof row.time === "string" ? row.time : null,
            weekdays: [weekday],
            status: row.checked ? "completed" : typeof row.status === "string" ? row.status : "scheduled",
          });
        }
      }
    }

    await syncScheduledItems(items);
  } catch (error) {
    console.warn("syncDayPlanScheduledItems error:", error);
  }
}

/**
 * Marks (or unmarks) a Day Plan checklist item checked directly in storage — checklist
 * items complete like a checkbox, not a timed quest. Shared so Day Plan, Calendar, and
 * the Home Quest Board all agree on the same completed state (no separate completion path).
 */
export async function setChecklistItemChecked(itemId: string, checked: boolean): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DAY_PLAN_KEY);
    const plan = parseJson<Record<string, unknown> | null>(raw, null);
    const weekdayChecklists = plan?.weekdayChecklists as Record<string, unknown[]> | undefined;
    if (!plan || !weekdayChecklists) return false;

    let found = false;
    const nextLists: Record<string, unknown[]> = {};
    for (const [weekday, checklist] of Object.entries(weekdayChecklists)) {
      if (!Array.isArray(checklist)) continue;
      nextLists[weekday] = checklist.map((entry) => {
        const row = entry as Record<string, unknown>;
        if (String(row.id ?? "") !== itemId) return row;
        found = true;
        return { ...row, checked, status: checked ? "completed" : "scheduled" };
      });
    }
    if (!found) return false;

    const nextPlan = { ...plan, weekdayChecklists: nextLists };
    await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(nextPlan) });
    void syncDayPlanScheduledItems();
    return true;
  } catch (error) {
    console.warn("setChecklistItemChecked error:", error);
    return false;
  }
}

export async function syncQuickThoughtItems(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(TOMORROW_QUEUE_KEY);
    const queue = parseJson<unknown[]>(raw, []);
    if (!Array.isArray(queue)) return;

    const items: ScheduledItemInput[] = [];
    for (const entry of queue) {
      const row = entry as Record<string, unknown>;
      const title = String(row.text ?? row.title ?? row.task ?? "").trim();
      if (!title) continue;
      const localId = String(row.id ?? `quick-${title.slice(0, 24)}`);
      items.push({
        local_id: localId,
        title,
        source: "Quick Thought",
        kind: typeof row.classification === "string" ? row.classification : typeof row.kind === "string" ? row.kind : null,
        steps: safeNumber(row.steps),
        duration_minutes: safeNumber(row.durationMinutes, 30),
        scheduled_for: typeof row.date === "string" ? row.date : typeof row.dateKey === "string" ? row.dateKey : null,
        scheduled_time: typeof row.time === "string" ? row.time : typeof row.startTime === "string" ? row.startTime : null,
        status: typeof row.status === "string" ? row.status : "scheduled",
      });
    }

    await syncScheduledItems(items);
  } catch (error) {
    console.warn("syncQuickThoughtItems error:", error);
  }
}

export async function syncDailySnapshot(input: DailySnapshotInput = {}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const userId = await getAuthenticatedUserId();
    if (!supabase || !userId) return;

    const date = input.date ?? getDateKey();
    const statsRaw = await AsyncStorage.getItem(USER_STATS_KEY);
    const stats = parseJson<{ totalSteps?: number } | null>(statsRaw, null);

    const { error } = await supabase.from("daily_snapshots").upsert(
      {
        user_id: userId,
        date,
        energy_score: input.energy_score ?? null,
        mode: input.mode ?? null,
        sleep_hours: input.sleep_hours ?? null,
        mood_score: input.mood_score ?? null,
        stress_score: input.stress_score ?? null,
        total_steps: input.total_steps ?? safeNumber(stats?.totalSteps),
      },
      { onConflict: "user_id,date" }
    );

    if (error) {
      console.warn("syncDailySnapshot failed:", error.message);
    }
  } catch (error) {
    console.warn("syncDailySnapshot error:", error);
  }
}

export async function syncLocalQuestHistory(): Promise<void> {
  try {
    const completed = parseJson<CompletionEntry[]>(await AsyncStorage.getItem(COMPLETED_QUESTS_KEY), []);
    const missed = parseJson<MissedEntry[]>(await AsyncStorage.getItem(MISSED_QUESTS_KEY), []);

    for (const entry of completed) {
      await syncCompletedQuest(entry);
    }
    for (const entry of missed) {
      await syncMissedQuest(entry);
    }
  } catch (error) {
    console.warn("syncLocalQuestHistory error:", error);
  }
}
