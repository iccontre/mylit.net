import AsyncStorage from "@react-native-async-storage/async-storage";

import { persistProgressKeys } from "./progressStore";
import { USER_RHYTHM_PROFILE_KEY } from "./storageKeys";
import type { UserRhythmProfile } from "./agentTypes";

// Canonical wake/sleep rhythm profile — ONE source of truth, seeded by onboarding and kept in
// sync by Sleep Guide (see app/sleep-calendar.tsx's saveSleepGuide) so the two never diverge.
// Consumed by quest-generation timing, checklist/weekly-habit defaults, and Luna's sleep
// observations. Mirrors the exact loadUserLifeProfile/saveUserLifeProfile pattern in
// lib/mylitAgents.ts — same object-merge-safe storage discipline, no parallel store.

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export async function loadUserRhythmProfile(): Promise<UserRhythmProfile | null> {
  return readJson<UserRhythmProfile | null>(USER_RHYTHM_PROFILE_KEY, null);
}

/** Shallow-merges into the existing profile — never wipes fields the caller didn't pass. Always
 *  stamps timezone fresh from the device (it can legitimately change between saves) and bumps
 *  updatedAt so cross-device merges (see OBJECT_MERGE_PROGRESS_KEYS) prefer the newest edit. */
export async function saveUserRhythmProfile(
  partial: Partial<Pick<UserRhythmProfile, "typicalWakeTime" | "typicalSleepTime" | "preferredRoutineStart">>
): Promise<UserRhythmProfile> {
  const current = await loadUserRhythmProfile();
  const next: UserRhythmProfile = {
    typicalWakeTime: partial.typicalWakeTime ?? current?.typicalWakeTime ?? "8:00 AM",
    typicalSleepTime: partial.typicalSleepTime ?? current?.typicalSleepTime ?? "11:00 PM",
    preferredRoutineStart: partial.preferredRoutineStart ?? current?.preferredRoutineStart,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    updatedAt: new Date().toISOString(),
  };
  await persistProgressKeys({ [USER_RHYTHM_PROFILE_KEY]: JSON.stringify(next) });
  return next;
}
