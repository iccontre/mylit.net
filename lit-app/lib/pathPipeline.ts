import AsyncStorage from "@react-native-async-storage/async-storage";

import { persistProgressKeys } from "./progressStore";
import { recordAgentEvent, resolveStrongestSkillLabels } from "./mylitAgents";
import { DAY_PLAN_KEY, TOMORROW_QUEUE_KEY } from "./storageKeys";
import { checkUserScheduledQuestCapacity } from "./questProgress";
import { formatDurationLabel, getDateKey, getStepsForItem, type WeekdayName } from "./scheduling";
import type {
  UserLifeProfile,
  LearningMemory,
  StatsInsight,
  UserDreamGoal,
  UserDreamGoalSource,
  ThreeMonthDirection,
  OneMonthMilestone,
  TwoWeekSprint,
  WeeklyHabitSuggestion,
  DailyQuestSuggestion,
  ReflectionPromptSuggestion,
  PathPipeline,
} from "./agentTypes";

// Evie's first personalized pipeline generator (see .agent/docs/MYLIT_AGENT_ARCHITECTURE.md).
// Dream/identity goal -> 3-month direction -> 1-month milestone -> 2-week sprint -> weekly
// habit -> daily quests -> reflection loop. Every function here is a pure template over
// whatever the user actually typed into UserLifeProfile — it works for ANY goal (career,
// fitness, friendship, confidence, a startup, recovering from burnout...) because it never
// looks the goal text up in a fixed category table, it just builds around the user's own
// words. No AI calls anywhere in this file.

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "goal";
}

type TimeOfDayWindow = "morning" | "afternoon" | "evening" | "late night";

const WINDOW_TO_TIME_SLOT: Record<TimeOfDayWindow, string> = {
  morning: "9:00 AM",
  afternoon: "2:00 PM",
  evening: "6:00 PM",
  "late night": "9:00 PM",
};

// ---------------------------------------------------------------------------
// Dream/goal selection — the one place that decides which UserLifeProfile field
// the whole pipeline is built around. Priority: the two explicit "big picture"
// fields first, then whichever specific goal category the user has actually filled in.
// ---------------------------------------------------------------------------

function pickUserDreamGoal(profile: UserLifeProfile): UserDreamGoal | null {
  const candidates: { source: UserDreamGoalSource; text?: string }[] = [
    { source: "longTermDreamStatement", text: profile.longTermDreamStatement },
    { source: "futureSelfStatement", text: profile.futureSelfStatement },
    { source: "careerGoals", text: profile.careerGoals },
    { source: "bodyHealthGoals", text: profile.bodyHealthGoals },
    { source: "friendshipSocialGoals", text: profile.friendshipSocialGoals },
    { source: "purposeGoals", text: profile.purposeGoals },
    { source: "confidenceGoals", text: profile.confidenceGoals },
  ];
  const found = candidates.find((c) => c.text && c.text.trim());
  if (!found?.text) return null;
  return { goalText: found.text.trim(), source: found.source };
}

function buildThreeMonthDirection(dreamGoal: UserDreamGoal, profile: UserLifeProfile): ThreeMonthDirection {
  const obstacleNote = profile.currentObstacles?.trim() ? ` even with ${profile.currentObstacles.trim()} in the way` : "";
  const focusAreas = [
    "Consistency over intensity — small repeatable steps beat occasional big pushes.",
  ];
  if (profile.confidenceGoals?.trim() && dreamGoal.source !== "confidenceGoals") {
    focusAreas.push(`Confidence: ${profile.confidenceGoals.trim()}`);
  }
  if (profile.bodyHealthGoals?.trim() && dreamGoal.source !== "bodyHealthGoals") {
    focusAreas.push(`Body/health: ${profile.bodyHealthGoals.trim()}`);
  }
  const strongestSkillLabels = resolveStrongestSkillLabels(profile);
  if (strongestSkillLabels.length > 0) {
    focusAreas.push(`Strongest areas right now: ${strongestSkillLabels.join(", ")} — lean into these first, expand from there.`);
  }

  return {
    headline: `Over the next 3 months, keep moving toward: ${dreamGoal.goalText}${obstacleNote}.`,
    focusAreas: focusAreas.slice(0, 3),
    computedAt: new Date().toISOString(),
  };
}

