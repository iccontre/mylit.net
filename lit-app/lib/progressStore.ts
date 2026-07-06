import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import { getSession, updateProfile, LOCAL_PROFILE_KEY, hasCompletedPathProfile } from "./auth";
import {
  ACTIVE_TIMED_ITEM_KEY,
  ALL_SCANNABLE_PROGRESS_KEYS,
  ARRAY_MERGE_PROGRESS_KEYS,
  CHECKIN_HISTORY_KEY,
  COMPLETED_QUESTS_KEY,
  isSyncableProgressKey,
  LAST_PROGRESS_BACKUP_KEY,
  LATEST_CHECKIN_KEY,
  PROGRESS_BACKUP_PREFIX,
  PROGRESS_SYNC_META_KEY,
  SYNCABLE_PROGRESS_KEYS,
  USER_STATS_KEY,
  TOTAL_STEPS_FLOOR_KEY,
  type SyncableProgressKey,
  DAY_PLAN_KEY,
  MISSED_QUESTS_KEY,
  WAITING_ROOM_BOOSTS_KEY,
  USER_LIFE_PROFILE_KEY,
  GUIDE_MEMORY_KEY,
} from "./storageKeys";
import { getDateKey } from "./scheduling";
import { sanitizeDayPlanChecklists } from "./dayPlanChecklist";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

type SyncMeta = Record<string, string>;

type CloudProgressRow = {
  storage_key: string;
  payload: string;
  updated_at: string;
};

export type ProgressBackup = {
  timestamp: string;
  userId: string | null;
  appVersion: string | null;
  keys: Record<string, string>;
};

export type ProgressSummary = {
  keysFound: number;
  totalSteps: number;
  completedQuestCount: number;
  missedQuestCount: number;
  journalCount: number;
  dreamCount: number;
  reflectionCount: number;
  meditationCount: number;
  checkInHistoryCount: number;
  latestCheckInDate: string | null;
  lastBackupAt: string | null;
};

export type MergeResult = {
  ok: boolean;
  message: string;
  localKeys: number;
  cloudKeys: number;
  backupKey: string | null;
};

const OBJECT_MERGE_PROGRESS_KEYS = new Set<SyncableProgressKey>([
  LOCAL_PROFILE_KEY,
  DAY_PLAN_KEY,
  WAITING_ROOM_BOOSTS_KEY,
  // Deep-merge-prefer-non-empty is exactly the "merge new fields into existing profile
  // safely, never overwrite non-empty local with empty cloud" rule these two new keys need.
  USER_LIFE_PROFILE_KEY,
  GUIDE_MEMORY_KEY,
]);

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let mergeInFlight: Promise<MergeResult> | null = null;

function debugLog(...args: unknown[]): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[progressSync]", ...args);
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function toTimestamp(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number") return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return true;
    return keys.every((key) => isEmptyValue((value as Record<string, unknown>)[key]));
  }
  return false;
}

