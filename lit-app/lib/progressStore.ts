import AsyncStorage from "@react-native-async-storage/async-storage";

import { getSession, updateProfile, LOCAL_PROFILE_KEY } from "./auth";
import {
  ARRAY_MERGE_PROGRESS_KEYS,
  isSyncableProgressKey,
  LATEST_CHECKIN_KEY,
  PROGRESS_SYNC_META_KEY,
  SYNCABLE_PROGRESS_KEYS,
  type SyncableProgressKey,
} from "./storageKeys";
import { getDateKey } from "./scheduling";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

type SyncMeta = Record<string, string>;

type CloudProgressRow = {
  storage_key: string;
  payload: string;
  updated_at: string;
};

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let mergeInFlight: Promise<void> | null = null;

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toTimestamp(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function entryTimestamp(entry: Record<string, unknown>): number {
  return Math.max(
    toTimestamp(entry.createdAt),
    toTimestamp(entry.completedAt),
    toTimestamp(entry.missedAt),
    toTimestamp(entry.date),
    toTimestamp(entry.dateKey)
  );
}

function entryId(entry: Record<string, unknown>, index: number): string {
  if (typeof entry.id === "string" && entry.id.trim()) return entry.id;
  if (typeof entry.dateKey === "string" && typeof entry.title === "string") {
    return `${entry.dateKey}:${entry.title}`;
  }
  return `row-${index}-${entryTimestamp(entry)}`;
}

async function loadSyncMeta(): Promise<SyncMeta> {
  return parseJson<SyncMeta>(await AsyncStorage.getItem(PROGRESS_SYNC_META_KEY), {});
}

async function saveSyncMeta(meta: SyncMeta): Promise<void> {
  await AsyncStorage.setItem(PROGRESS_SYNC_META_KEY, JSON.stringify(meta));
}

async function getAuthenticatedUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const session = await getSession();
  return session?.user?.id ?? null;
}

function mergeJsonArrays(localRaw: string, cloudRaw: string): string {
  const local = parseJson<unknown[]>(localRaw, []);
  const cloud = parseJson<unknown[]>(cloudRaw, []);
  const merged = new Map<string, Record<string, unknown>>();

  const all = [...(Array.isArray(local) ? local : []), ...(Array.isArray(cloud) ? cloud : [])];
  all.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const id = entryId(row, index);
    const existing = merged.get(id);
    if (!existing || entryTimestamp(row) >= entryTimestamp(existing)) {
      merged.set(id, row);
    }
  });

  const values = Array.from(merged.values()).sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
  return JSON.stringify(values);
}

function toCheckinDay(raw: string): string | null {
  const parsed = parseJson<{ createdAt?: string } | null>(raw, null);
  if (!parsed?.createdAt) return null;
  const date = new Date(parsed.createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA");
}

function mergeLatestCheckIn(localRaw: string, cloudRaw: string): string {
  const today = getDateKey();
  const localDay = toCheckinDay(localRaw);
  const cloudDay = toCheckinDay(cloudRaw);
  const localAt = toTimestamp(parseJson<{ createdAt?: string }>(localRaw, {}).createdAt);
  const cloudAt = toTimestamp(parseJson<{ createdAt?: string }>(cloudRaw, {}).createdAt);

  if (localDay === today && cloudDay !== today) return localRaw;
  if (cloudDay === today && localDay !== today) return cloudRaw;
  if (localDay === today && cloudDay === today) {
    return localAt >= cloudAt ? localRaw : cloudRaw;
  }
  return localAt >= cloudAt ? localRaw : cloudRaw;
}

function mergePayload(
  key: SyncableProgressKey,
  localRaw: string,
  cloudRaw: string,
  localAt: number,
  cloudAt: number
): { payload: string; updatedAt: string } {
  if (ARRAY_MERGE_PROGRESS_KEYS.has(key)) {
    const payload = mergeJsonArrays(localRaw, cloudRaw);
    return { payload, updatedAt: new Date(Math.max(localAt, cloudAt, Date.now())).toISOString() };
  }

  if (key === LATEST_CHECKIN_KEY) {
    const payload = mergeLatestCheckIn(localRaw, cloudRaw);
    const chosenAt = payload === localRaw ? localAt : cloudAt;
    return { payload, updatedAt: new Date(Math.max(chosenAt, localAt, cloudAt)).toISOString() };
  }

  if (cloudAt > localAt) {
    return { payload: cloudRaw, updatedAt: new Date(cloudAt).toISOString() };
  }
  return { payload: localRaw, updatedAt: new Date(Math.max(localAt, Date.now())).toISOString() };
}

export function scheduleProgressPush(delayMs = 1500): void {
  if (!isSupabaseConfigured()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushAllProgressToCloud();
  }, delayMs);
}