function buildOneMonthMilestone(dreamGoal: UserDreamGoal): OneMonthMilestone {
  return {
    headline: `This month: take one concrete step toward "${dreamGoal.goalText}."`,
    concreteStep:
      "Pick the single most important skill, habit, or connection this goal needs right now, and practice or build it every week this month.",
    computedAt: new Date().toISOString(),
  };
}

export function generateTwoWeekSprint(dreamGoal: UserDreamGoal, profile: UserLifeProfile): TwoWeekSprint {
  const focus =
    profile.motivationStyle === "direct"
      ? "Pick one action and repeat it daily, no matter how small — momentum beats motivation."
      : profile.motivationStyle === "gentle"
        ? "Pick one small, kind step you can repeat without dread — consistency matters more than size."
        : "Pick one repeatable action you can realistically keep up for two weeks.";

  return {
    headline: `For the next 2 weeks: build one repeatable habit that moves "${dreamGoal.goalText}" forward.`,
    focus,
    computedAt: new Date().toISOString(),
  };
}

export function generateWeeklyHabitSuggestions(profile: UserLifeProfile, memory: LearningMemory): WeeklyHabitSuggestion[] {
  const dreamGoal = pickUserDreamGoal(profile);
  if (!dreamGoal) return [];

  const bestWindow = (memory.bestProgressTimeWindows?.[0] as TimeOfDayWindow | undefined) ?? undefined;
  const reduceWeekend = (memory.overloadPatterns ?? []).some((pattern) => /weekend/i.test(pattern));
  const suggestedDays: WeekdayName[] = reduceWeekend
    ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    : ["Monday", "Wednesday", "Friday"];

  return [
    {
      id: `habit-${slugify(dreamGoal.goalText)}`,
      title: `Work toward: ${dreamGoal.goalText}`,
      suggestedDays,
      suggestedTimeWindow: bestWindow,
      durationMinutes: 30,
      kind: "progress",
      rationale: reduceWeekend ? "Weekdays only — weekends have been harder to keep up with." : undefined,
    },
  ];
}

export function generateDailyQuestSuggestions(profile: UserLifeProfile, memory: LearningMemory): DailyQuestSuggestion[] {
  const dreamGoal = pickUserDreamGoal(profile);
  const suggestions: DailyQuestSuggestion[] = [];
  const preferredDuration = memory.preferredQuestDurations?.length ? Math.min(...memory.preferredQuestDurations) : 30;

  if (dreamGoal) {
    suggestions.push({
      id: `quest-progress-${slugify(dreamGoal.goalText)}`,
      title: `Small step toward: ${dreamGoal.goalText}`,
      category: "skill practice",
      durationMinutes: preferredDuration,
      kind: "progress",
      suggestedTimeWindow: memory.bestProgressTimeWindows?.[0],
      rationale: memory.preferredQuestDurations?.length ? "Sized to match durations you actually complete." : undefined,
    });
  }

  if (profile.recoveryActivitiesThatHelp?.trim()) {
    suggestions.push({
      id: `quest-recovery-${slugify(profile.recoveryActivitiesThatHelp)}`,
      title: profile.recoveryActivitiesThatHelp.trim(),
      category: "recovery",
      durationMinutes: 15,
      kind: "recovery",
      rationale: "A recovery activity you told MYLIT actually helps.",
    });
  }

  return suggestions;
}

function buildReflectionPrompt(profile: UserLifeProfile): ReflectionPromptSuggestion {
  const tone = profile.motivationStyle ?? "balanced";
  const prompt =
    tone === "direct"
      ? "What's the one thing you're avoiding that would actually move this forward?"
      : tone === "gentle"
        ? "What's one small win from today, even if it wasn't part of the plan?"
        : "What moved you forward today, and what got in the way?";
  return { prompt, tone };
}

