import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadUserLifeProfile, loadLearningMemory, buildStatsInsightSnapshot, buildGuidePatternContext, recordAgentEvent } from "./mylitAgents";
import { loadLatestEvieAiPathPipeline } from "./evieAiPathPipeline";
import { loadActiveGuideContext } from "./guideContext";
import { generatePathPipelineFromLifeProfile, saveDailyQuestSuggestion, type SaveDailyQuestResult } from "./pathPipeline";
import { persistProgressKeys } from "./progressStore";
import { AI_LUNA_SUPPORT_SESSIONS_KEY, CHECKIN_HISTORY_KEY, LATEST_CHECKIN_KEY, MISSED_QUESTS_KEY, REFLECTIONS_KEY, TOMORROW_QUEUE_KEY } from "./storageKeys";
import type { MissedEntry } from "./questProgress";
import {
  formatDurationLabel,
  generateTimeSlots,
  getDateKey,
  getStepsForItem,
  parseDurationMinutes,
  shiftTimeSlot,
  wouldCrossMidnight,
} from "./scheduling";
import type {
  AgentEventMode,
  DailyQuestSuggestion,
  LunaActiveQuestSummary,
  LunaCurrentPathPipelineSummary,
  LunaRecoveryQuestSuggestion,
  LunaReflectionSummary,
  LunaSleepContext,
  LunaSupportModifierRecord,
  LunaSupportModifierRequest,
  LunaSupportModifierResponse,
} from "./agentTypes";

// Client-safe helper for Luna's AI Support Modifier. Calls the server-only route at
// /api/agents/luna-support-modifier (see api/agents/luna-support-modifier.ts) — this file
// never touches an API key or any secret. It only gathers already-local context, calls the
// route, and lets the user individually accept SUGGESTIONS (never an automatic change).

const HISTORY_CAP = 20;
const REQUEST_TIMEOUT_MS = 45000;
const TIME_SLOTS = generateTimeSlots();

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

async function loadCurrentPathPipelineSummary(): Promise<LunaCurrentPathPipelineSummary | null> {
  const latestAi = await loadLatestEvieAiPathPipeline();
  if (latestAi) {
    return {
      goalText: latestAi.response.goalSummary,
      threeMonthHeadline: latestAi.response.threeMonthDirection?.title,
      twoWeekHeadline: latestAi.response.twoWeekSprint?.title,
    };
  }
  const [profile, memory, insights] = await Promise.all([loadUserLifeProfile(), loadLearningMemory(), buildStatsInsightSnapshot()]);
  const deterministic = generatePathPipelineFromLifeProfile(profile, memory, insights);
  if (!deterministic.dreamGoal) return null;
  return {
    goalText: deterministic.dreamGoal.goalText,
    threeMonthHeadline: deterministic.threeMonth?.headline,
    twoWeekHeadline: deterministic.twoWeek?.headline,
  };
}

/** Rough, non-medical read on how closely recent nights have matched a healthy ~7-9h window. */
async function computeSleepGuideAdherence(): Promise<LunaSleepContext["sleepGuideAdherence"]> {
  const history = await readJson<Array<{ effectiveSleepMinutes?: number; createdAt?: string }>>(CHECKIN_HISTORY_KEY, []);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentMinutes = history
    .filter((entry) => entry.createdAt && new Date(entry.createdAt).getTime() >= cutoff && typeof entry.effectiveSleepMinutes === "number")
    .map((entry) => entry.effectiveSleepMinutes as number);
  if (recentMinutes.length < 3) return "unknown";
  const goodNights = recentMinutes.filter((minutes) => minutes >= 6.5 * 60).length;
  return goodNights / recentMinutes.length >= 0.6 ? "good" : "inconsistent";
}

