import { persistProgressKeys } from "./progressStore";
import { readJson } from "./readJson";
import { WEEKLY_PLAN_DRAFTS_KEY, TOMORROW_QUEUE_KEY } from "./storageKeys";
import { LOCAL_PROFILE_KEY } from "./auth";
import { getDateKey, getMondayWeekKey, getNextMondayWeekKey, getQuestDayKey } from "./scheduling";
import { getWeekdayName, computePlannedAheadReward } from "./questProgress";
import { loadUserRhythmProfile } from "./userRhythmProfile";
import { requestQuestGeneration } from "./questGenerationAi";
import { recordGuidePlanFeedback } from "./guidePlanFeedback";
import type { GeneratedQuestProposal } from "./agentTypes";

// First-week plan generation + review — reuses the SAME shared quest-generation contract as
// Morning/Afternoon Check-In (source: "onboarding_week"), the SAME canonical Monday-week
// helpers as the rest of the app (getMondayWeekKey/getNextMondayWeekKey — no competing week
// definition), and the SAME planned-ahead reward math future-dated Quest Board items already
// use. Nothing here enters the live schedule until the user explicitly accepts a day.

export type WeeklyPlanDraft = {
  /** Monday-anchored week key — stable id; regenerating the same week replaces this draft. */
  weekStart: string;
  requestId: string;
  proposals: GeneratedQuestProposal[];
  generatedAt: string;
};

type OnboardingProfile = {
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  longTermDream?: string;
  goalContextDescription?: string;
};

async function loadOnboardingProfile(): Promise<OnboardingProfile> {
  return readJson<OnboardingProfile>(LOCAL_PROFILE_KEY, {});
}

function buildWeekDates(weekStart: string): string[] {
  const monday = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return getDateKey(d);
  });
}

async function loadAllDrafts(): Promise<WeeklyPlanDraft[]> {
  return readJson<WeeklyPlanDraft[]>(WEEKLY_PLAN_DRAFTS_KEY, []);
}

async function saveDraft(draft: WeeklyPlanDraft): Promise<void> {
  const existing = await loadAllDrafts();
  const next = [draft, ...existing.filter((d) => d.weekStart !== draft.weekStart)];
  await persistProgressKeys({ [WEEKLY_PLAN_DRAFTS_KEY]: JSON.stringify(next) });
}

export async function loadWeeklyPlanDraft(weekStart: string): Promise<WeeklyPlanDraft | null> {
  const existing = await loadAllDrafts();
  return existing.find((d) => d.weekStart === weekStart) ?? null;
}

/** The target week for a fresh "first week" generation — always the next full canonical week,
 *  so onboarding never generates a plan for a week that's already partway over. */
export function defaultTargetWeekStart(): string {
  return getNextMondayWeekKey();
}

export type GenerateWeeklyPlanResult = { ok: true; draft: WeeklyPlanDraft } | { ok: false; error: string };