// ---------------------------------------------------------------------------
// Learning feedback — adjusts the pipeline using longer-term LearningMemory patterns
// and (separately) the most recent StatsInsight[] snapshot. Kept as two functions so
// callers can apply either independently, matching the spec's separate names.
// ---------------------------------------------------------------------------

export function adjustPipelineFromLearningMemory(pipeline: PathPipeline, memory: LearningMemory): PathPipeline {
  let dailyQuests = pipeline.dailyQuests;
  let weeklyHabit = pipeline.weeklyHabit;

  // If the user misses long quests, shorten suggestions to their shortest reliably-completed duration.
  if (memory.preferredQuestDurations?.length) {
    const shortest = Math.min(...memory.preferredQuestDurations);
    dailyQuests = dailyQuests.map((quest) => ({ ...quest, durationMinutes: Math.min(quest.durationMinutes, shortest) }));
  }

  // If late tasks tend to get missed, shift progress suggestions earlier.
  const worstWindows = memory.worstProgressTimeWindows ?? [];
  const lateRisk = worstWindows.includes("evening") || worstWindows.includes("late night");
  if (lateRisk) {
    dailyQuests = dailyQuests.map((quest) =>
      quest.kind === "progress"
        ? {
            ...quest,
            suggestedTimeWindow: quest.suggestedTimeWindow && quest.suggestedTimeWindow !== "evening" && quest.suggestedTimeWindow !== "late night" ? quest.suggestedTimeWindow : "morning",
            rationale: [quest.rationale, "Shifted earlier — evening/late tasks tend to get missed for you."].filter(Boolean).join(" "),
          }
        : quest
    );
    if (weeklyHabit) weeklyHabit = { ...weeklyHabit, suggestedTimeWindow: weeklyHabit.suggestedTimeWindow ?? "morning" };
  }

  // If recovery has been helping, lead with recovery before progress.
  const recoveryHelping = (memory.recentWins ?? []).some((win) => /recovery/i.test(win));
  if (recoveryHelping) {
    dailyQuests = [...dailyQuests].sort((a, b) => Number(b.kind === "recovery") - Number(a.kind === "recovery"));
  }

  // If weekends tend to fail, keep the weekly habit off Saturday/Sunday.
  const weekendRisk = (memory.overloadPatterns ?? []).some((pattern) => /weekend/i.test(pattern));
  if (weekendRisk && weeklyHabit) {
    weeklyHabit = { ...weeklyHabit, suggestedDays: weeklyHabit.suggestedDays.filter((day) => day !== "Saturday" && day !== "Sunday") };
  }

  // The user's own Weekly Habit text on a day (e.g. "Rest Day" on Saturday) is guidance, not
  // a hard rule — a habit suggestion never lands on a day the user has already marked as
  // rest-oriented themselves.
  const weekdayIntensity = memory.weekdayIntensity ?? {};
  const restOrientedDays = new Set(Object.entries(weekdayIntensity).filter(([, intensity]) => intensity === "rest_oriented").map(([day]) => day));
  if (restOrientedDays.size && weeklyHabit) {
    const trimmedDays = weeklyHabit.suggestedDays.filter((day) => !restOrientedDays.has(day));
    if (trimmedDays.length) weeklyHabit = { ...weeklyHabit, suggestedDays: trimmedDays };
  }

  // Recent Recovery-vs-Progress trend nudges default difficulty: mostly-Recovery days lead
  // with recovery and shorten progress work; mostly-Progress days with real completion data
  // can afford a small step up, never past the existing duration ladder.
  if (memory.recentModeTrend === "recovery_heavy") {
    dailyQuests = dailyQuests
      .map((quest) => (quest.kind === "progress" ? { ...quest, durationMinutes: Math.min(quest.durationMinutes, 15) } : quest))
      .sort((a, b) => Number(b.kind === "recovery") - Number(a.kind === "recovery"));
  } else if (memory.recentModeTrend === "progress_heavy" && (memory.recentWins ?? []).length > 0) {
    const nextRung = (minutes: number) => (minutes < 30 ? 30 : minutes < 45 ? 45 : minutes < 60 ? 60 : minutes);
    dailyQuests = dailyQuests.map((quest) => (quest.kind === "progress" ? { ...quest, durationMinutes: nextRung(quest.durationMinutes) } : quest));
  }

  return { ...pipeline, dailyQuests, weeklyHabit, computedAt: new Date().toISOString() };
}