async function loadCheckInContext(): Promise<{ recentEnergy: number; currentMode: AgentEventMode; boardMode: "Progress" | "Recovery"; sleepContext: LunaSleepContext }> {
  const [checkIn, sleepGuideAdherence] = await Promise.all([
    readJson<{ energy?: number; mode?: string; effectiveSleepMinutes?: number; interrupted?: boolean; hadCaffeine?: boolean; caffeineTime?: string } | null>(
      LATEST_CHECKIN_KEY,
      null
    ),
    computeSleepGuideAdherence(),
  ]);
  const recentEnergy = typeof checkIn?.energy === "number" ? checkIn.energy : 50;
  const boardMode: "Progress" | "Recovery" = checkIn?.mode === "Recovery" ? "Recovery" : "Progress";
  const currentMode: AgentEventMode = checkIn ? (boardMode === "Recovery" ? "recovery" : "progress") : "neutral";
  return {
    recentEnergy,
    currentMode,
    boardMode,
    sleepContext: {
      effectiveSleepMinutes: checkIn?.effectiveSleepMinutes,
      interrupted: checkIn?.interrupted,
      caffeineTime: checkIn?.hadCaffeine ? checkIn.caffeineTime : undefined,
      sleepGuideAdherence,
    },
  };
}

async function loadRecentMisses(): Promise<{ title: string; dateKey: string }[]> {
  const missed = await readJson<MissedEntry[]>(MISSED_QUESTS_KEY, []);
  return missed
    .slice()
    .sort((a, b) => new Date(b.missedAt).getTime() - new Date(a.missedAt).getTime())
    .slice(0, 5)
    .map((entry) => ({ title: entry.title, dateKey: entry.dateKey }));
}

/** Only a short, truncated excerpt — never the full reflection entry — is ever sent to the server. */
async function loadReflectionSummary(): Promise<LunaReflectionSummary | null> {
  const reflections = await readJson<Array<{ quest?: string; whatGotInTheWay?: string }>>(REFLECTIONS_KEY, []);
  const latest = reflections[0];
  if (!latest?.whatGotInTheWay?.trim()) return null;
  return { quest: (latest.quest ?? "").slice(0, 80), whatGotInTheWay: latest.whatGotInTheWay.trim().slice(0, 160) };
}

async function loadActiveQuests(): Promise<LunaActiveQuestSummary[]> {
  const dateKey = getDateKey();
  const queue = await readJson<Record<string, unknown>[]>(TOMORROW_QUEUE_KEY, []);
  return queue
    .filter((item) => (item.date === dateKey || item.dateKey === dateKey) && item.status !== "completed" && item.status !== "expired")
    .map((item) => ({
      id: String(item.id),
      title: String(item.title ?? item.text ?? "Quest"),
      kind: item.classification === "recovery" ? "recovery" : ("progress" as const),
      durationMinutes: parseDurationMinutes((item.durationMinutes as number | undefined) ?? (item.duration as string | undefined), 30),
      startTime: (item.startTime as string | undefined) ?? (item.time as string | undefined),
      status: String(item.status ?? "scheduled"),
    }));
}

export type RequestLunaSupportResult = { ok: true; record: LunaSupportModifierRecord } | { ok: false; error: string };