/** True when a stored payload carries no meaningful progress. */
export function isPayloadEmpty(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return true;
  const trimmed = raw.trim();
  if (trimmed === "null" || trimmed === "undefined") return true;
  try {
    const parsed = JSON.parse(trimmed);
    return isEmptyValue(parsed);
  } catch {
    return trimmed.length === 0;
  }
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

function countArrayPayload(raw: string | null): number {
  if (!raw || isPayloadEmpty(raw)) return 0;
  const parsed = parseJson<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed.length : 0;
}

export async function collectLocalProgressKeys(): Promise<Record<string, string>> {
  const keys: Record<string, string> = {};
  for (const key of ALL_SCANNABLE_PROGRESS_KEYS) {
    const value = await AsyncStorage.getItem(key);
    if (value && !isPayloadEmpty(value)) {
      keys[key] = value;
    }
  }
  return keys;
}

export async function getLocalProgressSummary(): Promise<ProgressSummary> {
  const keys = await collectLocalProgressKeys();
  const stats = parseJson<{ totalSteps?: number }>(keys[USER_STATS_KEY] ?? null, {});
  const latestCheckIn = parseJson<{ createdAt?: string } | null>(keys[LATEST_CHECKIN_KEY] ?? null, null);
  const lastBackup = parseJson<ProgressBackup>(
    await AsyncStorage.getItem(LAST_PROGRESS_BACKUP_KEY),
    null as unknown as ProgressBackup
  );

  let latestCheckInDate: string | null = null;
  if (latestCheckIn?.createdAt) {
    const date = new Date(latestCheckIn.createdAt);
    if (!Number.isNaN(date.getTime())) {
      latestCheckInDate = date.toLocaleDateString("en-CA");
    }
  }

  return {
    keysFound: Object.keys(keys).length,
    totalSteps: safeNumber(stats.totalSteps),
    completedQuestCount: countArrayPayload(keys[COMPLETED_QUESTS_KEY] ?? null),
    missedQuestCount: countArrayPayload(keys[MISSED_QUESTS_KEY] ?? null),
    journalCount: countArrayPayload(keys["lit_journal_entries"] ?? null),
    dreamCount: countArrayPayload(keys["lit_dream_journal"] ?? null),
    reflectionCount: countArrayPayload(keys["lit_reflections"] ?? null),
    meditationCount: countArrayPayload(keys["lit_awareness_checks"] ?? null),
    checkInHistoryCount: countArrayPayload(keys[CHECKIN_HISTORY_KEY] ?? null),
    latestCheckInDate,
    lastBackupAt: lastBackup?.timestamp ?? null,
  };
}

export async function getLocalProgressBackupSummary(): Promise<ProgressSummary> {
  return getLocalProgressSummary();
}

export async function backupLocalProgressNow(): Promise<string> {
  const timestamp = new Date().toISOString();
  const userId = await getAuthenticatedUserId();
  const keys = await collectLocalProgressKeys();
  const backup: ProgressBackup = {
    timestamp,
    userId,
    appVersion: Constants.expoConfig?.version ?? null,
    keys,
  };
  const backupKey = `${PROGRESS_BACKUP_PREFIX}${timestamp}`;
  const serialized = JSON.stringify(backup);
  await AsyncStorage.setItem(backupKey, serialized);
  await AsyncStorage.setItem(LAST_PROGRESS_BACKUP_KEY, serialized);
  debugLog("backup created", backupKey, Object.keys(keys).length, "keys");
  return backupKey;
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
    if (!existing) {
      merged.set(id, row);
      return;
    }
    const existingCompleted = Boolean(existing.completedAt || existing.status === "completed");
    const rowCompleted = Boolean(row.completedAt || row.status === "completed");
    if (rowCompleted && !existingCompleted) {
      merged.set(id, row);
      return;
    }
    if (existingCompleted && !rowCompleted) {
      return;
    }
    if (entryTimestamp(row) >= entryTimestamp(existing)) {
      merged.set(id, row);
    }
  });

  const values = Array.from(merged.values()).sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
  return JSON.stringify(values);
}

function mergeDeepPreferNonEmpty(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...cloud };
  for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const localValue = local[key];
    const cloudValue = cloud[key];
    if (isEmptyValue(cloudValue) && !isEmptyValue(localValue)) {
      out[key] = localValue;
    } else if (isEmptyValue(localValue) && !isEmptyValue(cloudValue)) {
      out[key] = cloudValue;
    } else if (Array.isArray(localValue) && Array.isArray(cloudValue)) {
      out[key] = JSON.parse(mergeJsonArrays(JSON.stringify(localValue), JSON.stringify(cloudValue)));
    } else if (
      localValue &&
      cloudValue &&
      typeof localValue === "object" &&
      typeof cloudValue === "object" &&
      !Array.isArray(localValue) &&
      !Array.isArray(cloudValue)
    ) {
      out[key] = mergeDeepPreferNonEmpty(
        localValue as Record<string, unknown>,
        cloudValue as Record<string, unknown>
      );
    } else if (!isEmptyValue(localValue)) {
      out[key] = localValue;
    }
  }
  return out;
}