export function updatePipelineAfterStatsInsight(pipeline: PathPipeline, insights: StatsInsight[]): PathPipeline {
  let dailyQuests = pipeline.dailyQuests;
  let weeklyHabit = pipeline.weeklyHabit;
  let reflectionPrompt = pipeline.reflectionPrompt;

  if (insights.some((insight) => insight.id === "needs_shorter_quests" || insight.id === "shorter_quests_completed_more")) {
    dailyQuests = dailyQuests.map((quest) => ({ ...quest, durationMinutes: Math.min(quest.durationMinutes, 15) }));
  }

  if (insights.some((insight) => insight.id === "consistency_dipped" || insight.id === "energy_falling")) {
    reflectionPrompt = { prompt: "No pressure today — what's one small thing that would make tomorrow 1% easier?", tone: "gentle" };
  }

  const overloaded = insights.find((insight) => insight.id === "overloaded_weekday");
  if (overloaded && weeklyHabit) {
    const weekday = overloaded.summary.split(" tends to have")[0];
    weeklyHabit = { ...weeklyHabit, suggestedDays: weeklyHabit.suggestedDays.filter((day) => day !== weekday) };
  }

  return { ...pipeline, dailyQuests, weeklyHabit, reflectionPrompt, computedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Empty pipeline for a user who hasn't entered any dream/goal text yet. */
function emptyPipeline(): PathPipeline {
  return {
    dreamGoal: null,
    threeMonth: null,
    oneMonth: null,
    twoWeek: null,
    weeklyHabit: null,
    dailyQuests: [],
    reflectionPrompt: null,
    computedAt: new Date().toISOString(),
  };
}

export function generatePathPipelineFromLifeProfile(
  profile: UserLifeProfile,
  memory: LearningMemory,
  insights: StatsInsight[]
): PathPipeline {
  const dreamGoal = pickUserDreamGoal(profile);
  if (!dreamGoal) return emptyPipeline();

  let pipeline: PathPipeline = {
    dreamGoal,
    threeMonth: buildThreeMonthDirection(dreamGoal, profile),
    oneMonth: buildOneMonthMilestone(dreamGoal),
    twoWeek: generateTwoWeekSprint(dreamGoal, profile),
    weeklyHabit: generateWeeklyHabitSuggestions(profile, memory)[0] ?? null,
    dailyQuests: generateDailyQuestSuggestions(profile, memory),
    reflectionPrompt: buildReflectionPrompt(profile),
    computedAt: new Date().toISOString(),
  };

  pipeline = adjustPipelineFromLearningMemory(pipeline, memory);
  pipeline = updatePipelineAfterStatsInsight(pipeline, insights);
  return pipeline;
}

// ---------------------------------------------------------------------------
// Integration — saving a suggestion routes through the EXACT same storage keys/shapes
// Day Plan and Quests already read and write, so a saved suggestion behaves identically
// to something the user typed in there directly (same caps, same sync, same Quest Board
// visibility). Nothing here auto-fills anything — these only run when the user taps Save.
// ---------------------------------------------------------------------------

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

export type SaveWeeklyHabitResult = { savedDays: WeekdayName[]; skippedDays: WeekdayName[] };

/**
 * Fills the suggested weekly habit into any EMPTY weekday role slots only — a day that
 * already has a role saved is left untouched, never overwritten.
 */
export async function saveWeeklyHabitSuggestion(suggestion: WeeklyHabitSuggestion): Promise<SaveWeeklyHabitResult> {
  const plan = await readJson<Record<string, unknown>>(DAY_PLAN_KEY, {});
  const weekdayRoles = { ...((plan.weekdayRoles as Record<string, string>) ?? {}) };

  const savedDays: WeekdayName[] = [];
  const skippedDays: WeekdayName[] = [];
  for (const day of suggestion.suggestedDays as WeekdayName[]) {
    if (weekdayRoles[day]?.trim()) {
      skippedDays.push(day);
    } else {
      weekdayRoles[day] = suggestion.title;
      savedDays.push(day);
    }
  }

  if (savedDays.length) {
    await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify({ ...plan, weekdayRoles }) });
    void recordAgentEvent({
      type: "goal_updated",
      sourcePage: "path-pipeline",
      relatedItemId: suggestion.id,
      metadata: { action: "weekly_habit_saved", title: suggestion.title },
    });
  }

  return { savedDays, skippedDays };
}