/** Gathers local context, asks the server route for support + suggestions, and saves the session (suggestions only — no automatic change). */
export async function requestLunaSupport(userMessage: string): Promise<RequestLunaSupportResult> {
  const [currentPathPipeline, checkInContext, recentMisses, reflectionSummary, activeQuests, learningMemory, patternContext, permittedContext] = await Promise.all([
    loadCurrentPathPipelineSummary(),
    loadCheckInContext(),
    loadRecentMisses(),
    loadReflectionSummary(),
    loadActiveQuests(),
    loadLearningMemory(),
    buildGuidePatternContext(),
    loadActiveGuideContext("luna"),
  ]);

  // Explicit, consent-based context ("Feed to Luna") — never automatic access to any entry.
  // Folded into the free-text message field (already unstructured, already sent to the model
  // as-is) rather than a new schema field, so no server-side JSON schema change is needed.
  const permittedContextNote =
    permittedContext.length > 0
      ? `\n\nContext I've explicitly shared with you:\n${permittedContext.map((r) => `- (${r.sourceType}) ${r.sourceTextSnapshot}`).join("\n")}`
      : "";

  const request: LunaSupportModifierRequest = {
    userMessage: `${userMessage.trim()}${permittedContextNote}`,
    currentPathPipeline,
    recentMisses,
    recentEnergy: checkInContext.recentEnergy,
    sleepContext: checkInContext.sleepContext,
    reflectionSummary,
    learningMemory,
    currentMode: checkInContext.currentMode,
    activeQuests,
    patternContext,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: LunaSupportModifierResponse;
  try {
    const res = await fetch("/api/agents/luna-support-modifier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: "Luna couldn't reach her support brain right now — try again in a moment." };
    }
    response = (await res.json()) as LunaSupportModifierResponse;
  } catch {
    return { ok: false, error: "Luna couldn't reach her support brain right now — check your connection and try again." };
  } finally {
    clearTimeout(timeout);
  }

  const record: LunaSupportModifierRecord = {
    id: `luna-support-${Date.now()}`,
    createdAt: new Date().toISOString(),
    userMessage: request.userMessage,
    response,
  };

  const existing = await readJson<LunaSupportModifierRecord[]>(AI_LUNA_SUPPORT_SESSIONS_KEY, []);
  const next = [record, ...existing].slice(0, HISTORY_CAP);
  await persistProgressKeys({ [AI_LUNA_SUPPORT_SESSIONS_KEY]: JSON.stringify(next) });

  void recordAgentEvent({
    type: "path_updated",
    sourcePage: "luna-support",
    relatedItemId: record.id,
    mode: checkInContext.currentMode,
    metadata: { action: "luna_support_requested", status: response.status },
  });

  return { ok: true, record };
}

/** Newest saved Luna support session, if any. */
export async function loadLatestLunaSupportSession(): Promise<LunaSupportModifierRecord | null> {
  const existing = await readJson<LunaSupportModifierRecord[]>(AI_LUNA_SUPPORT_SESSIONS_KEY, []);
  return existing[0] ?? null;
}

// ---------------------------------------------------------------------------
// Apply adjustments — every applier below only ever narrows/loosens existing caps (shortens
// a duration, swaps progress time for recovery time, or shifts within the same-day board and
// refuses anything that would cross midnight), so none of them can violate MYLIT's existing
// quest rules. This is the validation layer: nothing Luna suggests can skip those rules.
// ---------------------------------------------------------------------------

export type ApplyLunaAdjustmentResult = { ok: boolean; reason?: string };

async function loadQuickThoughtQueue(): Promise<Record<string, unknown>[]> {
  return readJson<Record<string, unknown>[]>(TOMORROW_QUEUE_KEY, []);
}

async function saveQuickThoughtQueue(queue: Record<string, unknown>[]): Promise<void> {
  await persistProgressKeys({ [TOMORROW_QUEUE_KEY]: JSON.stringify(queue) });
}

const QUEST_LADDER = [15, 30, 45, 60] as const;

function clampToQuestLadder(minutes: number): 15 | 30 | 45 | 60 {
  let best: 15 | 30 | 45 | 60 = 15;
  for (const step of QUEST_LADDER) {
    if (minutes >= step) best = step;
  }
  return best;
}

function stepDown(minutes: number): 15 | 30 | 45 | 60 {
  const clamped = clampToQuestLadder(minutes);
  const idx = QUEST_LADDER.indexOf(clamped);
  return QUEST_LADDER[Math.max(0, idx - 1)];
}

/** Only the Quick Thought queue is targetable — Day Plan / Today's Quest have their own dedicated screens and are out of scope here. */
async function findQueueIndex(queue: Record<string, unknown>[], targetQuestId: string): Promise<number> {
  return queue.findIndex((item) => String(item.id) === targetQuestId);
}

export async function applyReduceDuration(targetQuestId: string, suggestedDurationMinutes?: number): Promise<ApplyLunaAdjustmentResult> {
  const queue = await loadQuickThoughtQueue();
  const index = await findQueueIndex(queue, targetQuestId);
  if (index === -1) return { ok: false, reason: "Could not find that quest to adjust — it may have already changed." };

  const item = queue[index] as Record<string, unknown>;
  const currentMinutes = clampToQuestLadder(parseDurationMinutes((item.durationMinutes as number | undefined) ?? (item.duration as string | undefined), 30));
  if (currentMinutes <= 15) return { ok: false, reason: "This quest is already at the shortest length." };

  let nextMinutes = typeof suggestedDurationMinutes === "number" ? clampToQuestLadder(suggestedDurationMinutes) : stepDown(currentMinutes);
  if (nextMinutes >= currentMinutes) nextMinutes = stepDown(currentMinutes);

  const kind = item.classification === "recovery" ? "recovery" : "progress";
  const nextQueue = [...queue];
  nextQueue[index] = {
    ...item,
    durationMinutes: nextMinutes,
    duration: formatDurationLabel(nextMinutes),
    steps: getStepsForItem(nextMinutes, kind),
  };
  await saveQuickThoughtQueue(nextQueue);
  void recordAgentEvent({ type: "path_updated", sourcePage: "luna-support", relatedItemId: targetQuestId, metadata: { action: "reduce_duration", durationMinutes: nextMinutes } });
  return { ok: true };
}

export async function applySwapToRecovery(targetQuestId: string): Promise<ApplyLunaAdjustmentResult> {
  const queue = await loadQuickThoughtQueue();
  const index = await findQueueIndex(queue, targetQuestId);
  if (index === -1) return { ok: false, reason: "Could not find that quest to adjust — it may have already changed." };

  const item = queue[index] as Record<string, unknown>;
  if (item.classification === "recovery") return { ok: false, reason: "That quest is already a Recovery quest." };

  const minutes = parseDurationMinutes((item.durationMinutes as number | undefined) ?? (item.duration as string | undefined), 30);
  const nextQueue = [...queue];
  nextQueue[index] = {
    ...item,
    classification: "recovery",
    type: "Recovery Quest",
    steps: getStepsForItem(minutes, "recovery"),
  };
  await saveQuickThoughtQueue(nextQueue);
  void recordAgentEvent({ type: "path_updated", sourcePage: "luna-support", relatedItemId: targetQuestId, metadata: { action: "swap_progress_for_recovery" } });
  return { ok: true };
}

export async function applyMoveTime(targetQuestId: string, direction: 1 | -1): Promise<ApplyLunaAdjustmentResult> {
  const queue = await loadQuickThoughtQueue();
  const index = await findQueueIndex(queue, targetQuestId);
  if (index === -1) return { ok: false, reason: "Could not find that quest to adjust — it may have already changed." };

  const item = queue[index] as Record<string, unknown>;
  const currentStart = (item.startTime as string | undefined) ?? (item.time as string | undefined) ?? "9:00 AM";
  const durationMinutes = parseDurationMinutes((item.durationMinutes as number | undefined) ?? (item.duration as string | undefined), 30);
  const nextStart = shiftTimeSlot(currentStart, direction, TIME_SLOTS);

  if (wouldCrossMidnight(nextStart, durationMinutes)) {
    return { ok: false, reason: "That would push the quest past midnight — try a smaller shift." };
  }

  const nextQueue = [...queue];
  nextQueue[index] = { ...item, startTime: nextStart, time: nextStart };
  await saveQuickThoughtQueue(nextQueue);
  void recordAgentEvent({
    type: "path_updated",
    sourcePage: "luna-support",
    relatedItemId: targetQuestId,
    metadata: { action: direction === 1 ? "move_later" : "move_earlier" },
  });
  return { ok: true };
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "luna-recovery"
  );
}

export async function saveLunaRecoveryQuestSuggestion(suggestion: LunaRecoveryQuestSuggestion, boardMode: "Progress" | "Recovery"): Promise<SaveDailyQuestResult> {
  const suggestionAsQuest: DailyQuestSuggestion = {
    id: `luna-recovery-${slugify(suggestion.title)}-${Date.now()}`,
    title: suggestion.title,
    category: "Luna recovery suggestion",
    durationMinutes: suggestion.durationMinutes,
    kind: "recovery",
    rationale: suggestion.reason,
  };
  return saveDailyQuestSuggestion(suggestionAsQuest, boardMode);
}
