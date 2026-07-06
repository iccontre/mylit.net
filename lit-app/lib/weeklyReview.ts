import AsyncStorage from "@react-native-async-storage/async-storage";

import { persistProgressKeys } from "./progressStore";
import { COMPLETED_QUESTS_KEY, MISSED_QUESTS_KEY, CHECKIN_HISTORY_KEY, WEEKLY_AGENT_REVIEWS_KEY } from "./storageKeys";
import { loadAgentEventLedger, updateLearningMemoryFromEvents, timeOfDayBucket, isWeekendIso, type TimeOfDayBucket } from "./mylitAgents";
import type { CompletionEntry, MissedEntry } from "./questProgress";
import type { AgentEvent, LearningMemory, WeeklyAgentReview } from "./agentTypes";

// MYLIT's first weekly agent improvement loop (see .agent/docs/MYLIT_AGENT_ARCHITECTURE.md).
// Reviews the user's week and turns it into supportive, non-shame-based adjustments for
// Evie, Luna, and Calendar, then refreshes Learning Memory — which is what those three
// summaries/pipelines already read from, so this is how the loop actually closes. No AI
// calls; every sentence here is a deterministic template over the week's own data.

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

type CheckInLike = { createdAt?: string; interrupted?: boolean; effectiveSleepMinutes?: number; energy?: number };

export type WeekBounds = { weekStart: string; weekEnd: string; startMs: number; endMs: number };

/** Monday-Sunday bounds for the week `offsetWeeks` away from the current one (0 = this week). */
export function getWeekBounds(offsetWeeks = 0): WeekBounds {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day) + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    weekStart: monday.toLocaleDateString("en-CA"),
    weekEnd: sunday.toLocaleDateString("en-CA"),
    startMs: monday.getTime(),
    endMs: sunday.getTime() + 1,
  };
}

function inRange(iso: string | undefined, bounds: WeekBounds): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= bounds.startMs && t < bounds.endMs;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export function summarizeWeeklyWins(completed: CompletionEntry[], missed: MissedEntry[]): string[] {
  const wins: string[] = [];
  const total = completed.length + missed.length;
  if (total === 0) return wins;

  const completionRate = completed.length / total;
  if (total >= 3 && completionRate >= 0.7) {
    wins.push("You completed most of your quests this week.");
  }

  const withDuration = completed.filter((entry) => typeof entry.durationMinutes === "number");
  const shortCompleted = withDuration.filter((entry) => (entry.durationMinutes as number) <= 15).length;
  const longCompleted = withDuration.filter((entry) => (entry.durationMinutes as number) >= 45).length;
  if (shortCompleted >= 3 && shortCompleted > longCompleted) {
    wins.push("You were more consistent with short quests.");
  }

  const recoveryCompleted = completed.filter((entry) => entry.kind === "recovery").length;
  if (recoveryCompleted >= 2) {
    wins.push("You made time for Recovery this week — that counts as real progress too.");
  }

  return wins;
}

export function summarizeWeeklyStruggles(completed: CompletionEntry[], missed: MissedEntry[], events: AgentEvent[], checkins: CheckInLike[]): string[] {
  const struggles: string[] = [];

  if (missed.length >= 3) {
    struggles.push("A handful of quests were missed this week — that happens, not a failure.");
  }

  const questEvents = events.filter((event) => event.type === "quest_completed" || event.type === "quest_missed");
  const buckets = new Map<TimeOfDayBucket, { completed: number; missed: number }>();
  for (const event of questEvents) {
    const bucket = timeOfDayBucket(event.createdAt);
    const stat = buckets.get(bucket) ?? { completed: 0, missed: 0 };
    if (event.type === "quest_completed") stat.completed += 1;
    else stat.missed += 1;
    buckets.set(bucket, stat);
  }
  const eveningStat = buckets.get("evening");
  const lateStat = buckets.get("late night");
  const lateCombined = {
    completed: (eveningStat?.completed ?? 0) + (lateStat?.completed ?? 0),
    missed: (eveningStat?.missed ?? 0) + (lateStat?.missed ?? 0),
  };
  const lateTotal = lateCombined.completed + lateCombined.missed;
  if (lateTotal >= 3 && lateCombined.missed / lateTotal >= 0.5) {
    struggles.push("Late progress tasks were harder this week.");
  }

  const interruptedNights = checkins.filter((c) => c.interrupted).length;
  if (interruptedNights >= 2) {
    struggles.push("Sleep was interrupted more than once this week.");
  }

  return struggles;
}