export async function generateWeeklyPlan(weekStart: string, forceRegenerate = false): Promise<GenerateWeeklyPlanResult> {
  const targetWeekDates = buildWeekDates(weekStart);
  const [profile, rhythm] = await Promise.all([loadOnboardingProfile(), loadUserRhythmProfile()]);

  const requestId = forceRegenerate ? `onboarding-week-${weekStart}-regen-${Date.now()}` : `onboarding-week-${weekStart}`;
  const result = await requestQuestGeneration({
    requestId,
    logicalDayKey: getQuestDayKey(),
    source: "onboarding_week",
    wakeTime: rhythm?.typicalWakeTime,
    sleepTime: rhythm?.typicalSleepTime,
    targetWeekDates,
    milestones: {
      twoWeek: profile.shortTermGoal,
      oneMonth: profile.midTermGoal,
      threeMonth: profile.longTermGoal,
      longTermDream: profile.longTermDream,
      description: profile.goalContextDescription,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };

  const draft: WeeklyPlanDraft = {
    weekStart,
    requestId,
    proposals: result.result.proposals,
    generatedAt: result.result.generatedAt,
  };
  await saveDraft(draft);
  return { ok: true, draft };
}

/** Regenerates proposals for ONE day only, splicing the fresh pair into the existing draft —
 *  every other day's proposals are untouched. */
export async function regenerateWeeklyPlanDay(weekStart: string, dateKey: string): Promise<GenerateWeeklyPlanResult> {
  const existing = await loadWeeklyPlanDraft(weekStart);
  const [profile, rhythm] = await Promise.all([loadOnboardingProfile(), loadUserRhythmProfile()]);

  const requestId = `onboarding-week-${weekStart}-${dateKey}-regen-${Date.now()}`;
  const result = await requestQuestGeneration({
    requestId,
    logicalDayKey: getQuestDayKey(),
    source: "onboarding_week",
    wakeTime: rhythm?.typicalWakeTime,
    sleepTime: rhythm?.typicalSleepTime,
    targetWeekDates: [dateKey],
    milestones: {
      twoWeek: profile.shortTermGoal,
      oneMonth: profile.midTermGoal,
      threeMonth: profile.longTermGoal,
      longTermDream: profile.longTermDream,
      description: profile.goalContextDescription,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };

  const untouched = (existing?.proposals ?? []).filter((p) => p.targetDateKey !== dateKey);
  const draft: WeeklyPlanDraft = {
    weekStart,
    requestId: existing?.requestId ?? requestId,
    proposals: [...untouched, ...result.result.proposals],
    generatedAt: new Date().toISOString(),
  };
  await saveDraft(draft);
  return { ok: true, draft };
}

export async function removeWeeklyPlanProposal(weekStart: string, proposalId: string): Promise<WeeklyPlanDraft | null> {
  const existing = await loadWeeklyPlanDraft(weekStart);
  if (!existing) return null;
  const draft: WeeklyPlanDraft = { ...existing, proposals: existing.proposals.filter((p) => p.proposalId !== proposalId) };
  await saveDraft(draft);
  return draft;
}

export async function editWeeklyPlanProposal(
  weekStart: string,
  proposalId: string,
  edits: { title?: string; durationMinutes?: 15 | 30 | 45 | 60 }
): Promise<WeeklyPlanDraft | null> {
  const existing = await loadWeeklyPlanDraft(weekStart);
  if (!existing) return null;
  const draft: WeeklyPlanDraft = {
    ...existing,
    proposals: existing.proposals.map((p) =>
      p.proposalId === proposalId
        ? { ...p, title: edits.title?.trim() || p.title, durationMinutes: edits.durationMinutes ?? p.durationMinutes }
        : p
    ),
  };
  await saveDraft(draft);
  return draft;
}

function defaultTimeFor(mode: "progress" | "recovery"): string {
  return mode === "recovery" ? "7:00 PM" : "9:00 AM";
}

/** Accepts every proposal targeting one day into the canonical Quest Board (TOMORROW_QUEUE_KEY,
 *  same future-dated-item shape and planned-ahead reward math manual future planning already
 *  uses), then removes those proposals from the draft. Idempotent: re-accepting a day that's
 *  already been accepted (its proposals no longer in the draft) is a safe no-op. */
export async function acceptWeeklyPlanDay(weekStart: string, dateKey: string): Promise<{ accepted: number }> {
  const draft = await loadWeeklyPlanDraft(weekStart);
  if (!draft) return { accepted: 0 };

  const dayProposals = draft.proposals.filter((p) => p.targetDateKey === dateKey);
  if (dayProposals.length === 0) return { accepted: 0 };

  const existingQueue = await readJson<Record<string, unknown>[]>(TOMORROW_QUEUE_KEY, []);
  const existingTitles = new Set(existingQueue.map((item) => (item.date === dateKey ? item.title ?? item.text : null)).filter(Boolean));
  const weekday = getWeekdayName(new Date(`${dateKey}T00:00:00`));
  const targetWeekKey = getMondayWeekKey(new Date(`${dateKey}T00:00:00`));
  const now = new Date();
  const nowIso = now.toISOString();

  const newItems: Record<string, unknown>[] = [];
  for (const proposal of dayProposals) {
    if (existingTitles.has(proposal.title)) continue; // avoid duplicate/semantically identical entries
    const reward = computePlannedAheadReward(now, targetWeekKey, proposal.durationMinutes >= 60 ? 4 : proposal.durationMinutes >= 45 ? 3 : proposal.durationMinutes >= 30 ? 2 : 1);
    const startTime = proposal.suggestedStartAt?.trim() || defaultTimeFor(proposal.mode);
    newItems.push({
      id: `weekly-plan-${proposal.proposalId}`,
      source: "quickThought",
      text: proposal.title,
      title: proposal.title,
      type: proposal.sourceLabel,
      classification: proposal.mode,
      kind: "quickThought",
      date: dateKey,
      weekday,
      time: startTime,
      startTime,
      duration: `${proposal.durationMinutes} min`,
      durationMinutes: proposal.durationMinutes,
      steps: reward.finalSteps,
      status: "scheduled",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    void recordGuidePlanFeedback({
      proposalId: proposal.proposalId,
      source: "onboarding",
      accepted: true,
      edited: false,
      originalDuration: proposal.durationMinutes,
      acceptedDuration: proposal.durationMinutes,
    });
  }

  if (newItems.length > 0) {
    await persistProgressKeys({ [TOMORROW_QUEUE_KEY]: JSON.stringify([...existingQueue, ...newItems]) });
  }

  const remaining = draft.proposals.filter((p) => p.targetDateKey !== dateKey);
  await saveDraft({ ...draft, proposals: remaining });

  return { accepted: newItems.length };
}

export async function acceptFullWeeklyPlan(weekStart: string): Promise<{ accepted: number }> {
  const draft = await loadWeeklyPlanDraft(weekStart);
  if (!draft) return { accepted: 0 };
  const dateKeys = Array.from(new Set(draft.proposals.map((p) => p.targetDateKey).filter((d): d is string => Boolean(d))));
  let total = 0;
  for (const dateKey of dateKeys) {
    const { accepted } = await acceptWeeklyPlanDay(weekStart, dateKey);
    total += accepted;
  }
  return { accepted: total };
}
