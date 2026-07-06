import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  loadUserLifeProfile,
  loadGuideMemory,
  loadLearningMemory,
  buildStatsInsightSnapshot,
  getAgentEventsForRange,
  recordAgentEvent,
} from "./mylitAgents";
import { persistProgressKeys } from "./progressStore";
import { saveWeeklyHabitSuggestion, saveDailyQuestSuggestion, type SaveWeeklyHabitResult, type SaveDailyQuestResult } from "./pathPipeline";
import { AI_EVIE_PATH_PIPELINES_KEY, LATEST_CHECKIN_KEY, TOMORROW_QUEUE_KEY, DAY_PLAN_KEY } from "./storageKeys";
import { computeUserScheduledMinutesByKindForDay, getMaxProgressMinutes, getQuestCapacityMinutes } from "./questProgress";
import { getDateKey, type WeekdayName } from "./scheduling";
import type {
  AgentEventMode,
  DailyQuestSuggestion,
  EvieAiDailyQuestSuggestion,
  EvieAiPathPipelineRecord,
  EvieAiPathPipelineRequest,
  EvieAiPathPipelineResponse,
  EvieAiWeeklyHabitSuggestion,
  WeeklyHabitSuggestion,
} from "./agentTypes";

// Client-safe helper for Evie's AI Path Pipeline. Calls the server-only route at
// /api/agents/evie-path-pipeline (see api/agents/evie-path-pipeline.ts) — this file never
// touches an API key, an OpenAI client, or any secret. It only gathers already-local
// context, calls the route, and saves the returned SUGGESTIONS (never active quests/habits)
// under AI_EVIE_PATH_PIPELINES_KEY.

const HISTORY_CAP = 20;
const RECENT_EVENTS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const RECENT_EVENTS_LIMIT = 40;
const REQUEST_TIMEOUT_MS = 45000;

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

async function loadCheckInContext(): Promise<{ energy: number; mode: AgentEventMode; boardMode: "Progress" | "Recovery" }> {
  const checkIn = await readJson<{ energy?: number; mode?: string } | null>(LATEST_CHECKIN_KEY, null);
  const energy = typeof checkIn?.energy === "number" ? checkIn.energy : 50;
  const boardMode: "Progress" | "Recovery" = checkIn?.mode === "Recovery" ? "Recovery" : "Progress";
  const mode: AgentEventMode = checkIn ? (boardMode === "Recovery" ? "recovery" : "progress") : "neutral";
  return { energy, mode, boardMode };
}

async function loadTodayConstraints(boardMode: "Progress" | "Recovery") {
  const dateKey = getDateKey();
  const weekday = new Date().toLocaleDateString([], { weekday: "long" }) as WeekdayName;
  const [queue, dayPlan] = await Promise.all([
    readJson<Record<string, unknown>[]>(TOMORROW_QUEUE_KEY, []),
    readJson<Record<string, unknown>>(DAY_PLAN_KEY, {}),
  ]);

  const { progressMinutes, totalMinutes } = computeUserScheduledMinutesByKindForDay({
    dateKey,
    weekday,
    quickThoughts: queue as never,
    dayPlan: dayPlan as never,
  });

  const maxProgressMinutesToday = Math.max(0, getMaxProgressMinutes(boardMode) - progressMinutes);
  const maxRecoveryMinutesToday = Math.max(0, getQuestCapacityMinutes(boardMode) - totalMinutes);
  return { maxProgressMinutesToday, maxRecoveryMinutesToday };
}

export type RequestEviePathPipelineResult =
  | { ok: true; record: EvieAiPathPipelineRecord }
  | { ok: false; error: string };

