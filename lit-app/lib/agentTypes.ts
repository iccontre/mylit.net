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

// ---------------------------------------------------------------------------
// Learning-agent substrate: event ledger + learning memory + pattern engine.
// See .agent/docs/MYLIT_AGENT_ARCHITECTURE.md. Still no AI calls, no health
// permissions — this is the typed data + deterministic logic future AI-backed
// Evie/Luna responses will eventually read from.
// ---------------------------------------------------------------------------

export type AgentEventType =
  | "quest_completed"
  | "quest_missed"
  | "checklist_completed"
  | "checklist_missed"
  | "sleep_checkin_saved"
  | "morning_reflection_saved"
  | "journal_saved"
  | "dream_saved"
  | "meditation_saved"
  | "pre_sleep_intention_saved"
  | "energy_changed"
  | "recovery_completed"
  | "progress_task_completed"
  | "calendar_overloaded"
  | "progress_locked"
  | "goal_updated"
  | "path_updated";

export type AgentEventMode = "progress" | "recovery" | "neutral";

/** One meaningful, timestamped user action — the raw material the pattern engine learns from. */
export type AgentEvent = {
  id: string;
  userId?: string | null;
  type: AgentEventType;
  /** Screen/route that generated this event, e.g. "home", "day-plan", "sleep-checkin". */
  sourcePage: string;
  createdAt: string;
  /** Local YYYY-MM-DD the event happened on — used for weekday/date-range grouping. */
  localDate: string;
  relatedItemId?: string;
  mode?: AgentEventMode;
  durationMinutes?: number;
  stepDelta?: number;
  energyDelta?: number;
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Learned patterns distilled from the event ledger over time. Every field is optional and
 * only ever set once there's enough data to support it — an empty LearningMemory is a
 * perfectly normal state for a new or light user.
 */
export type LearningMemory = {
  preferredQuestDurations?: number[];
  bestProgressTimeWindows?: string[];
  worstProgressTimeWindows?: string[];
  recoveryActivitiesThatHelp?: string[];
  commonMissedQuestReasons?: string[];
  commonSleepBarriers?: string[];
  consistencyPatterns?: string[];
  overloadPatterns?: string[];
  recentWins?: string[];
  recentRisks?: string[];
  lastUpdatedAt: string;
};

export type EvieLearningContext = {
  suggestedQuestDurationMinutes?: number;
  pathAdjustmentNote?: string;
  blockedGoalNote?: string;
  recentWins: string[];
  computedAt: string;
};

export type LunaLearningContext = {
  recoveryUrgency: "none" | "suggested" | "needed";
  sleepBarrierNote?: string;
  softenReflectionPrompts: boolean;
  recentRisks: string[];
  computedAt: string;
};

export type CalendarLearningContext = {
  overloadedWeekdays: string[];
  betterTimeWindowNote?: string;
  recommendedSplitNote?: string;
  computedAt: string;
};

export type StatsLearningSummary = {
  insights: StatsInsight[];
  memory: LearningMemory;
  computedAt: string;
};

// ---------------------------------------------------------------------------
// Path Pipeline: Evie's first personalized pipeline generator. Turns any dream/
// identity goal (career, body, friendship, purpose, confidence — anything the
// user actually typed into UserLifeProfile) into a structured path, purely by
// templating the user's own words — no fixed goal-category lookup, no AI call.
// See lib/pathPipeline.ts.
// ---------------------------------------------------------------------------

/** Which UserLifeProfile field the pipeline is built around. */
export type UserDreamGoalSource =
  | "longTermDreamStatement"
  | "futureSelfStatement"
  | "careerGoals"
  | "bodyHealthGoals"
  | "friendshipSocialGoals"
  | "purposeGoals"
  | "confidenceGoals";

export type UserDreamGoal = {
  goalText: string;
  source: UserDreamGoalSource;
};

export type ThreeMonthDirection = {
  headline: string;
  focusAreas: string[];
  computedAt: string;
};

export type OneMonthMilestone = {
  headline: string;
  concreteStep: string;
  computedAt: string;
};

export type TwoWeekSprint = {
  headline: string;
  focus: string;
  computedAt: string;
};

export type WeeklyHabitSuggestion = {
  id: string;
  title: string;
  suggestedDays: string[];
  suggestedTimeWindow?: string;
  durationMinutes: number;
  kind: "progress" | "recovery";
  rationale?: string;
};

export type DailyQuestSuggestion = {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  kind: "progress" | "recovery";
  suggestedTimeWindow?: string;
  rationale?: string;
};

export type ReflectionPromptSuggestion = {
  prompt: string;
  tone: MotivationStyle;
};

export type PathPipeline = {
  dreamGoal: UserDreamGoal | null;
  threeMonth: ThreeMonthDirection | null;
  oneMonth: OneMonthMilestone | null;
  twoWeek: TwoWeekSprint | null;
  weeklyHabit: WeeklyHabitSuggestion | null;
  dailyQuests: DailyQuestSuggestion[];
  reflectionPrompt: ReflectionPromptSuggestion | null;
  computedAt: string;
};

// ---------------------------------------------------------------------------
// Weekly Agent Review: MYLIT's first weekly improvement loop. Reviews the
// user's week and turns it into supportive, non-shame-based adjustments for
// Evie, Luna, and Calendar. See lib/weeklyReview.ts. No AI calls.
// ---------------------------------------------------------------------------

export type WeeklyAgentReview = {
  /** Stable id = weekStart — regenerating the same week replaces this entry, never duplicates it. */
  id: string;
  weekStart: string;
  weekEnd: string;
  wins: string[];
  struggles: string[];
  sleepEnergyPattern: string;
  progressRecoveryPattern: string;
  evieAdjustment: string;
  lunaAdjustment: string;
  calendarAdjustment: string;
  suggestedNextWeekFocus: string;
  createdAt: string;
};