export function summarizeSleepEnergyPattern(checkins: CheckInLike[]): string {
  const withSleep = checkins.filter((c) => typeof c.effectiveSleepMinutes === "number");
  const withEnergy = checkins.filter((c) => typeof c.energy === "number");
  if (!withSleep.length && !withEnergy.length) {
    return "Not enough sleep/energy check-ins this week to see a pattern yet.";
  }

  const parts: string[] = [];
  if (withSleep.length) {
    const avgHours = withSleep.reduce((sum, c) => sum + (c.effectiveSleepMinutes as number), 0) / withSleep.length / 60;
    parts.push(`Sleep averaged about ${avgHours.toFixed(1)}h a night`);
  }
  if (withEnergy.length >= 2) {
    const first = withEnergy[withEnergy.length - 1].energy as number;
    const last = withEnergy[0].energy as number;
    if (last - first >= 10) parts.push("energy trended up through the week");
    else if (first - last >= 10) parts.push("energy trended down through the week");
    else parts.push("energy stayed fairly steady");
  }
  const interruptedCount = checkins.filter((c) => c.interrupted).length;
  if (interruptedCount >= 2) parts.push(`sleep was interrupted ${interruptedCount} nights`);

  return parts.length ? `${parts.join(", ")}.` : "Not enough sleep/energy check-ins this week to see a pattern yet.";
}

export function summarizeProgressRecoveryBalance(completed: CompletionEntry[]): string {
  const progress = completed.filter((entry) => (entry.kind ?? "progress") === "progress").length;
  const recovery = completed.filter((entry) => entry.kind === "recovery").length;
  const total = progress + recovery;
  if (total === 0) return "No completed quests this week to measure balance from yet.";

  if (recovery === 0 && progress >= 3) return "This week leaned entirely on Progress — no Recovery quests completed.";
  if (progress > recovery * 2) return "This week leaned heavily toward Progress work.";
  if (recovery > progress * 1.5) return "This week leaned heavily toward Recovery — a fair trade if energy was low.";
  return "Progress and Recovery were reasonably balanced this week.";
}

// ---------------------------------------------------------------------------
// Adjustments — always framed as a suggestion, never a verdict.
// ---------------------------------------------------------------------------

export function recommendEvieAdjustment(wins: string[], struggles: string[], memory: LearningMemory): string {
  if (struggles.some((s) => s.includes("Late progress tasks"))) {
    return "Evie suggests one shorter focus block earlier in the day.";
  }
  if (wins.some((w) => w.includes("short quests"))) {
    return "Evie suggests keeping quests short — that's clearly working for you.";
  }
  if (memory.preferredQuestDurations?.length) {
    return `Evie suggests sizing next week's quests around ${Math.min(...memory.preferredQuestDurations)} minutes.`;
  }
  return "Evie suggests picking one small, concrete step toward your goal for next week.";
}

export function recommendLunaAdjustment(sleepEnergyPattern: string, struggles: string[]): string {
  if (struggles.some((s) => s.includes("Sleep was interrupted"))) {
    return "Luna suggests protecting sleep before adding more work next week.";
  }
  if (sleepEnergyPattern.includes("trended down")) {
    return "Luna suggests a lighter, more Recovery-leaning day or two before pushing further.";
  }
  if (sleepEnergyPattern.includes("Not enough")) {
    return "Luna would love a few more sleep check-ins next week to see how you're really doing.";
  }
  return "Luna sees a steady week — keep protecting whatever recovery habits are working.";
}

export function recommendCalendarAdjustment(progressRecoveryPattern: string, struggles: string[]): string {
  const overloadedWeekday = struggles.find((s) => s.includes("tends to have more missed"));
  if (overloadedWeekday) return `Calendar suggests lightening the load on ${overloadedWeekday.split(" tends to have")[0]}.`;
  if (progressRecoveryPattern.includes("leaned entirely on Progress") || progressRecoveryPattern.includes("leaned heavily toward Progress")) {
    return "Calendar suggests scheduling a Recovery block before next week gets heavy again.";
  }
  if (struggles.some((s) => s.includes("Late progress tasks"))) {
    return "Calendar suggests moving Progress tasks earlier in the day next week.";
  }
  return "Calendar suggests keeping next week's Progress/Recovery split about the same — it's working.";
}

