import AsyncStorage from "@react-native-async-storage/async-storage";

import { persistProgressKeys } from "./progressStore";
import {
  USER_LIFE_PROFILE_KEY,
  GUIDE_MEMORY_KEY,
  AGENT_CONTEXT_SNAPSHOT_KEY,
  STATS_INSIGHTS_KEY,
  BIOMARKER_SNAPSHOTS_MANUAL_KEY,
  AGENT_EVENT_LEDGER_KEY,
  LEARNING_MEMORY_KEY,
  COMPLETED_QUESTS_KEY,
  MISSED_QUESTS_KEY,
  CHECKIN_HISTORY_KEY,
  FOCUS_BLOCK_HISTORY_KEY,
  REFLECTIONS_KEY,
  JOURNAL_ENTRIES_KEY,
} from "./storageKeys";
import type { CompletionEntry, MissedEntry, FocusBlockLogEntry } from "./questProgress";
import type {
  UserLifeProfile,
  GuideMemory,
  AgentContextSnapshot,
  StatsInsight,
  EviePathSummary,
  LunaSupportSummary,
  CalendarPlanningSummary,
  UiUxImmersionSummary,
  UiUxImmersionCheck,
  BiomarkerSnapshot,
  BiomarkerPermissionStatus,
  AgentEvent,
  AgentEventType,
  AgentEventMode,
  LearningMemory,
  EvieLearningContext,
  LunaLearningContext,
  CalendarLearningContext,
} from "./agentTypes";

// Non-AI helper foundation for MYLIT's long-term agent architecture. See
// .agent/docs/MYLIT_AGENT_ARCHITECTURE.md. Nothing in this file calls an external model or
// requests a health permission — everything here is deterministic, local-first, and reads
// only data the user has already entered into MYLIT.

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

// ---------------------------------------------------------------------------
// UserLifeProfile
// ---------------------------------------------------------------------------

export async function loadUserLifeProfile(): Promise<UserLifeProfile> {
  return readJson<UserLifeProfile>(USER_LIFE_PROFILE_KEY, {});
}

/** Shallow-merges into the existing profile — never wipes fields the caller didn't pass. */
export async function saveUserLifeProfile(partial: Partial<UserLifeProfile>): Promise<UserLifeProfile> {
  const current = await loadUserLifeProfile();
  const next: UserLifeProfile = { ...current, ...partial, updatedAt: new Date().toISOString() };
  await persistProgressKeys({ [USER_LIFE_PROFILE_KEY]: JSON.stringify(next) });
  void recordAgentEvent({ type: "goal_updated", sourcePage: "life-profile" });
  return next;
}

export function summarizeUserLifeProfile(profile: UserLifeProfile): string[] {
  const lines: string[] = [];
  if (profile.futureSelfStatement) lines.push(`Future self: ${profile.futureSelfStatement}`);
  if (profile.careerGoals) lines.push(`Career: ${profile.careerGoals}`);
  if (profile.bodyHealthGoals) lines.push(`Body/health: ${profile.bodyHealthGoals}`);
  if (profile.friendshipSocialGoals) lines.push(`Friendship: ${profile.friendshipSocialGoals}`);
  if (profile.purposeGoals) lines.push(`Purpose: ${profile.purposeGoals}`);
  if (profile.confidenceGoals) lines.push(`Confidence: ${profile.confidenceGoals}`);
  if (profile.currentObstacles) lines.push(`Current obstacle: ${profile.currentObstacles}`);
  if (profile.longTermDreamStatement) lines.push(`Long-term dream: ${profile.longTermDreamStatement}`);
  return lines;
}

// ---------------------------------------------------------------------------
// GuideMemory
// ---------------------------------------------------------------------------

export async function loadGuideMemory(): Promise<GuideMemory> {
  return readJson<GuideMemory>(GUIDE_MEMORY_KEY, {});
}

export async function saveGuideMemory(partial: Partial<GuideMemory>): Promise<GuideMemory> {
  const current = await loadGuideMemory();
  const next: GuideMemory = { ...current, ...partial, updatedAt: new Date().toISOString() };
  await persistProgressKeys({ [GUIDE_MEMORY_KEY]: JSON.stringify(next) });
  return next;
}

// ---------------------------------------------------------------------------
// Agent Event Ledger — the raw material the pattern engine learns from
// ---------------------------------------------------------------------------

/** Keeps the synced payload bounded — oldest events drop first, never the most recent. */
const MAX_LEDGER_EVENTS = 1000;

