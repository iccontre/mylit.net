// Typed foundation for MYLIT's long-term agent architecture. See
// .agent/docs/MYLIT_AGENT_ARCHITECTURE.md for the full picture.
//
// IMPORTANT: nothing in this file (or lib/mylitAgents.ts, which builds on it)
// calls an external AI model, requests a health/biomarker permission, or
// makes a medical claim. It is pure typed data + deterministic summaries.

export type MotivationStyle = "gentle" | "direct" | "balanced";

export type LifeStage = "high_school" | "college" | "working" | "transitioning" | "other";

/**
 * The user's broader life-path profile — separate from the existing Path
 * onboarding profile (`lit_user_profile` / LOCAL_PROFILE_KEY), which stays
 * exactly as-is. This is new, optional, additive data: an existing user who
 * never fills any of this in simply has an empty UserLifeProfile, and nothing
 * about onboarding or their existing profile changes.
 */
export type UserLifeProfile = {
  futureSelfStatement?: string;
  careerGoals?: string;
  bodyHealthGoals?: string;
  friendshipSocialGoals?: string;
  purposeGoals?: string;
  confidenceGoals?: string;
  currentObstacles?: string;
  motivationStyle?: MotivationStyle;
  preferredLunaSupport?: string;
  preferredEvieAccountability?: string;
  commonSleepBarriers?: string;
  recoveryActivitiesThatHelp?: string;
  currentStage?: LifeStage;
  longTermDreamStatement?: string;
  /** ISO timestamp of the last edit — used for merge bookkeeping, not shown to the user. */
  updatedAt?: string;
};

/**
 * Small, structured "what the guides remember" object. Deliberately NOT a
 * free-text AI memory blob — just a few plain fields the deterministic
 * summaries can reference so repeat visits don't feel like starting over.
 */
export type GuideMemory = {
  lastEvieSummaryAt?: string;
  lastLunaSummaryAt?: string;
  /** Insight ids (see StatsInsight.id) the user has already seen surfaced by a guide. */
  acknowledgedInsightIds?: string[];
  /** Short freeform notes a guide "remembers" — set by app logic, never by an AI call. */
  notes?: string;
  updatedAt?: string;
};

export type StatsInsightCategory =
  | "progress_habit"
  | "recovery_habit"
  | "sleep"
  | "quest_length"
  | "workload"
  | "consistency";

/** One small, plain-language pattern Stats noticed in the user's own data. */
export type StatsInsight = {
  /** Stable id (slug) so this insight can be deduped/merged across devices and acknowledged in GuideMemory. */
  id: string;
  category: StatsInsightCategory;
  /** Short, human-readable sentence — this is what gets shown to the user, verbatim or near-verbatim. */
  summary: string;
  /** 0–1 rough confidence based on how much data backed the pattern (more data = higher). */
  confidence: number;
  computedAt: string;
};

export type EviePathSummary = {
  headline: string;
  supportingLines: string[];
  computedAt: string;
};

export type LunaSupportSummary = {
  headline: string;
  supportingLines: string[];
  computedAt: string;
};

export type CalendarPlanningSummary = {
  headline: string;
  suggestions: string[];
  computedAt: string;
};

export type UiUxImmersionCheck = {
  label: string;
  passed: boolean;
  note?: string;
};

/** Foundation-only checklist result — see buildUiUxImmersionSummary in lib/mylitAgents.ts. */
export type UiUxImmersionSummary = {
  screenName: string;
  checks: UiUxImmersionCheck[];
  passedCount: number;
  totalCount: number;
  computedAt: string;
};

export type BiomarkerSource =
  | "manual"
  | "apple_health"
  | "apple_watch"
  | "oura"
  | "whoop"
  | "fitbit"
  | "garmin"
  | "eeg"
  | "unknown";

export type BiomarkerPermissionStatus = "not_requested" | "granted" | "denied" | "unavailable";

/**
 * Normalized shape for ANY biomarker source, present or future. Only `source: "manual"`
 * is ever populated today — the other source values exist so this type does not need to
 * change shape when real device integrations are added later.
 */
export type BiomarkerSnapshot = {
  id: string;
  date: string;
  sleepMinutes?: number;
  sleepStart?: string;
  sleepEnd?: string;
  awakenings?: number;
  sleepEfficiency?: number;
  steps?: number;
  restingHeartRate?: number;
  hrv?: number;
  workoutMinutes?: number;
  source: BiomarkerSource;
  permissionStatus: BiomarkerPermissionStatus;
  notes?: string;
  createdAt: string;
};

/**
 * The one safe context snapshot the Orchestrator builds for all guides/agents to read,
 * instead of each one reaching into raw storage separately.
 */
export type AgentContextSnapshot = {
  lifeProfile: UserLifeProfile;
  guideMemory: GuideMemory;
  insights: StatsInsight[];
  latestBiomarker: BiomarkerSnapshot | null;
  evie: EviePathSummary;
  luna: LunaSupportSummary;
  calendar: CalendarPlanningSummary;
  computedAt: string;
};
