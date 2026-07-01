import { LOCAL_PROFILE_KEY } from "./auth";
import {
  ACTIVE_TIMED_ITEM_KEY,
  COMPLETED_QUESTS_KEY,
  DAY_PLAN_KEY,
  MISSED_QUESTS_KEY,
  TODAY_PROGRESS_DATE_KEY,
  TOMORROW_QUEUE_KEY,
  USER_STATS_KEY,
} from "./questProgress";

/** Local metadata for last-write timestamps per synced storage key. */
export const PROGRESS_SYNC_META_KEY = "lit_progress_sync_meta";

/** Pointer to the most recent full local progress backup. */
export const LAST_PROGRESS_BACKUP_KEY = "lit_last_progress_backup";

/** Prefix for timestamped local progress backups (`lit_progress_backup_<iso>`). */
export const PROGRESS_BACKUP_PREFIX = "lit_progress_backup_";

/** Older keys still scanned during recovery. */
export const LEGACY_PROGRESS_KEYS = ["lit_morning_reflections", "lit_sleep_calendar"] as const;

export const LATEST_CHECKIN_KEY = "lit_latest_checkin";
export const CHECKIN_HISTORY_KEY = "lit_checkin_history";
export const JOURNAL_ENTRIES_KEY = "lit_journal_entries";
export const DREAM_JOURNAL_KEY = "lit_dream_journal";
export const PRE_SLEEP_INTENTIONS_KEY = "lit_pre_sleep_intentions";
export const LATEST_PRE_SLEEP_INTENTION_KEY = "lit_latest_pre_sleep_intention";
export const MORNING_INTENTION_REFLECTIONS_KEY = "lit_morning_intention_reflections";
export const AWARENESS_CHECKS_KEY = "lit_awareness_checks";
export const REFLECTIONS_KEY = "lit_reflections";
export const GOAL_FEEDBACK_LOG_KEY = "lit_goal_feedback_log";

/** AsyncStorage keys mirrored to the signed-in user's cloud profile. */
export const SYNCABLE_PROGRESS_KEYS = [
  LOCAL_PROFILE_KEY,
  LATEST_CHECKIN_KEY,
  CHECKIN_HISTORY_KEY,
  COMPLETED_QUESTS_KEY,
  TODAY_PROGRESS_DATE_KEY,
  MISSED_QUESTS_KEY,
  ACTIVE_TIMED_ITEM_KEY,
  DAY_PLAN_KEY,
  TOMORROW_QUEUE_KEY,
  USER_STATS_KEY,
  JOURNAL_ENTRIES_KEY,
  DREAM_JOURNAL_KEY,
  PRE_SLEEP_INTENTIONS_KEY,
  LATEST_PRE_SLEEP_INTENTION_KEY,
  MORNING_INTENTION_REFLECTIONS_KEY,
  AWARENESS_CHECKS_KEY,
  REFLECTIONS_KEY,
  GOAL_FEEDBACK_LOG_KEY,
] as const;

export type SyncableProgressKey = (typeof SYNCABLE_PROGRESS_KEYS)[number];

export const ARRAY_MERGE_PROGRESS_KEYS = new Set<SyncableProgressKey>([
  CHECKIN_HISTORY_KEY,
  COMPLETED_QUESTS_KEY,
  MISSED_QUESTS_KEY,
  JOURNAL_ENTRIES_KEY,
  DREAM_JOURNAL_KEY,
  PRE_SLEEP_INTENTIONS_KEY,
  MORNING_INTENTION_REFLECTIONS_KEY,
  AWARENESS_CHECKS_KEY,
  REFLECTIONS_KEY,
  GOAL_FEEDBACK_LOG_KEY,
]);

export function isSyncableProgressKey(key: string): key is SyncableProgressKey {
  return (SYNCABLE_PROGRESS_KEYS as readonly string[]).includes(key);
}

/** All keys scanned for backup/recovery (current + legacy). */
export const ALL_SCANNABLE_PROGRESS_KEYS = [
  ...SYNCABLE_PROGRESS_KEYS,
  ...LEGACY_PROGRESS_KEYS,
] as const;

export {
  ACTIVE_TIMED_ITEM_KEY,
  COMPLETED_QUESTS_KEY,
  DAY_PLAN_KEY,
  MISSED_QUESTS_KEY,
  TODAY_PROGRESS_DATE_KEY,
  TOMORROW_QUEUE_KEY,
  USER_STATS_KEY,
} from "./questProgress";