function mergeUserStats(localRaw: string, cloudRaw: string): string {
  const local = parseJson<{ totalSteps?: number; rankBonusesAwarded?: number[] }>(localRaw, {});
  const cloud = parseJson<{ totalSteps?: number; rankBonusesAwarded?: number[] }>(cloudRaw, {});
  const totalSteps = Math.max(safeNumber(local.totalSteps), safeNumber(cloud.totalSteps));
  const bonusSet = new Set<number>([
    ...(Array.isArray(local.rankBonusesAwarded) ? local.rankBonusesAwarded : []),
    ...(Array.isArray(cloud.rankBonusesAwarded) ? cloud.rankBonusesAwarded : []),
  ]);
  return JSON.stringify({
    ...cloud,
    ...local,
    totalSteps,
    rankBonusesAwarded: Array.from(bonusSet).sort((a, b) => a - b),
  });
}

function toCheckinDay(raw: string): string | null {
  const parsed = parseJson<{ createdAt?: string } | null>(raw, null);
  if (!parsed?.createdAt) return null;
  const date = new Date(parsed.createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA");
}

function mergeLatestCheckIn(localRaw: string, cloudRaw: string): string {
  if (isPayloadEmpty(cloudRaw)) return localRaw;
  if (isPayloadEmpty(localRaw)) return cloudRaw;

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

/**
 * Picks ONE side's whole active-timer object rather than merging fields (Frankensteining
 * an id from one device with an endsAt from another would restore a broken timer). Whichever
 * side is non-empty wins outright; if both have an active timer, the one started more
 * recently wins — an older still-active timer on another device is assumed superseded.
 */
function mergeActiveTimedItem(localRaw: string, cloudRaw: string): string {
  if (isPayloadEmpty(cloudRaw)) return localRaw;
  if (isPayloadEmpty(localRaw)) return cloudRaw;

  const local = parseJson<{ startedAt?: number }>(localRaw, {});
  const cloud = parseJson<{ startedAt?: number }>(cloudRaw, {});
  return safeNumber(cloud.startedAt) > safeNumber(local.startedAt) ? cloudRaw : localRaw;
}

function mergePayload(
  key: SyncableProgressKey,
  localRaw: string,
  cloudRaw: string,
  localAt: number,
  cloudAt: number
): { payload: string; updatedAt: string } {
  if (isPayloadEmpty(cloudRaw) && !isPayloadEmpty(localRaw)) {
    return { payload: localRaw, updatedAt: new Date(Math.max(localAt, Date.now())).toISOString() };
  }
  if (isPayloadEmpty(localRaw) && !isPayloadEmpty(cloudRaw)) {
    return { payload: cloudRaw, updatedAt: new Date(Math.max(cloudAt, Date.now())).toISOString() };
  }
  if (isPayloadEmpty(localRaw) && isPayloadEmpty(cloudRaw)) {
    return { payload: localRaw, updatedAt: new Date().toISOString() };
  }

  if (key === USER_STATS_KEY) {
    const payload = mergeUserStats(localRaw, cloudRaw);
    return { payload, updatedAt: new Date(Math.max(localAt, cloudAt, Date.now())).toISOString() };
  }

  if (key === TOTAL_STEPS_FLOOR_KEY) {
    // A plain monotonic number — always keep the higher of the two sides.
    const payload = String(Math.max(safeNumber(parseJson(localRaw, 0)), safeNumber(parseJson(cloudRaw, 0))));
    return { payload, updatedAt: new Date(Math.max(localAt, cloudAt, Date.now())).toISOString() };
  }

  if (ARRAY_MERGE_PROGRESS_KEYS.has(key)) {
    const payload = mergeJsonArrays(localRaw, cloudRaw);
    return { payload, updatedAt: new Date(Math.max(localAt, cloudAt, Date.now())).toISOString() };
  }

  if (key === LATEST_CHECKIN_KEY) {
    const payload = mergeLatestCheckIn(localRaw, cloudRaw);
    const chosenAt = payload === localRaw ? localAt : cloudAt;
    return { payload, updatedAt: new Date(Math.max(chosenAt, localAt, cloudAt)).toISOString() };
  }

  if (key === ACTIVE_TIMED_ITEM_KEY) {
    const payload = mergeActiveTimedItem(localRaw, cloudRaw);
    const chosenAt = payload === localRaw ? localAt : cloudAt;
    return { payload, updatedAt: new Date(Math.max(chosenAt, localAt, cloudAt)).toISOString() };
  }

  if (OBJECT_MERGE_PROGRESS_KEYS.has(key)) {
    const payload = JSON.stringify(
      mergeDeepPreferNonEmpty(
        parseJson<Record<string, unknown>>(localRaw, {}),
        parseJson<Record<string, unknown>>(cloudRaw, {})
      )
    );
    return { payload, updatedAt: new Date(Math.max(localAt, cloudAt, Date.now())).toISOString() };
  }

  if (cloudAt > localAt) {
    return { payload: cloudRaw, updatedAt: new Date(cloudAt).toISOString() };
  }
  return { payload: localRaw, updatedAt: new Date(Math.max(localAt, Date.now())).toISOString() };
}

function countMeaningfulCloudKeys(cloudByKey: Map<string, CloudProgressRow>): number {
  let count = 0;
  for (const key of SYNCABLE_PROGRESS_KEYS) {
    const cloud = cloudByKey.get(key);
    if (cloud && !isPayloadEmpty(cloud.payload)) count += 1;
  }
  return count;
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
    if (isSyncableProgressKey(key) && !isPayloadEmpty(value)) {
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

export async function forceUploadLocalProgressToCloud(): Promise<number> {
  try {
    const userId = await getAuthenticatedUserId();
    const supabase = getSupabaseClient();
    if (!userId || !supabase) return 0;

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
      if (!payload || isPayloadEmpty(payload)) continue;
      rows.push({
        user_id: userId,
        storage_key: key,
        payload,
        updated_at: meta[key] ?? now,
      });
    }

    if (rows.length === 0) return 0;

    const { error } = await supabase.from("user_progress_data").upsert(rows, {
      onConflict: "user_id,storage_key",
    });

    if (error) {
      console.warn("forceUploadLocalProgressToCloud failed:", error.message);
      return 0;
    }

    debugLog("force upload", rows.length, "keys");
    return rows.length;
  } catch (error) {
    console.warn("forceUploadLocalProgressToCloud error:", error);
    return 0;
  }
}

export async function pushAllProgressToCloud(): Promise<void> {
  await forceUploadLocalProgressToCloud();
}

export async function mergeCloudIntoLocalSafely(): Promise<MergeResult> {
  if (!isSupabaseConfigured()) {
    return { ok: true, message: "Offline mode — local progress kept.", localKeys: 0, cloudKeys: 0, backupKey: null };
  }

  if (mergeInFlight) {
    return mergeInFlight;
  }

  mergeInFlight = (async (): Promise<MergeResult> => {
    const localKeys = await collectLocalProgressKeys();
    let backupKey: string | null = null;

    try {
      backupKey = await backupLocalProgressNow();
      const userId = await getAuthenticatedUserId();
      const supabase = getSupabaseClient();
      if (!userId || !supabase) {
        return {
          ok: true,
          message: "Not signed in — local progress kept.",
          localKeys: Object.keys(localKeys).length,
          cloudKeys: 0,
          backupKey,
        };
      }

      const { data, error } = await supabase
        .from("user_progress_data")
        .select("storage_key, payload, updated_at")
        .eq("user_id", userId);

      if (error) {
        console.warn("mergeCloudIntoLocalSafely fetch failed:", error.message);
        return {
          ok: false,
          message: "Cloud sync unavailable — local progress kept.",
          localKeys: Object.keys(localKeys).length,
          cloudKeys: 0,
          backupKey,
        };
      }

      const cloudRows = (data ?? []) as CloudProgressRow[];
      const cloudByKey = new Map(cloudRows.map((row) => [row.storage_key, row]));
      const meaningfulCloudKeys = countMeaningfulCloudKeys(cloudByKey);
      const meaningfulLocalKeys = Object.keys(localKeys).length;

      debugLog("merge start", { meaningfulLocalKeys, meaningfulCloudKeys });

      if (meaningfulCloudKeys === 0 && meaningfulLocalKeys > 0) {
        await forceUploadLocalProgressToCloud();
        return {
          ok: true,
          message: "Local progress uploaded to your account.",
          localKeys: meaningfulLocalKeys,
          cloudKeys: 0,
          backupKey,
        };
      }

      const meta = await loadSyncMeta();

      for (const key of SYNCABLE_PROGRESS_KEYS) {
        const cloud = cloudByKey.get(key);
        const localRaw = await AsyncStorage.getItem(key);
        const localAt = toTimestamp(meta[key]);

        if (!cloud || isPayloadEmpty(cloud.payload)) {
          if (localRaw && !isPayloadEmpty(localRaw)) {
            meta[key] = meta[key] ?? new Date().toISOString();
          }
          continue;
        }

        if (!localRaw || isPayloadEmpty(localRaw)) {
          let payload = cloud.payload;
          if (key === DAY_PLAN_KEY) {
            try {
              const plan = JSON.parse(cloud.payload) as { weekdayChecklists?: Record<string, unknown[]> };
              const cleaned = sanitizeDayPlanChecklists(plan.weekdayChecklists);
              payload = JSON.stringify({ ...plan, weekdayChecklists: cleaned });
            } catch {
              payload = cloud.payload;
            }
          }
          await AsyncStorage.setItem(key, payload);
          meta[key] = cloud.updated_at;
          debugLog("pull cloud → local", key);
          continue;
        }

        const cloudAt = toTimestamp(cloud.updated_at);
        const merged = mergePayload(key, localRaw, cloud.payload, localAt, cloudAt);
        await AsyncStorage.setItem(key, merged.payload);
        meta[key] = merged.updatedAt;
        debugLog("merged", key);
      }

      await saveSyncMeta(meta);

      const profileRaw = await AsyncStorage.getItem(LOCAL_PROFILE_KEY);
      const profile = parseJson<{ onboardingComplete?: boolean }>(profileRaw, {});
      if (profile.onboardingComplete || (await hasCompletedPathProfile())) {
        await updateProfile({ onboarding_complete: true });
      }

      await forceUploadLocalProgressToCloud();

      return {
        ok: true,
        message: "Progress synced safely.",
        localKeys: meaningfulLocalKeys,
        cloudKeys: meaningfulCloudKeys,
        backupKey,
      };
    } catch (error) {
      console.warn("mergeCloudIntoLocalSafely error:", error);
      return {
        ok: false,
        message: "Sync failed — local progress kept.",
        localKeys: Object.keys(localKeys).length,
        cloudKeys: 0,
        backupKey,
      };
    } finally {
      mergeInFlight = null;
    }
  })();

  return mergeInFlight;
}

/** @deprecated Use mergeCloudIntoLocalSafely */
export async function mergeProgressWithCloud(): Promise<MergeResult> {
  return mergeCloudIntoLocalSafely();
}

export async function recoverLocalProgressToCloud(): Promise<{ ok: boolean; message: string }> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { ok: false, message: "Sign in first to save progress to your account." };
  }

  await backupLocalProgressNow();
  const uploaded = await forceUploadLocalProgressToCloud();
  const mergeResult = await mergeCloudIntoLocalSafely();

  if (uploaded === 0 && mergeResult.localKeys === 0) {
    return { ok: false, message: "No saved progress found on this device." };
  }

  return {
    ok: true,
    message: "Progress recovered and saved to your account.",
  };
}