function buildNextWeekFocus(evieAdjustment: string, lunaAdjustment: string, wins: string[]): string {
  if (wins.length) return `Keep doing what worked, and: ${evieAdjustment.replace(/^Evie suggests /i, "")}`;
  return `Next week, focus on one thing: ${evieAdjustment.replace(/^Evie suggests /i, "")} ${lunaAdjustment.replace(/^Luna suggests /i, "")}`.trim();
}

// ---------------------------------------------------------------------------
// Orchestrator + storage
// ---------------------------------------------------------------------------

export async function loadWeeklyAgentReviews(): Promise<WeeklyAgentReview[]> {
  return readJson<WeeklyAgentReview[]>(WEEKLY_AGENT_REVIEWS_KEY, []);
}

/**
 * Builds (and persists) the review for the given week. Regenerating the SAME week replaces
 * its entry (matched by id = weekStart) rather than appending a duplicate. Also refreshes
 * Learning Memory — Evie's pipeline, Luna's support summary, and Calendar's planning
 * summary are all pure functions of Learning Memory + insights, so this is how the review
 * actually feeds back into them, rather than needing to push into each separately.
 */
export async function buildWeeklyAgentReview(offsetWeeks = 0): Promise<WeeklyAgentReview> {
  const bounds = getWeekBounds(offsetWeeks);

  const [allCompleted, allMissed, allCheckins, allEvents] = await Promise.all([
    readJson<CompletionEntry[]>(COMPLETED_QUESTS_KEY, []),
    readJson<MissedEntry[]>(MISSED_QUESTS_KEY, []),
    readJson<CheckInLike[]>(CHECKIN_HISTORY_KEY, []),
    loadAgentEventLedger(),
  ]);

  const completed = allCompleted.filter((entry) => inRange(entry.completedAt, bounds));
  const missed = allMissed.filter((entry) => inRange(entry.missedAt, bounds));
  const checkins = allCheckins.filter((entry) => inRange(entry.createdAt, bounds));
  const events = allEvents.filter((event) => inRange(event.createdAt, bounds));

  const wins = summarizeWeeklyWins(completed, missed);
  const struggles = summarizeWeeklyStruggles(completed, missed, events, checkins);
  const sleepEnergyPattern = summarizeSleepEnergyPattern(checkins);
  const progressRecoveryPattern = summarizeProgressRecoveryBalance(completed);

  // Weekday-overload check folded in here (rather than a separate exported function) since
  // it needs the SAME in-range `missed` list summarizeWeeklyStruggles already has.
  if (missed.length >= 3) {
    const weekdayCounts = new Map<string, number>();
    for (const entry of missed) {
      const weekday = new Date(`${entry.dateKey}T00:00:00`).toLocaleDateString([], { weekday: "long" });
      weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
    }
    const sorted = Array.from(weekdayCounts.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length && sorted[0][1] >= Math.max(2, missed.length * 0.4)) {
      struggles.push(`${sorted[0][0]} tends to have more missed quests than other days this week.`);
    }
  }

  const memory = await updateLearningMemoryFromEvents();

  const evieAdjustment = recommendEvieAdjustment(wins, struggles, memory);
  const lunaAdjustment = recommendLunaAdjustment(sleepEnergyPattern, struggles);
  const calendarAdjustment = recommendCalendarAdjustment(progressRecoveryPattern, struggles);
  const suggestedNextWeekFocus = buildNextWeekFocus(evieAdjustment, lunaAdjustment, wins);

  const review: WeeklyAgentReview = {
    id: bounds.weekStart,
    weekStart: bounds.weekStart,
    weekEnd: bounds.weekEnd,
    wins,
    struggles,
    sleepEnergyPattern,
    progressRecoveryPattern,
    evieAdjustment,
    lunaAdjustment,
    calendarAdjustment,
    suggestedNextWeekFocus,
    createdAt: new Date().toISOString(),
  };

  const existing = await loadWeeklyAgentReviews();
  const next = [review, ...existing.filter((entry) => entry.id !== review.id)];
  await persistProgressKeys({ [WEEKLY_AGENT_REVIEWS_KEY]: JSON.stringify(next) });

  return review;
}
