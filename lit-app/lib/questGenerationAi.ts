import {
  loadUserLifeProfile,
  loadLearningMemory,
  buildGuidePatternContext,
} from "./mylitAgents";
import { loadActiveGuideContext } from "./guideContext";
import { persistProgressKeys } from "./progressStore";
import { readJson } from "./readJson";
import { QUEST_GENERATION_RESULTS_KEY, DAY_PLAN_KEY, TOMORROW_QUEUE_KEY } from "./storageKeys";
import { stableHash } from "./hash";
import { loadUserRhythmProfile } from "./userRhythmProfile";
import { saveDailyQuestSuggestion, type SaveDailyQuestResult } from "./pathPipeline";
import { recordGuidePlanFeedback } from "./guidePlanFeedback";
import type {
  DailyQuestSuggestion,
  GeneratedQuestProposal,
  QuestGenerationContext,
  QuestGenerationMilestones,
  QuestGenerationMode,
  QuestGenerationResult,
  QuestGenerationSource,
} from "./agentTypes";

// Client-safe helper for the shared quest-generation contract. Calls the server-only route at
// /api/agents/quest-generation (see api/agents/quest-generation.ts) — never touches an API key.
// Idempotency: results are cached locally (and synced) by requestId under
// QUEST_GENERATION_RESULTS_KEY — calling this again with the SAME requestId always returns the
// SAME saved draft instead of generating (and never saves) a duplicate. Callers that want a
// fresh generation (an explicit "Regenerate") must pass a different requestId.

const HISTORY_CAP = 30;
const REQUEST_TIMEOUT_MS = 45000;

export type RequestQuestGenerationInput = {
  requestId: string;
  logicalDayKey: string;
  source: QuestGenerationSource;
  intention?: string;
  currentEnergy?: number;
  currentMode?: QuestGenerationMode;
  availableMinutes?: number;
  wakeTime?: string;
  sleepTime?: string;
  activeQuestTitles?: string[];
  targetWeekDates?: string[];
  milestones?: QuestGenerationMilestones;
  lunaAccommodationSummary?: string;
};

export type RequestQuestGenerationResult =
  | { ok: true; result: QuestGenerationResult; fromCache: boolean }
  | { ok: false; error: string };

async function loadCalendarSnapshotHash(): Promise<string> {
  const [dayPlan, queue] = await Promise.all([
    readJson<Record<string, unknown>>(DAY_PLAN_KEY, {}),
    readJson<Record<string, unknown>[]>(TOMORROW_QUEUE_KEY, []),
  ]);
  return stableHash(JSON.stringify({ dayPlan, queueLength: queue.length }));
}

async function loadResultHistory(): Promise<QuestGenerationResult[]> {
  return readJson<QuestGenerationResult[]>(QUEST_GENERATION_RESULTS_KEY, []);
}

/** Newest saved result for a given requestId — used both for idempotent cache lookups and to
 *  restore a check-in/onboarding screen's already-generated proposals on reopen (never
 *  auto-regenerating just because the screen re-rendered or the app foregrounded). */
export async function loadCachedQuestGeneration(requestId: string): Promise<QuestGenerationResult | null> {
  const history = await loadResultHistory();
  return history.find((entry) => entry.requestId === requestId) ?? null;
}

export async function requestQuestGeneration(input: RequestQuestGenerationInput): Promise<RequestQuestGenerationResult> {
  const cached = await loadCachedQuestGeneration(input.requestId);
  if (cached) {
    return { ok: true, result: cached, fromCache: true };
  }

  const [lifeProfile, learningMemory, patternContext, evieContext, lunaContext, calendarSnapshotHash, rhythmProfile] = await Promise.all([
    loadUserLifeProfile(),
    loadLearningMemory(),
    buildGuidePatternContext(),
    loadActiveGuideContext("evie"),
    loadActiveGuideContext("luna"),
    loadCalendarSnapshotHash(),
    loadUserRhythmProfile(),
  ]);

  const request: QuestGenerationContext = {
    requestId: input.requestId,
    logicalDayKey: input.logicalDayKey,
    source: input.source,
    intention: input.intention,
    currentEnergy: input.currentEnergy,
    currentMode: input.currentMode,
    availableMinutes: input.availableMinutes,
    wakeTime: input.wakeTime ?? rhythmProfile?.typicalWakeTime,
    sleepTime: input.sleepTime ?? rhythmProfile?.typicalSleepTime,
    acceptedPathContextIds: evieContext.map((r) => r.id),
    acceptedLunaContextIds: lunaContext.map((r) => r.id),
    calendarSnapshotHash,
    lifeProfile,
    learningMemory,
    patternContext,
    activeQuestTitles: input.activeQuestTitles,
    targetWeekDates: input.targetWeekDates,
    milestones: input.milestones,
    lunaAccommodationSummary: input.lunaAccommodationSummary,
    acceptedPathContextText: evieContext.map((r) => r.sourceTextSnapshot),
    acceptedLunaContextText: lunaContext.map((r) => r.sourceTextSnapshot),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let result: QuestGenerationResult;
  try {
    const res = await fetch("/api/agents/quest-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: "Couldn't reach the guides' planning brain right now — try again in a moment." };
    }
    result = (await res.json()) as QuestGenerationResult;
  } catch {
    return { ok: false, error: "Couldn't reach the guides' planning brain right now — check your connection and try again." };
  } finally {
    clearTimeout(timeout);
  }

  const existing = await loadResultHistory();
  const next = [result, ...existing.filter((entry) => entry.requestId !== result.requestId)].slice(0, HISTORY_CAP);
  await persistProgressKeys({ [QUEST_GENERATION_RESULTS_KEY]: JSON.stringify(next) });

  return { ok: true, result, fromCache: false };
}

// ---------------------------------------------------------------------------
// Accept adapter — converts an accepted GeneratedQuestProposal into the SAME shape the
// deterministic Evie pipeline already uses, then saves through the existing validated helper
// (saveDailyQuestSuggestion: duplicate-title guard, day/board capacity caps). This is the ONE
// canonical accept path for Afternoon Check-In proposals AND weekly-plan-day proposals — never
// a second/parallel quest-creation route.
// ---------------------------------------------------------------------------

function adaptGeneratedProposalToDailyQuestSuggestion(proposal: GeneratedQuestProposal): DailyQuestSuggestion {
  return {
    id: proposal.proposalId,
    title: proposal.title,
    category: "Evie AI suggestion",
    durationMinutes: proposal.durationMinutes,
    kind: proposal.mode,
    suggestedTimeWindow: proposal.suggestedStartAt,
    rationale: proposal.rationale,
  };
}

export async function acceptGeneratedProposalAsDailyQuest(
  proposal: GeneratedQuestProposal,
  boardMode: "Progress" | "Recovery",
  source: "morning" | "afternoon" | "onboarding"
): Promise<SaveDailyQuestResult> {
  const result = await saveDailyQuestSuggestion(adaptGeneratedProposalToDailyQuestSuggestion(proposal), boardMode);
  if (result.ok) {
    await recordGuidePlanFeedback({
      proposalId: proposal.proposalId,
      source,
      accepted: true,
      edited: false,
      originalDuration: proposal.durationMinutes,
      acceptedDuration: proposal.durationMinutes,
    });
  }
  return result;
}