export async function persistProgressKeys(updates: Record<string, string>): Promise<void> {
  const meta = await loadSyncMeta();
  const now = new Date().toISOString();

  for (const [key, value] of Object.entries(updates)) {
    await AsyncStorage.setItem(key, value);
    if (isSyncableProgressKey(key)) {
      meta[key] = now;
    }
  }

  await saveSyncMeta(meta);
  scheduleProgressPush();
}

export async function clearProgressKey(key: SyncableProgressKey): Promise<void> {
  await AsyncStorage.removeItem(key);
  const meta = await loadSyncMeta();
  delete meta[key];
  await saveSyncMeta(meta);

  try {
    const userId = await getAuthenticatedUserId();
    const supabase = getSupabaseClient();
    if (!userId || !supabase) return;
    await supabase.from("user_progress_data").delete().eq("user_id", userId).eq("storage_key", key);
  } catch (error) {
    console.warn("clearProgressKey error:", error);
  }
}

export async function saveProgressKey(key: SyncableProgressKey, value: string): Promise<void> {
  await persistProgressKeys({ [key]: value });
}

export async function pushAllProgressToCloud(): Promise<void> {
  try {
    const userId = await getAuthenticatedUserId();
    const supabase = getSupabaseClient();
    if (!userId || !supabase) return;

    const meta = await loadSyncMeta();
    const now = new Date().toISOString();
    const rows: {
      user_id: string;
      storage_key: string;
      payload: string;
      updated_at: string;
    }[] = [];

    for (const key of SYNCABLE_PROGRESS_KEYS) {
      const payload = await AsyncStorage.getItem(key);
      if (!payload) continue;
      rows.push({
        user_id: userId,
        storage_key: key,
        payload,
        updated_at: meta[key] ?? now,
      });
    }

    if (rows.length === 0) return;

    const { error } = await supabase.from("user_progress_data").upsert(rows, {
      onConflict: "user_id,storage_key",
    });

    if (error) {
      console.warn("pushAllProgressToCloud failed:", error.message);
      return;
    }
  } catch (error) {
    console.warn("pushAllProgressToCloud error:", error);
  }
}

export async function mergeProgressWithCloud(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  if (mergeInFlight) {
    await mergeInFlight;
    return;
  }

  mergeInFlight = (async () => {
    try {
      const userId = await getAuthenticatedUserId();
      const supabase = getSupabaseClient();
      if (!userId || !supabase) return;

      const { data, error } = await supabase
        .from("user_progress_data")
        .select("storage_key, payload, updated_at")
        .eq("user_id", userId);

      if (error) {
        console.warn("mergeProgressWithCloud fetch failed:", error.message);
        return;
      }

      const cloudRows = (data ?? []) as CloudProgressRow[];
      const cloudByKey = new Map(cloudRows.map((row) => [row.storage_key, row]));
      const meta = await loadSyncMeta();

      for (const key of SYNCABLE_PROGRESS_KEYS) {
        const cloud = cloudByKey.get(key);
        const localRaw = await AsyncStorage.getItem(key);
        const localAt = toTimestamp(meta[key]);

        if (cloud && !localRaw) {
          await AsyncStorage.setItem(key, cloud.payload);
          meta[key] = cloud.updated_at;
          continue;
        }

        if (cloud && localRaw) {
          const cloudAt = toTimestamp(cloud.updated_at);
          if (!isSyncableProgressKey(key)) continue;
          const merged = mergePayload(key, localRaw, cloud.payload, localAt, cloudAt);
          await AsyncStorage.setItem(key, merged.payload);
          meta[key] = merged.updatedAt;
          continue;
        }

        if (localRaw && !cloud) {
          meta[key] = meta[key] ?? new Date().toISOString();
        }
      }

      await saveSyncMeta(meta);

      const profileRaw = await AsyncStorage.getItem(LOCAL_PROFILE_KEY);
      const profile = parseJson<{ onboardingComplete?: boolean }>(profileRaw, {});
      if (profile.onboardingComplete) {
        void updateProfile({ onboarding_complete: true });
      }

      await pushAllProgressToCloud();
    } catch (error) {
      console.warn("mergeProgressWithCloud error:", error);
    } finally {
      mergeInFlight = null;
    }
  })();

  await mergeInFlight;
}