export type SaveDailyQuestResult = { ok: boolean; reason?: string };

/** Appends the suggested quest to today's Quick Thought queue, respecting the existing day/board caps. */
export async function saveDailyQuestSuggestion(suggestion: DailyQuestSuggestion, boardMode: "Progress" | "Recovery"): Promise<SaveDailyQuestResult> {
  const dateKey = getDateKey();
  const weekday = new Date().toLocaleDateString([], { weekday: "long" }) as WeekdayName;
  const queue = await readJson<Record<string, unknown>[]>(TOMORROW_QUEUE_KEY, []);
  const dayPlan = await readJson<Record<string, unknown>>(DAY_PLAN_KEY, {});

  const alreadyExists = queue.some((item) => item.date === dateKey && (item.text === suggestion.title || item.title === suggestion.title));
  if (alreadyExists) return { ok: false, reason: "Already on today's Quest Board." };

  const capacity = checkUserScheduledQuestCapacity({
    dateKey,
    weekday,
    // Structurally compatible with the private QueueItem shape checkUserScheduledQuestCapacity expects.
    quickThoughts: queue as never,
    dayPlan: dayPlan as never,
    additionalMinutes: suggestion.durationMinutes,
    additionalKind: suggestion.kind,
    boardMode,
  });
  if (!capacity.allowed) {
    return {
      ok: false,
      reason: capacity.blockedByProgressCap
        ? `${boardMode} mode is already at its progress-time limit for today.`
        : "Today's Quest Board is already at its daily limit.",
    };
  }

  const startTime = suggestion.suggestedTimeWindow ? WINDOW_TO_TIME_SLOT[suggestion.suggestedTimeWindow as TimeOfDayWindow] ?? "9:00 AM" : "9:00 AM";
  const steps = getStepsForItem(suggestion.durationMinutes, suggestion.kind);
  const nextItem = {
    id: `pipeline-${slugify(suggestion.title)}-${Date.now()}`,
    source: "quickThought",
    text: suggestion.title,
    title: suggestion.title,
    type: suggestion.kind === "recovery" ? "Recovery Quest" : "Progress Quest",
    classification: suggestion.kind,
    kind: "quickThought",
    date: dateKey,
    weekday,
    time: startTime,
    startTime,
    duration: formatDurationLabel(suggestion.durationMinutes),
    durationMinutes: suggestion.durationMinutes,
    steps,
    status: "scheduled",
    createdAt: new Date().toISOString(),
  };

  await persistProgressKeys({ [TOMORROW_QUEUE_KEY]: JSON.stringify([nextItem, ...queue]) });
  void recordAgentEvent({
    type: "goal_updated",
    sourcePage: "path-pipeline",
    relatedItemId: nextItem.id,
    mode: suggestion.kind,
    durationMinutes: suggestion.durationMinutes,
    metadata: { action: "daily_quest_saved", title: suggestion.title },
  });

  return { ok: true };
}