/** Gathers local context, asks the server route to build a plan, and saves the result (a suggestion, not an active quest/habit). */
export async function requestEviePathPipeline(userPrompt: string): Promise<RequestEviePathPipelineResult> {
  const [lifeProfile, guideMemory, learningMemory, statsInsights, checkInContext] = await Promise.all([
    loadUserLifeProfile(),
    loadGuideMemory(),
    loadLearningMemory(),
    buildStatsInsightSnapshot(),
    loadCheckInContext(),
  ]);

  const [recentAgentEvents, constraints] = await Promise.all([
    getAgentEventsForRange(Date.now() - RECENT_EVENTS_WINDOW_MS, Date.now()),
    loadTodayConstraints(checkInContext.boardMode),
  ]);

  const request: EvieAiPathPipelineRequest = {
    userPrompt: userPrompt.trim(),
    lifeProfile,
    guideMemory,
    learningMemory,
    statsInsights,
    recentAgentEvents: recentAgentEvents.slice(0, RECENT_EVENTS_LIMIT),
    currentEnergy: checkInContext.energy,
    currentMode: checkInContext.mode,
    constraints,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: EvieAiPathPipelineResponse;
  try {
    const res = await fetch("/api/agents/evie-path-pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: "Evie couldn't reach her planning brain right now — try again in a moment." };
    }
    response = (await res.json()) as EvieAiPathPipelineResponse;
  } catch {
    return { ok: false, error: "Evie couldn't reach her planning brain right now — check your connection and try again." };
  } finally {
    clearTimeout(timeout);
  }

  const record: EvieAiPathPipelineRecord = {
    id: `evie-ai-pipeline-${Date.now()}`,
    createdAt: new Date().toISOString(),
    userPrompt: request.userPrompt,
    response,
  };

  const existing = await readJson<EvieAiPathPipelineRecord[]>(AI_EVIE_PATH_PIPELINES_KEY, []);
  const next = [record, ...existing].slice(0, HISTORY_CAP);
  await persistProgressKeys({ [AI_EVIE_PATH_PIPELINES_KEY]: JSON.stringify(next) });

  void recordAgentEvent({
    type: "path_updated",
    sourcePage: "path-ai-pipeline",
    relatedItemId: record.id,
    mode: checkInContext.mode,
    metadata: { status: response.status, goalDomain: response.goalDomain },
  });

  return { ok: true, record };
}

/** Newest saved AI pipeline run, if any — used to restore the Path screen on revisit. */
export async function loadLatestEvieAiPathPipeline(): Promise<EvieAiPathPipelineRecord | null> {
  const existing = await readJson<EvieAiPathPipelineRecord[]>(AI_EVIE_PATH_PIPELINES_KEY, []);
  return existing[0] ?? null;
}

// ---------------------------------------------------------------------------
// Save adapters — convert an AI suggestion into the SAME shape the deterministic
// pipeline already uses, then save through the existing validated helpers
// (checkUserScheduledQuestCapacity, day/board caps, etc. all still apply). This is the
// validation layer: nothing an AI suggests can skip MYLIT's normal quest/habit rules.
// ---------------------------------------------------------------------------

const VALID_WEEKDAYS: WeekdayName[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Only Today's Quest may ever use a 2-hour duration — this pipeline always saves into the
 * Quick Thought queue (never Today's Quest), so every suggestion is clamped onto the same
 * 15/30/45/60 ladder the rest of that queue uses, regardless of what the model suggested.
 */
function clampToQuestLadder(minutes: number): 15 | 30 | 45 | 60 {
  const ladder = [15, 30, 45, 60] as const;
  let best: 15 | 30 | 45 | 60 = 15;
  for (const step of ladder) {
    if (minutes >= step) best = step;
  }
  return best;
}

function bucketTimeWindow(text: string): "morning" | "afternoon" | "evening" | "late night" {
  const lower = text.toLowerCase();
  if (/(evening)/.test(lower)) return "evening";
  if (/(night)/.test(lower)) return "late night";
  if (/(morning|breakfast|\bam\b)/.test(lower)) return "morning";
  return "afternoon";
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "ai-suggestion"
  );
}

export function adaptAiDailyQuestSuggestion(ai: EvieAiDailyQuestSuggestion): DailyQuestSuggestion {
  return {
    id: `evie-ai-quest-${slugify(ai.title)}-${Date.now()}`,
    title: ai.title,
    category: ai.source === "stats_pattern" ? "stats pattern" : ai.source === "research_brief" ? "research brief" : "Evie AI suggestion",
    durationMinutes: clampToQuestLadder(ai.durationMinutes),
    kind: ai.mode,
    suggestedTimeWindow: bucketTimeWindow(ai.suggestedTimeWindow),
    rationale: ai.reason,
  };
}

export function adaptAiWeeklyHabitSuggestion(ai: EvieAiWeeklyHabitSuggestion): WeeklyHabitSuggestion {
  const days = ai.repeatDays
    .map((day) => VALID_WEEKDAYS.find((valid) => valid.toLowerCase() === day.trim().toLowerCase()))
    .filter((day): day is WeekdayName => Boolean(day));

  return {
    id: `evie-ai-habit-${slugify(ai.title)}-${Date.now()}`,
    title: ai.title,
    suggestedDays: days.length ? days : ["Monday", "Wednesday", "Friday"],
    durationMinutes: clampToQuestLadder(ai.durationMinutes),
    kind: ai.mode,
    rationale: ai.reason,
  };
}

export async function saveAiDailyQuestSuggestion(ai: EvieAiDailyQuestSuggestion, boardMode: "Progress" | "Recovery"): Promise<SaveDailyQuestResult> {
  return saveDailyQuestSuggestion(adaptAiDailyQuestSuggestion(ai), boardMode);
}

export async function saveAiWeeklyHabitSuggestion(ai: EvieAiWeeklyHabitSuggestion): Promise<SaveWeeklyHabitResult> {
  return saveWeeklyHabitSuggestion(adaptAiWeeklyHabitSuggestion(ai));
}