export async function loadAgentEventLedger(): Promise<AgentEvent[]> {
  return readJson<AgentEvent[]>(AGENT_EVENT_LEDGER_KEY, []);
}

export type RecordAgentEventInput = {
  type: AgentEventType;
  sourcePage: string;
  userId?: string | null;
  relatedItemId?: string;
  mode?: AgentEventMode;
  durationMinutes?: number;
  stepDelta?: number;
  energyDelta?: number;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt?: string;
};

/**
 * Appends one event to the ledger. Never throws (callers fire this with `void` from
 * critical save/complete paths, exactly like the existing `void trackEvent(...)` analytics
 * calls, and a failure here must never block or roll back the action that triggered it).
 * De-dupes on (type, relatedItemId) so a retried save/completion can't double-log the same
 * action, and caps the ledger length by dropping the OLDEST events, never recent ones.
 */
export async function recordAgentEvent(input: RecordAgentEventInput): Promise<void> {
  try {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const localDate = toDateKey(createdAt) ?? new Date().toLocaleDateString("en-CA");
    const existing = await loadAgentEventLedger();

    if (input.relatedItemId && existing.some((e) => e.type === input.type && e.relatedItemId === input.relatedItemId)) {
      return;
    }

    const event: AgentEvent = {
      id: `${input.type}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId ?? null,
      type: input.type,
      sourcePage: input.sourcePage,
      createdAt,
      localDate,
      relatedItemId: input.relatedItemId,
      mode: input.mode,
      durationMinutes: input.durationMinutes,
      stepDelta: input.stepDelta,
      energyDelta: input.energyDelta,
      metadata: input.metadata,
    };

    // Newest first, oldest trimmed off the end once over the cap.
    const next = [event, ...existing].slice(0, MAX_LEDGER_EVENTS);
    await persistProgressKeys({ [AGENT_EVENT_LEDGER_KEY]: JSON.stringify(next) });
  } catch (error) {
    console.warn("recordAgentEvent error:", error);
  }
}

export async function getAgentEventsForRange(startMs: number, endMs: number): Promise<AgentEvent[]> {
  const events = await loadAgentEventLedger();
  return events.filter((event) => {
    const t = new Date(event.createdAt).getTime();
    return Number.isFinite(t) && t >= startMs && t < endMs;
  });
}

// ---------------------------------------------------------------------------
// Stats feedback loop
// ---------------------------------------------------------------------------

type CheckInLike = { createdAt?: string; interrupted?: boolean; effectiveSleepMinutes?: number; energy?: number };
type ReflectionLike = { createdAt?: string };
type JournalLike = { createdAt?: string };

function toDateKey(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA");
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
}

function weekdayFromDateKey(dateKey: string): string | null {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString([], { weekday: "long" });
}

/**
 * Reads completed/missed quests and check-in history directly (not through any single
 * screen's local state) and turns them into a handful of small, plain-language patterns.
 * Every insight requires a minimum amount of supporting data before it's surfaced, so an
 * early/light user sees no insights rather than noisy guesses from 1-2 data points.
 */
export async function summarizeStatsForAgents(): Promise<StatsInsight[]> {
  const [completed, missed, checkins, focusLog, reflections, journalEntries] = await Promise.all([
    readJson<CompletionEntry[]>(COMPLETED_QUESTS_KEY, []),
    readJson<MissedEntry[]>(MISSED_QUESTS_KEY, []),
    readJson<CheckInLike[]>(CHECKIN_HISTORY_KEY, []),
    readJson<FocusBlockLogEntry[]>(FOCUS_BLOCK_HISTORY_KEY, []),
    readJson<ReflectionLike[]>(REFLECTIONS_KEY, []),
    readJson<JournalLike[]>(JOURNAL_ENTRIES_KEY, []),
  ]);

  const insights: StatsInsight[] = [];
  const nowIso = new Date().toISOString();
  const push = (id: string, category: StatsInsight["category"], summary: string, confidence: number) =>
    insights.push({ id, category, summary, confidence, computedAt: nowIso });

  // 1. Completion-rate trend: this week vs the week before.
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const inRange = (iso: string, start: number, end: number) => {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= start && t < end;
  };
  const recentCompleted = completed.filter((e) => inRange(e.completedAt, now - 7 * dayMs, now)).length;
  const recentMissed = missed.filter((e) => inRange(e.missedAt, now - 7 * dayMs, now)).length;
  const priorCompleted = completed.filter((e) => inRange(e.completedAt, now - 14 * dayMs, now - 7 * dayMs)).length;
  const priorMissed = missed.filter((e) => inRange(e.missedAt, now - 14 * dayMs, now - 7 * dayMs)).length;
  const recentTotal = recentCompleted + recentMissed;
  const priorTotal = priorCompleted + priorMissed;
  if (recentTotal >= 3 && priorTotal >= 3) {
    const recentRate = recentCompleted / recentTotal;
    const priorRate = priorCompleted / priorTotal;
    if (recentRate - priorRate >= 0.15) {
      push("improving_consistency", "consistency", "You're completing more of your quests this week than last week — your consistency is improving.", 0.6);
    } else if (priorRate - recentRate >= 0.15) {
      push("consistency_dipped", "consistency", "Your completion rate dipped a little this week compared to last — that happens, not a failure.", 0.5);
    }
  }

  // 2. Share of completed work that is Progress vs Recovery.
  const progressCompleted = completed.filter((e) => (e.kind ?? "progress") === "progress").length;
  const recoveryCompleted = completed.filter((e) => e.kind === "recovery").length;
  if (progressCompleted + recoveryCompleted >= 5) {
    if (recoveryCompleted > progressCompleted * 1.5) {
      push("recovery_heavy", "recovery_habit", "You're completing Recovery tasks more consistently than Progress tasks lately.", 0.55);
    } else if (progressCompleted > recoveryCompleted * 1.5) {
      push("progress_heavy", "progress_habit", "You're leaning heavily into Progress tasks — Recovery keeps that pace sustainable.", 0.55);
    }
  }

  // 3. Sleep interruptions lining up with the following day's missed quests.
  const interruptedDateKeys = new Set(
    checkins
      .filter((c) => c.interrupted)
      .map((c) => toDateKey(c.createdAt))
      .filter((d): d is string => Boolean(d))
  );
  if (interruptedDateKeys.size >= 2 && missed.length >= 2) {
    const followingDays = new Set(Array.from(interruptedDateKeys).map((d) => addDaysToDateKey(d, 1)));
    const missedAfterInterruption = missed.filter((m) => followingDays.has(m.dateKey)).length;
    if (missedAfterInterruption / missed.length >= 0.4) {
      push("sleep_interruption_missed_link", "sleep", "Missed quests tend to line up with nights your sleep was interrupted — protecting sleep may help follow-through.", 0.5);
    }
  }

  // 4. Overall miss rate high enough to suggest shorter quests.
  if (missed.length >= 5 && missed.length > completed.length * 1.2) {
    push("needs_shorter_quests", "quest_length", "You're missing more quests than you're completing right now — shorter quests for a few days may help rebuild momentum.", 0.5);
  }

  // 5. One weekday carrying a disproportionate share of misses.
  if (missed.length >= 5) {
    const weekdayMissCounts = new Map<string, number>();
    for (const m of missed) {
      const weekday = weekdayFromDateKey(m.dateKey);
      if (weekday) weekdayMissCounts.set(weekday, (weekdayMissCounts.get(weekday) ?? 0) + 1);
    }
    const sorted = Array.from(weekdayMissCounts.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length && sorted[0][1] >= Math.max(2, missed.length * 0.35)) {
      push("overloaded_weekday", "workload", `${sorted[0][0]} tends to have more missed quests than other days — that day might be overloaded.`, 0.5);
    }
  }

  // 6. Recent sleep duration, averaged from the last week of check-ins with a real reading.
  const recentSleepMinutes = checkins
    .filter((c) => inRange(c.createdAt ?? "", now - 7 * dayMs, now) && typeof c.effectiveSleepMinutes === "number")
    .map((c) => c.effectiveSleepMinutes as number);
  if (recentSleepMinutes.length >= 3) {
    const avgHours = recentSleepMinutes.reduce((sum, m) => sum + m, 0) / recentSleepMinutes.length / 60;
    if (avgHours < 6.5) {
      push("short_sleep_week", "sleep", `You're averaging about ${avgHours.toFixed(1)}h of sleep this week — a little more rest could make the rest of this easier.`, 0.55);
    }
  }

  // 7. Energy trend: this week's check-ins vs the week before.
  const recentEnergy = checkins.filter((c) => inRange(c.createdAt ?? "", now - 7 * dayMs, now) && typeof c.energy === "number").map((c) => c.energy as number);
  const priorEnergy = checkins.filter((c) => inRange(c.createdAt ?? "", now - 14 * dayMs, now - 7 * dayMs) && typeof c.energy === "number").map((c) => c.energy as number);
  if (recentEnergy.length >= 2 && priorEnergy.length >= 2) {
    const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    const recentAvg = avg(recentEnergy);
    const priorAvg = avg(priorEnergy);
    if (recentAvg - priorAvg >= 10) {
      push("energy_rising", "consistency", "Your energy has been trending up this week compared to last.", 0.5);
    } else if (priorAvg - recentAvg >= 10) {
      push("energy_falling", "recovery_habit", "Your energy has dipped this week — a lighter, more Recovery-leaning day or two might help.", 0.5);
    }
  }

  // 8. Checklist consistency: how many of the last 7 days had at least one completed checklist item.
  const recentChecklistDays = new Set(
    focusLog
      .filter((entry) => entry.source === "Checklist" && inRange(entry.completedAt, now - 7 * dayMs, now))
      .map((entry) => entry.dateKey)
  );
  const recentFocusLogTotal = focusLog.filter((entry) => inRange(entry.completedAt, now - 7 * dayMs, now)).length;
  if (recentFocusLogTotal >= 5) {
    if (recentChecklistDays.size >= 5) {
      push("checklist_consistent", "consistency", "You've kept up your checklist items on most days this week — that steadiness adds up.", 0.5);
    } else if (recentChecklistDays.size <= 1) {
      push("checklist_inconsistent", "consistency", "Your checklist items have been light this week — a smaller, easier list might be more sustainable right now.", 0.45);
    }
  }

  // 9. Reflection/journal engagement — a light, supportive signal only (no tag parsing exists yet).
  const recentReflections = reflections.filter((r) => inRange(r.createdAt ?? "", now - 14 * dayMs, now)).length;
  const recentJournalEntries = journalEntries.filter((j) => inRange(j.createdAt ?? "", now - 14 * dayMs, now)).length;
  if (recentReflections + recentJournalEntries >= 3) {
    push("reflecting_regularly", "consistency", "You've been reflecting and journaling regularly lately — that habit helps you adjust before things pile up.", 0.45);
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Pattern Engine — reads the event ledger for time-of-day / weekday / duration patterns
// that summarizeStatsForAgents can't see from raw per-feature storage alone. Naturally
// starts empty for existing users (the ledger only fills going forward) and gets richer
// the longer someone uses MYLIT.
// ---------------------------------------------------------------------------

type TimeOfDayBucket = "morning" | "afternoon" | "evening" | "late night";

function timeOfDayBucket(iso: string): TimeOfDayBucket {
  const hour = new Date(iso).getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late night";
}

function isWeekendIso(iso: string): boolean {
  const day = new Date(iso).getDay();
  return day === 0 || day === 6;
}

export async function summarizeBehaviorPatterns(): Promise<StatsInsight[]> {
  const events = await loadAgentEventLedger();
  const insights: StatsInsight[] = [];
  const nowIso = new Date().toISOString();
  const push = (id: string, category: StatsInsight["category"], summary: string, confidence: number) =>
    insights.push({ id, category, summary, confidence, computedAt: nowIso });

  const questEvents = events.filter((e) => e.type === "quest_completed" || e.type === "quest_missed");

  // Time-of-day risk: a bucket where misses outnumber completions, with enough volume to trust it.
  if (questEvents.length >= 8) {
    const buckets = new Map<TimeOfDayBucket, { completed: number; missed: number }>();
    for (const event of questEvents) {
      const bucket = timeOfDayBucket(event.createdAt);
      const stat = buckets.get(bucket) ?? { completed: 0, missed: 0 };
      if (event.type === "quest_completed") stat.completed += 1;
      else stat.missed += 1;
      buckets.set(bucket, stat);
    }
    let worstBucket: TimeOfDayBucket | null = null;
    let worstMissRate = 0;
    for (const [bucket, stat] of buckets) {
      const total = stat.completed + stat.missed;
      if (total < 3) continue;
      const missRate = stat.missed / total;
      if (missRate >= 0.5 && missRate > worstMissRate) {
        worstBucket = bucket;
        worstMissRate = missRate;
      }
    }
    if (worstBucket) {
      push(
        `time_of_day_risk_${worstBucket.replace(" ", "_")}`,
        "workload",
        `${worstBucket.charAt(0).toUpperCase()}${worstBucket.slice(1)} progress tasks are missed more often than they're completed for you.`,
        0.5
      );
    }
  }

  // Weekday vs weekend consistency.
  if (questEvents.length >= 8) {
    let weekdayCompleted = 0, weekdayMissed = 0, weekendCompleted = 0, weekendMissed = 0;
    for (const event of questEvents) {
      const weekend = isWeekendIso(event.createdAt);
      if (event.type === "quest_completed") {
        if (weekend) weekendCompleted += 1; else weekdayCompleted += 1;
      } else if (weekend) weekendMissed += 1; else weekdayMissed += 1;
    }
    const weekdayTotal = weekdayCompleted + weekdayMissed;
    const weekendTotal = weekendCompleted + weekendMissed;
    if (weekdayTotal >= 4 && weekendTotal >= 4) {
      const weekdayRate = weekdayCompleted / weekdayTotal;
      const weekendRate = weekendCompleted / weekendTotal;
      if (weekdayRate - weekendRate >= 0.2) {
        push("weekday_more_consistent", "consistency", "You're more consistent on weekdays than weekends.", 0.5);
      } else if (weekendRate - weekdayRate >= 0.2) {
        push("weekend_more_consistent", "consistency", "You're more consistent on weekends than weekdays.", 0.5);
      }
    }
  }

  // Duration preference: shorter quests completed more reliably than longer ones.
  const withDuration = questEvents.filter((e) => typeof e.durationMinutes === "number");
  if (withDuration.length >= 8) {
    const short = withDuration.filter((e) => (e.durationMinutes as number) <= 15);
    const long = withDuration.filter((e) => (e.durationMinutes as number) >= 45);
    const shortTotal = short.length;
    const longTotal = long.length;
    if (shortTotal >= 3 && longTotal >= 3) {
      const shortRate = short.filter((e) => e.type === "quest_completed").length / shortTotal;
      const longRate = long.filter((e) => e.type === "quest_completed").length / longTotal;
      if (shortRate - longRate >= 0.25) {
        push("shorter_quests_completed_more", "quest_length", "Shorter quests are completed more often than longer ones for you.", 0.5);
      }
    }
  }

  // Recovery-day → stronger next-day completion.
  const recoveryDays = new Set(events.filter((e) => e.type === "quest_completed" && e.mode === "recovery").map((e) => e.localDate));
  if (recoveryDays.size >= 3) {
    let daysChecked = 0;
    let daysThatImproved = 0;
    for (const day of recoveryDays) {
      const nextDay = addDaysToDateKey(day, 1);
      const nextDayEvents = questEvents.filter((e) => e.localDate === nextDay);
      if (!nextDayEvents.length) continue;
      daysChecked += 1;
      const rate = nextDayEvents.filter((e) => e.type === "quest_completed").length / nextDayEvents.length;
      if (rate >= 0.7) daysThatImproved += 1;
    }
    if (daysChecked >= 3 && daysThatImproved / daysChecked >= 0.6) {
      push("recovery_improves_next_day", "recovery_habit", "Days after a Recovery task tend to have stronger completion the next day.", 0.5);
    }
  }

  return insights;
}

/** Merges raw-storage insights with event-ledger behavior patterns, deduped by id. */
export async function buildStatsInsightSnapshot(): Promise<StatsInsight[]> {
  const [fromRawData, fromEvents] = await Promise.all([summarizeStatsForAgents(), summarizeBehaviorPatterns()]);
  const merged = new Map<string, StatsInsight>();
  for (const insight of [...fromRawData, ...fromEvents]) merged.set(insight.id, insight);
  return Array.from(merged.values());
}

// ---------------------------------------------------------------------------
// Learning Memory — patterns distilled from the event ledger over time
// ---------------------------------------------------------------------------

const WIN_INSIGHT_IDS = new Set([
  "improving_consistency",
  "checklist_consistent",
  "energy_rising",
  "recovery_improves_next_day",
  "weekday_more_consistent",
  "weekend_more_consistent",
  "reflecting_regularly",
  "shorter_quests_completed_more",
]);

const RISK_INSIGHT_IDS = new Set([
  "consistency_dipped",
  "needs_shorter_quests",
  "overloaded_weekday",
  "sleep_interruption_missed_link",
  "short_sleep_week",
  "energy_falling",
  "checklist_inconsistent",
]);

export async function loadLearningMemory(): Promise<LearningMemory> {
  return readJson<LearningMemory>(LEARNING_MEMORY_KEY, { lastUpdatedAt: new Date(0).toISOString() });
}

/**
 * Recomputes LearningMemory from the event ledger + latest insights and persists it. Safe
 * to call often (e.g. alongside buildAgentContextSnapshot) — it always derives fresh values
 * rather than accumulating, so it can never duplicate or drift from the underlying data.
 */
export async function updateLearningMemoryFromEvents(): Promise<LearningMemory> {
  const [events, insights, current] = await Promise.all([loadAgentEventLedger(), buildStatsInsightSnapshot(), loadLearningMemory()]);

  const completedDurations = events
    .filter((e) => e.type === "quest_completed" && typeof e.durationMinutes === "number")
    .map((e) => e.durationMinutes as number);
  const preferredQuestDurations = completedDurations.length
    ? Array.from(new Set(completedDurations)).sort((a, b) => a - b)
    : current.preferredQuestDurations;

  const questEvents = events.filter((e) => e.type === "quest_completed" || e.type === "quest_missed");
  let bestProgressTimeWindows = current.bestProgressTimeWindows;
  let worstProgressTimeWindows = current.worstProgressTimeWindows;
  if (questEvents.length >= 8) {
    const buckets = new Map<TimeOfDayBucket, { completed: number; missed: number }>();
    for (const event of questEvents) {
      const bucket = timeOfDayBucket(event.createdAt);
      const stat = buckets.get(bucket) ?? { completed: 0, missed: 0 };
      if (event.type === "quest_completed") stat.completed += 1;
      else stat.missed += 1;
      buckets.set(bucket, stat);
    }
    const withEnoughVolume = Array.from(buckets.entries()).filter(([, stat]) => stat.completed + stat.missed >= 3);
    if (withEnoughVolume.length) {
      const byCompletionRate = withEnoughVolume
        .map(([bucket, stat]) => ({ bucket, rate: stat.completed / (stat.completed + stat.missed) }))
        .sort((a, b) => b.rate - a.rate);
      bestProgressTimeWindows = [byCompletionRate[0].bucket];
      const worst = byCompletionRate[byCompletionRate.length - 1];
      worstProgressTimeWindows = worst.rate < 0.5 ? [worst.bucket] : [];
    }
  }

  const recentWins = insights.filter((i) => WIN_INSIGHT_IDS.has(i.id)).map((i) => i.summary);
  const recentRisks = insights.filter((i) => RISK_INSIGHT_IDS.has(i.id) || i.id.startsWith("time_of_day_risk_")).map((i) => i.summary);
  const overloadPatterns = insights.filter((i) => i.category === "workload").map((i) => i.summary);
  const consistencyPatterns = insights.filter((i) => i.category === "consistency").map((i) => i.summary);
  const commonSleepBarriers = insights.filter((i) => i.category === "sleep").map((i) => i.summary);

  const next: LearningMemory = {
    ...current,
    preferredQuestDurations,
    bestProgressTimeWindows,
    worstProgressTimeWindows,
    recentWins: recentWins.length ? recentWins : current.recentWins,
    recentRisks: recentRisks.length ? recentRisks : current.recentRisks,
    overloadPatterns: overloadPatterns.length ? overloadPatterns : current.overloadPatterns,
    consistencyPatterns: consistencyPatterns.length ? consistencyPatterns : current.consistencyPatterns,
    commonSleepBarriers: commonSleepBarriers.length ? commonSleepBarriers : current.commonSleepBarriers,
    lastUpdatedAt: new Date().toISOString(),
  };

  await persistProgressKeys({ [LEARNING_MEMORY_KEY]: JSON.stringify(next) });
  return next;
}

// ---------------------------------------------------------------------------
// Guide summaries (deterministic — no AI)
// ---------------------------------------------------------------------------

function pickInsightSummaries(insights: StatsInsight[], categories: StatsInsight["category"][], limit: number): string[] {
  return insights
    .filter((insight) => categories.includes(insight.category))
    .slice(0, limit)
    .map((insight) => insight.summary);
}

const EVIE_INSIGHT_CATEGORIES: StatsInsight["category"][] = ["progress_habit", "consistency", "quest_length", "workload"];
const LUNA_INSIGHT_CATEGORIES: StatsInsight["category"][] = ["sleep", "recovery_habit"];
const CALENDAR_INSIGHT_CATEGORIES: StatsInsight["category"][] = ["workload", "quest_length", "consistency"];

export function buildEviePathSummary(profile: UserLifeProfile, insights: StatsInsight[]): EviePathSummary {
  const hasDirection = Boolean(
    profile.careerGoals ||
      profile.bodyHealthGoals ||
      profile.friendshipSocialGoals ||
      profile.purposeGoals ||
      profile.confidenceGoals ||
      profile.futureSelfStatement ||
      profile.longTermDreamStatement
  );

  const supportingLines = pickInsightSummaries(insights, EVIE_INSIGHT_CATEGORIES, 2);

  // When Stats has noticed something relevant, Evie's headline shifts from a general intro
  // to a real adjustment based on it — this is the feedback loop, made visible.
  const headline = supportingLines.length
    ? "Here's what I'm adjusting based on your recent patterns:"
    : hasDirection
      ? "Your path is starting to form. I'll use your goals, obstacles, and progress patterns to help you build forward."
      : "Tell me what you're building toward, and I'll help you turn it into real direction.";

  return { headline, supportingLines, computedAt: new Date().toISOString() };
}

export function buildLunaSupportSummary(profile: UserLifeProfile, insights: StatsInsight[]): LunaSupportSummary {
  const hasSupportContext = Boolean(profile.commonSleepBarriers || profile.recoveryActivitiesThatHelp || profile.preferredLunaSupport);

  const supportingLines = pickInsightSummaries(insights, LUNA_INSIGHT_CATEGORIES, 2);

  const headline = supportingLines.length
    ? "Here's what I'm noticing about your sleep and recovery lately — no shame in any of it:"
    : hasSupportContext
      ? "I'll use your sleep, recovery, and reflections to help you protect your flame."
      : "Rest counts as progress too. Whenever you're ready, tell me what recovery looks like for you.";

  return { headline, supportingLines, computedAt: new Date().toISOString() };
}

export function buildCalendarPlanningSummary(profile: UserLifeProfile, insights: StatsInsight[]): CalendarPlanningSummary {
  const suggestions = pickInsightSummaries(insights, CALENDAR_INSIGHT_CATEGORIES, 3);
  if (profile.currentObstacles && suggestions.length < 3) {
    suggestions.push(`Keep in mind: ${profile.currentObstacles}`);
  }
  const headline = suggestions.length
    ? "Balancing your schedule based on what's actually been working:"
    : "Balancing your Progress and Recovery time against today's energy caps.";
  return { headline, suggestions, computedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Agent Feedback Loop — richer, still-deterministic context objects future AI-backed guide
// responses will read from. Distinct from the plainer EviePathSummary/LunaSupportSummary/
// CalendarPlanningSummary above (which stay as the simple text shown in the UI today).
// ---------------------------------------------------------------------------

export function buildEvieLearningContext(memory: LearningMemory, insights: StatsInsight[]): EvieLearningContext {
  const suggestedQuestDurationMinutes = memory.preferredQuestDurations?.length
    ? Math.min(...memory.preferredQuestDurations)
    : undefined;

  const blockedGoalNote = insights.find((i) => i.id === "needs_shorter_quests" || i.id === "overloaded_weekday")?.summary;
  const pathAdjustmentNote = insights.find((i) => EVIE_INSIGHT_CATEGORIES.includes(i.category))?.summary;

  return {
    suggestedQuestDurationMinutes,
    pathAdjustmentNote,
    blockedGoalNote,
    recentWins: memory.recentWins ?? [],
    computedAt: new Date().toISOString(),
  };
}

export function buildLunaLearningContext(memory: LearningMemory, insights: StatsInsight[]): LunaLearningContext {
  const risks = memory.recentRisks ?? [];
  const sleepBarrierNote = insights.find((i) => i.category === "sleep")?.summary ?? memory.commonSleepBarriers?.[0];
  const recoveryUrgency: LunaLearningContext["recoveryUrgency"] = insights.some((i) => i.id === "energy_falling" || i.id === "short_sleep_week")
    ? "needed"
    : risks.length
      ? "suggested"
      : "none";

  return {
    recoveryUrgency,
    sleepBarrierNote,
    // A recent dip/miss pattern means Luna should soften reflection prompts rather than
    // pile on — never shame-based, per MYLIT's core support principle.
    softenReflectionPrompts: insights.some((i) => i.id === "consistency_dipped" || i.id === "needs_shorter_quests"),
    recentRisks: risks,
    computedAt: new Date().toISOString(),
  };
}

export function buildCalendarLearningContext(memory: LearningMemory, insights: StatsInsight[]): CalendarLearningContext {
  const overloadedWeekdays = insights
    .filter((i) => i.id === "overloaded_weekday")
    .map((i) => i.summary.split(" tends to have")[0]);

  const betterTimeWindowNote = memory.bestProgressTimeWindows?.length
    ? `You tend to follow through best on ${memory.bestProgressTimeWindows[0]} tasks.`
    : undefined;

  const recommendedSplitNote = insights.find((i) => i.category === "recovery_habit" || i.category === "progress_habit")?.summary;

  return {
    overloadedWeekdays,
    betterTimeWindowNote,
    recommendedSplitNote,
    computedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// UI/UX Immersion Agent (foundation only — no AI, no automatic screen inspection yet)
// ---------------------------------------------------------------------------

export type UiUxImmersionInput = {
  screenName: string;
  titleCentered: boolean;
  guidePresent: boolean;
  pixelStylingPreserved: boolean;
  hasPrimaryAction: boolean;
  colorsMatchMode: boolean;
  mobileSafeLayout: boolean;
  noClutteredText: boolean;
};

export function buildUiUxImmersionSummary(input: UiUxImmersionInput): UiUxImmersionSummary {
  const checks: UiUxImmersionCheck[] = [
    { label: "Title centered", passed: input.titleCentered },
    { label: "Guide present", passed: input.guidePresent },
    { label: "Pixel/RPG styling preserved", passed: input.pixelStylingPreserved },
    { label: "Page has a clear primary action", passed: input.hasPrimaryAction },
    { label: "Colors match MYLIT mode", passed: input.colorsMatchMode },
    { label: "Layout is mobile-safe", passed: input.mobileSafeLayout },
    { label: "No cluttered text blocks", passed: input.noClutteredText },
  ];
  return {
    screenName: input.screenName,
    checks,
    passedCount: checks.filter((check) => check.passed).length,
    totalCount: checks.length,
    computedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Biomarker Adapter (manual check-in data only — no HealthKit/wearable/EEG integration yet)
// ---------------------------------------------------------------------------

export function normalizeManualBiomarkerSnapshot(
  input: Partial<BiomarkerSnapshot> & { date: string }
): BiomarkerSnapshot {
  return {
    id: input.id || `manual-${input.date}-${Date.now()}`,
    date: input.date,
    sleepMinutes: input.sleepMinutes,
    sleepStart: input.sleepStart,
    sleepEnd: input.sleepEnd,
    awakenings: input.awakenings,
    sleepEfficiency: input.sleepEfficiency,
    steps: input.steps,
    restingHeartRate: input.restingHeartRate,
    hrv: input.hrv,
    workoutMinutes: input.workoutMinutes,
    source: "manual",
    permissionStatus: (input.permissionStatus ?? "not_requested") as BiomarkerPermissionStatus,
    notes: input.notes,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export async function loadManualBiomarkerSnapshots(): Promise<BiomarkerSnapshot[]> {
  return readJson<BiomarkerSnapshot[]>(BIOMARKER_SNAPSHOTS_MANUAL_KEY, []);
}

/** Adds (or replaces, by id) one manual check-in snapshot. Never touches other sources. */
export async function addManualBiomarkerSnapshot(
  input: Partial<BiomarkerSnapshot> & { date: string }
): Promise<BiomarkerSnapshot[]> {
  const existing = await loadManualBiomarkerSnapshots();
  const snapshot = normalizeManualBiomarkerSnapshot(input);
  const next = [snapshot, ...existing.filter((entry) => entry.id !== snapshot.id)];
  await persistProgressKeys({ [BIOMARKER_SNAPSHOTS_MANUAL_KEY]: JSON.stringify(next) });
  return next;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Builds the one safe context snapshot every guide/agent should read from, instead of each
 * one reaching into raw storage separately. Persists the snapshot and the stats insights so
 * they're available immediately on next load and sync across devices like everything else.
 */
export async function buildAgentContextSnapshot(): Promise<AgentContextSnapshot> {
  const [lifeProfile, guideMemory, insights, biomarkers] = await Promise.all([
    loadUserLifeProfile(),
    loadGuideMemory(),
    buildStatsInsightSnapshot(),
    loadManualBiomarkerSnapshots(),
  ]);
  // Best-effort — recomputing learning memory must never block building the snapshot itself.
  void updateLearningMemoryFromEvents().catch((error) => console.warn("updateLearningMemoryFromEvents error:", error));

  const evie = buildEviePathSummary(lifeProfile, insights);
  const luna = buildLunaSupportSummary(lifeProfile, insights);
  const calendar = buildCalendarPlanningSummary(lifeProfile, insights);
  const latestBiomarker = biomarkers[0] ?? null;

  const snapshot: AgentContextSnapshot = {
    lifeProfile,
    guideMemory,
    insights,
    latestBiomarker,
    evie,
    luna,
    calendar,
    computedAt: new Date().toISOString(),
  };

  await persistProgressKeys({
    [AGENT_CONTEXT_SNAPSHOT_KEY]: JSON.stringify(snapshot),
    [STATS_INSIGHTS_KEY]: JSON.stringify(insights),
  });

  return snapshot;
}
