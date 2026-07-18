import { LOCAL_PROFILE_KEY } from "./auth";

// Core progress storage keys live here (a near-leaf module) so questProgress.ts can
// import them without forming the questProgress -> progressStore -> storageKeys ->
// questProgress require cycle, which previously crashed module init with a TDZ error.
export const COMPLETED_QUESTS_KEY = "lit_completed_quests";
export const TODAY_PROGRESS_DATE_KEY = "lit_today_progress_date";
export const MISSED_QUESTS_KEY = "mylit_missed_quests";
export const ACTIVE_TIMED_ITEM_KEY = "mylit_active_timed_item";
export const DAY_PLAN_KEY = "lit_day_plan";
export const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
export const USER_STATS_KEY = "lit_user_stats";
/**
 * Independent, monotonic "highest total earned steps ever computed" high-water mark.
 * Deliberately NEVER fed back into computeTotalEarnedSteps's own sum (that would double
 * count the live sources it re-derives from every call) — it exists purely so the
 * DISPLAYED/ranked total can be clamped to never drop, even if a live source (today's
 * completions resetting for a new day, an edited item, a stale cloud pull) temporarily
 * computes lower. See reconcileMonotonicTotalSteps in questProgress.ts.
 */
export const TOTAL_STEPS_FLOOR_KEY = "lit_total_steps_floor";
/**
 * Per-quest-day earned-steps ledger: { [questDayKey]: finalStepsEarnedThatDay }, plus a
 * one-time "__legacy__" carry-forward entry seeded from the old TOTAL_STEPS_FLOOR_KEY value
 * so existing users never lose steps already earned before this ledger existed. The lifetime
 * total is the sum of every entry. Each entry only ever ratchets up (see the dedicated
 * max-per-day merge rule in progressStore.ts), so unlike a single same-day snapshot this
 * actually accumulates across days instead of freezing at one historical peak. See
 * reconcileMonotonicTotalSteps in questProgress.ts.
 */
export const DAILY_STEPS_LOG_KEY = "lit_daily_steps_log";

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
/** In-progress Morning Check-In form draft — local-only (device-scoped, not cloud-synced), so
 *  opening Dream Journal, backgrounding, or refreshing mid-fill never loses answers. Cleared as
 *  soon as the check-in actually saves. See app/sleep-checkin.tsx. */
export const MORNING_CHECKIN_DRAFT_KEY = "lit_morning_checkin_draft";
export const JOURNAL_ENTRIES_KEY = "lit_journal_entries";
export const DREAM_JOURNAL_KEY = "lit_dream_journal";
export const PRE_SLEEP_INTENTIONS_KEY = "lit_pre_sleep_intentions";
export const LATEST_PRE_SLEEP_INTENTION_KEY = "lit_latest_pre_sleep_intention";
export const MORNING_INTENTION_REFLECTIONS_KEY = "lit_morning_intention_reflections";
export const AWARENESS_CHECKS_KEY = "lit_awareness_checks";
export const REFLECTIONS_KEY = "lit_reflections";
/** AffirmationEntry[] — user-written affirmations, Mind Hub. +1 step once per saved affirmation (never on edit/delete/replay). */
export const AFFIRMATIONS_KEY = "lit_affirmations";
export const GOAL_FEEDBACK_LOG_KEY = "lit_goal_feedback_log";
/** One-time Waiting Room boost usage, keyed by `${activeItemId}:${startedAt}` -> ISO timestamp used. */
export const WAITING_ROOM_BOOSTS_KEY = "lit_waiting_room_boosts";
/** Log of completed Progress/Recovery work (id, title, kind, duration, completedAt) that Forced Recovery is computed from. */
export const FOCUS_BLOCK_HISTORY_KEY = "lit_focus_block_history";

/**
 * MYLIT agent-foundation keys (see .agent/docs/MYLIT_AGENT_ARCHITECTURE.md). Purely typed
 * data + deterministic (non-AI) summaries — no external calls, no health permissions.
 */
/** UserLifeProfile — separate from LOCAL_PROFILE_KEY's existing Path onboarding profile. */
export const USER_LIFE_PROFILE_KEY = "lit_user_life_profile";
/** GuideMemory — small structured "what the guides remember" object. */
export const GUIDE_MEMORY_KEY = "lit_guide_memory";
/** AgentContextSnapshot — derived/recomputed cache, safe to let newest-write win on merge. */
export const AGENT_CONTEXT_SNAPSHOT_KEY = "lit_agent_context_snapshot";
/** StatsInsight[] — small plain-language patterns Stats has noticed. */
export const STATS_INSIGHTS_KEY = "lit_stats_insights";
/** BiomarkerSnapshot[] with source:"manual" only — no device/health integration yet. */
export const BIOMARKER_SNAPSHOTS_MANUAL_KEY = "lit_biomarker_snapshots_manual";
/** AgentEvent[] — the append-only event ledger the pattern engine learns from. */
export const AGENT_EVENT_LEDGER_KEY = "lit_agent_event_ledger";
/** LearningMemory — patterns distilled from the event ledger over time. */
export const LEARNING_MEMORY_KEY = "lit_learning_memory";
/** WeeklyAgentReview[] — one per week (id = weekStart), regenerating replaces, never duplicates. */
export const WEEKLY_AGENT_REVIEWS_KEY = "lit_weekly_agent_reviews";
/** LunaDayReminder[] — user-created reminders, scoped to a single day; +1 step once per reminder. */
export const LUNA_DAY_REMINDERS_KEY = "lit_luna_day_reminders";
/** LdmModeState | null — one Lucid Dreaming Mode night session, keyed by nightKey; never duplicated per night. */
export const LDM_MODE_STATE_KEY = "lit_ldm_mode_state";
/** QuickThoughtNote[] — MYLIT-themed general notes, distinct from journal/dream/reflection logs. */
export const QUICK_THOUGHT_NOTES_KEY = "lit_quick_thought_notes";
/** EvieAiPathPipelineRecord[] — one per "Ask Evie to Build My Path" run, newest-first, capped history. */
export const AI_EVIE_PATH_PIPELINES_KEY = "lit_ai_evie_path_pipelines";
/** LunaSupportModifierRecord[] — one per "Ask Luna to help me adjust" run, newest-first, capped history. */
export const AI_LUNA_SUPPORT_SESSIONS_KEY = "lit_ai_luna_support_sessions";
/** GuideConversationTurn[] — flat, both guides, filter by turn.guide. Capped per-guide (see lib/guideConversation.ts). */
export const GUIDE_CONVERSATIONS_KEY = "lit_guide_conversations";
/** GuideMemoryUpdateLogEntry[] — audit log written only once a proposal is decided (approved or dismissed). */
export const GUIDE_MEMORY_UPDATES_KEY = "lit_guide_memory_updates";
/** FoodLog[] — meal/snack timestamps that drive the fuel estimate and Luna's food gate. */
export const FOOD_LOGS_KEY = "lit_food_logs";
/** EvieMorningQuest | null — one Evie-generated quest per quest-day from Morning Check-In's "what do you want to get done today" answer. */
export const EVIE_MORNING_QUEST_KEY = "lit_evie_morning_quest";
/** SleepRoutine — user-edited list of pre-sleep routine steps (Sleep Guide), plus today's checked-off progress. */
export const SLEEP_ROUTINE_KEY = "lit_sleep_routine";
/** GuideContextRecord[] — explicit, revocable "Feed to Luna/Evie" consent grants. See lib/guideContext.ts. */
export const GUIDE_CONTEXT_RECORDS_KEY = "lit_guide_context_records";
/**
 * MandatoryGateEvidence | null — { questDayKey, wasProgressToday } — the one piece of durable
 * evidence the Rest gate needs that mode (Progress/Recovery) isn't itself: mode is recomputed
 * live from energy every render and never diffed against a prior value, so without this record
 * there's no way to tell "user was in Progress earlier today, then crossed into Recovery" apart
 * from "Morning Check-In assigned Recovery from the start." See lib/mandatoryGates.ts and the
 * markProgressToday effect in app/(tabs)/index.tsx. Sticky true for the quest-day once recorded;
 * resets automatically once questDayKey rolls over. Merged with a dedicated same-day-OR rule
 * (mergeMandatoryGateEvidence in progressStore.ts) so a stale device can't un-set evidence a
 * newer device already recorded for the same day.
 */
export const MANDATORY_GATE_EVIDENCE_KEY = "mylit_mandatory_gate_evidence";
/** QuestFulfillmentFeedback[] — one 1-10 rating per Today's Quest completion, keyed by the same
 *  completionId the completion itself uses (see lib/questFulfillment.ts). Array-merged by id
 *  like every other log, so a retry/resubmit of the same completion never duplicates. */
export const QUEST_FULFILLMENT_KEY = "lit_quest_fulfillment_feedback";

/**
 * Canonical synced keys that back the Log History screen. These are the SAME keys the
 * entry pages already write to (via persistProgressKeys) and are already listed in
 * SYNCABLE_PROGRESS_KEYS + ARRAY_MERGE_PROGRESS_KEYS, so every saved log is stored
 * locally first, synced to the user's Supabase account, and merged by id across devices.
 * We reuse them (rather than adding parallel *_logs keys) so there is no duplication,
 * double-counting, or migration risk.
 */
export const LOG_HISTORY_KEYS = {
  journal: JOURNAL_ENTRIES_KEY,
  reflection: REFLECTIONS_KEY,
  meditation: AWARENESS_CHECKS_KEY,
  dream: DREAM_JOURNAL_KEY,
  preSleepIntention: PRE_SLEEP_INTENTIONS_KEY,
  affirmation: AFFIRMATIONS_KEY,
  morningReflection: MORNING_INTENTION_REFLECTIONS_KEY,
  sleepCheckIn: CHECKIN_HISTORY_KEY,
  foodLog: FOOD_LOGS_KEY,
} as const;

/** AsyncStorage keys mirrored to the signed-in user's cloud profile. */
export const SYNCABLE_PROGRESS_KEYS = [
  LOCAL_PROFILE_KEY,
  LATEST_CHECKIN_KEY,
  CHECKIN_HISTORY_KEY,
  COMPLETED_QUESTS_KEY,
  TODAY_PROGRESS_DATE_KEY,
  MISSED_QUESTS_KEY,
  // Synced with a dedicated merge rule (mergeActiveTimedItem in progressStore.ts): whichever
  // side is non-empty wins outright, and if BOTH sides have an active timer, the one with the
  // later startedAt wins. Resolving a timer (complete/miss/cancel) must go through
  // clearProgressKey so the cloud row is deleted too — otherwise a stale cloud copy could
  // resurrect a timer the user already finished (the exact bug this key used to avoid by
  // never syncing at all).
  ACTIVE_TIMED_ITEM_KEY,
  DAY_PLAN_KEY,
  TOMORROW_QUEUE_KEY,
  USER_STATS_KEY,
  TOTAL_STEPS_FLOOR_KEY,
  DAILY_STEPS_LOG_KEY,
  JOURNAL_ENTRIES_KEY,
  DREAM_JOURNAL_KEY,
  PRE_SLEEP_INTENTIONS_KEY,
  LATEST_PRE_SLEEP_INTENTION_KEY,
  MORNING_INTENTION_REFLECTIONS_KEY,
  AWARENESS_CHECKS_KEY,
  REFLECTIONS_KEY,
  GOAL_FEEDBACK_LOG_KEY,
  WAITING_ROOM_BOOSTS_KEY,
  FOCUS_BLOCK_HISTORY_KEY,
  USER_LIFE_PROFILE_KEY,
  GUIDE_MEMORY_KEY,
  AGENT_CONTEXT_SNAPSHOT_KEY,
  STATS_INSIGHTS_KEY,
  BIOMARKER_SNAPSHOTS_MANUAL_KEY,
  AGENT_EVENT_LEDGER_KEY,
  LEARNING_MEMORY_KEY,
  WEEKLY_AGENT_REVIEWS_KEY,
  AI_EVIE_PATH_PIPELINES_KEY,
  AI_LUNA_SUPPORT_SESSIONS_KEY,
  GUIDE_CONVERSATIONS_KEY,
  GUIDE_MEMORY_UPDATES_KEY,
  LUNA_DAY_REMINDERS_KEY,
  LDM_MODE_STATE_KEY,
  QUICK_THOUGHT_NOTES_KEY,
  AFFIRMATIONS_KEY,
  FOOD_LOGS_KEY,
  EVIE_MORNING_QUEST_KEY,
  SLEEP_ROUTINE_KEY,
  GUIDE_CONTEXT_RECORDS_KEY,
  MANDATORY_GATE_EVIDENCE_KEY,
  QUEST_FULFILLMENT_KEY,
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
  FOCUS_BLOCK_HISTORY_KEY,
  STATS_INSIGHTS_KEY,
  BIOMARKER_SNAPSHOTS_MANUAL_KEY,
  AGENT_EVENT_LEDGER_KEY,
  WEEKLY_AGENT_REVIEWS_KEY,
  AI_EVIE_PATH_PIPELINES_KEY,
  AI_LUNA_SUPPORT_SESSIONS_KEY,
  GUIDE_CONVERSATIONS_KEY,
  GUIDE_MEMORY_UPDATES_KEY,
  LUNA_DAY_REMINDERS_KEY,
  QUICK_THOUGHT_NOTES_KEY,
  AFFIRMATIONS_KEY,
  FOOD_LOGS_KEY,
  GUIDE_CONTEXT_RECORDS_KEY,
  QUEST_FULFILLMENT_KEY,
  TOMORROW_QUEUE_KEY,
]);

export function isSyncableProgressKey(key: string): key is SyncableProgressKey {
  return (SYNCABLE_PROGRESS_KEYS as readonly string[]).includes(key);
}

/** All keys scanned for backup/recovery (current + legacy). */
export const ALL_SCANNABLE_PROGRESS_KEYS = [
  ...SYNCABLE_PROGRESS_KEYS,
  ...LEGACY_PROGRESS_KEYS,
] as const;
