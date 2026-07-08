// Typed foundation for MYLIT's long-term agent architecture. See
// .agent/docs/MYLIT_AGENT_ARCHITECTURE.md for the full picture.
//
// IMPORTANT: nothing in this file (or lib/mylitAgents.ts, which builds on it)
// calls an external AI model, requests a health/biomarker permission, or
// makes a medical claim. It is pure typed data + deterministic summaries.

export type MotivationStyle = "gentle" | "direct" | "balanced";

export type LifeStage = "high_school" | "college" | "working" | "transitioning" | "other";

/** The 4 onboarding quest/checklist categories — used for learning which kinds of tasks the user actually creates/completes/misses. */
export type QuestCategory = "work" | "social" | "health" | "purpose";

/**
 * "Do you prefer to start early and spread tasks through the day, or finish major tasks in
 * larger focus blocks?" — guides task-suggestion shape (see lib/pathPipeline.ts,
 * lib/evieAiFallback.ts). Optional and additive: existing users are never forced to answer it.
 */
export type WorkRhythmPreference = "spread_through_day" | "focus_blocks" | "flexible";

export type FocusWindow = "morning" | "midday" | "afternoon" | "evening" | "flexible";

/** Per-weekday read on the user's own Weekly Habit text (Day Plan) — "Rest Day" on Saturday reads as rest_oriented, "Deep Work" reads as progress_oriented. Guidance only, never enforced. */
export type WeekdayIntensity = "rest_oriented" | "progress_oriented" | "neutral";

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
  /** "Start early + spread tasks" vs "large focus blocks" vs "depends on the day" — optional, editable in Life Profile any time. */
  workRhythmPreference?: WorkRhythmPreference;
  /** Only meaningful when workRhythmPreference is "focus_blocks". */
  preferredFocusWindow?: FocusWindow;
  /** User's own target wake time from Sleep Guide, e.g. "7:00 AM" — falls back to the learned wake rhythm in GuideMemory when unset. */
  plannedWakeTime?: string;
  /** ISO timestamp of the last edit — used for merge bookkeeping, not shown to the user. */
  updatedAt?: string;
};

/**
 * Small, structured "what the guides remember" object. Deliberately NOT a
 * free-text AI memory blob — just a few plain fields the deterministic
 * summaries can reference so repeat visits don't feel like starting over.
 */
/**
 * Learned wake-time consistency from recent Morning Check-Ins — feeds Afternoon Check-In's
 * unlock time (planned/consistent wake + 7h) and Luna's sleep guidance. Recomputed from the
 * last 7–14 days of check-ins; never medical, just a rolling estimate.
 */
export type WakeRhythm = {
  /** Most recent actual wake times (e.g. "7:15 AM"), oldest first, capped to ~14 entries. */
  recentWakeTimes: string[];
  /** Median-ish estimate of the user's actual wake time, once there's enough data. */
  consistentWakeTimeEstimate?: string;
  updatedAt: string;
};

export type GuideMemory = {
  lastEvieSummaryAt?: string;
  lastLunaSummaryAt?: string;
  /** Insight ids (see StatsInsight.id) the user has already seen surfaced by a guide. */
  acknowledgedInsightIds?: string[];
  /** Short freeform notes a guide "remembers" — set by app logic, never by an AI call. */
  notes?: string;
  /** Learned wake-time consistency — see WakeRhythm. */
  wakeRhythm?: WakeRhythm;
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
  /** Work/Social/Health/Purpose, when the source item had one set — absent on legacy/uncategorized items. */
  category?: QuestCategory;
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
  /** Per-weekday read on the user's own Weekly Habit text — e.g. { Saturday: "rest_oriented" }. Recomputed from Day Plan's weekdayRoles each time learning memory refreshes. */
  weekdayIntensity?: Record<string, WeekdayIntensity>;
  /** Rolling recent-days trend of Progress vs Recovery mode — informs how ambitious new suggestions default to. */
  recentModeTrend?: "recovery_heavy" | "progress_heavy" | "balanced";
  /** Rolling completed/missed counts per quest category (last ~30 days) — feeds category-aware suggestions and "What MYLIT Noticed" copy. */
  categoryTrends?: Partial<Record<QuestCategory, { completed: number; missed: number }>>;
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
  /** Work/Social/Health/Purpose — optional, heuristically inferred when not explicitly chosen. */
  taskCategory?: QuestCategory;
};

export type DailyQuestSuggestion = {
  id: string;
  /** Free-text label for where this suggestion came from (e.g. "stats pattern") — NOT the work/social/health/purpose category, see taskCategory. */
  title: string;
  category: string;
  durationMinutes: number;
  kind: "progress" | "recovery";
  suggestedTimeWindow?: string;
  rationale?: string;
  /** Work/Social/Health/Purpose — optional, heuristically inferred when not explicitly chosen. */
  taskCategory?: QuestCategory;
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
// Evie AI Path Pipeline — MYLIT's first LLM-backed planner (see
// api/agents/evie-path-pipeline.ts and lib/evieAiPathPipeline.ts). Distinct from the
// deterministic PathPipeline above: this is generated server-side from the user's own
// Set My Path prompt plus Life Profile / Guide Memory / Learning Memory / Stats context.
// It only ever produces SUGGESTIONS — saving one still routes through the exact same
// validated save helpers as the deterministic pipeline (saveWeeklyHabitSuggestion /
// saveDailyQuestSuggestion in lib/pathPipeline.ts), so nothing here can create an active
// quest/habit without the user tapping Save. No AI call happens in this file — it is types
// only.
// ---------------------------------------------------------------------------

/**
 * Why a route fell back to its deterministic response instead of a real model call — set
 * only on the fallback path, never alongside a genuine "ready"/ready-like AI response. Lets
 * the client show a friendly, specific notice (e.g. "AI is at its usage quota right now")
 * instead of silently pretending a fallback is a normal result. See lib/aiUsageLog.ts.
 */
export type AiUnavailableReason = "missing_key" | "quota_exceeded" | "rate_limited" | "error";

export type EvieGoalDomain =
  | "career"
  | "school"
  | "body"
  | "friendship"
  | "creative"
  | "purpose"
  | "sleep"
  | "other";

export type EvieAiPathPipelineStatus = "ready" | "needs_clarification" | "safe_fallback";

export type EvieAiResearchBrief = {
  summary: string;
  keySteps: string[];
  skillsNeeded: string[];
  milestones: string[];
  risks: string[];
  suggestedResources: string[];
  /** Must say "model-guided starter research" (or similarly hedged) whenever real web research wasn't performed. */
  sourceNote: string;
};

export type EvieAiThreeMonthDirection = {
  title: string;
  description: string;
  successSigns: string[];
};

export type EvieAiOneMonthMilestone = {
  title: string;
  description: string;
  measurableOutcome: string;
};

export type EvieAiTwoWeekSprint = {
  title: string;
  focus: string;
  steps: string[];
};

export type EvieAiWeeklyHabitSuggestion = {
  title: string;
  reason: string;
  repeatDays: string[];
  mode: "progress" | "recovery";
  durationMinutes: number;
  taskCategory: QuestCategory;
};

/** 120 (2 hours) is only ever meant for Today's Quest — see lib/evieAiPathPipeline.ts's save-time clamp. */
export type EvieAiDailyQuestDuration = 15 | 30 | 45 | 60 | 120;

export type EvieAiDailyQuestSource = "user_prompt" | "life_profile" | "stats_pattern" | "research_brief";

export type EvieAiDailyQuestSuggestion = {
  title: string;
  reason: string;
  mode: "progress" | "recovery";
  durationMinutes: EvieAiDailyQuestDuration;
  suggestedTimeWindow: string;
  energyEffect: number;
  difficulty: "easy" | "medium" | "hard";
  source: EvieAiDailyQuestSource;
  acceptanceLabel: string;
  taskCategory: QuestCategory;
};

export type EvieAiPathPipelineResponse = {
  status: EvieAiPathPipelineStatus;
  guide: "evie";
  goalSummary: string;
  goalDomain: EvieGoalDomain;
  /** 0–1 — how specific/actionable the user's own prompt was. */
  specificityScore: number;
  clarifyingQuestions: string[];
  researchBrief: EvieAiResearchBrief;
  threeMonthDirection: EvieAiThreeMonthDirection;
  oneMonthMilestone: EvieAiOneMonthMilestone;
  twoWeekSprint: EvieAiTwoWeekSprint;
  weeklyHabitSuggestions: EvieAiWeeklyHabitSuggestion[];
  dailyQuestSuggestions: EvieAiDailyQuestSuggestion[];
  lunaRecoveryNotes: string[];
  safetyNotes: string[];
  nextBestAction: string;
  /** Set only when this response is the deterministic fallback, not a real model result. */
  aiUnavailableReason?: AiUnavailableReason;
};

/**
 * Shared "what MYLIT has noticed about the user's rhythm" bundle — sent to Evie, Luna, and
 * the guide conversation route alike so all three guides reason from the same signals (see
 * spec section 10). Deliberately compact/summarized, never raw event/journal data.
 */
export type GuidePatternContext = {
  /** Per-weekday read on the user's own Weekly Habit text (Day Plan). */
  weekdayIntensity?: Record<string, WeekdayIntensity>;
  recentModeTrend?: "recovery_heavy" | "progress_heavy" | "balanced";
  categoryTrends?: Partial<Record<QuestCategory, { completed: number; missed: number }>>;
  workRhythmPreference?: WorkRhythmPreference;
  preferredFocusWindow?: FocusWindow;
  wakeRhythm?: WakeRhythm;
};

export type EvieAiPathPipelineConstraints = {
  maxProgressMinutesToday?: number;
  maxRecoveryMinutesToday?: number;
  sleepWindow?: string;
  schoolWorkConstraints?: string[];
  userAvoids?: string[];
};

export type EvieAiPathPipelineRequest = {
  userPrompt: string;
  lifeProfile: UserLifeProfile;
  guideMemory: GuideMemory;
  learningMemory: LearningMemory;
  statsInsights: StatsInsight[];
  recentAgentEvents: AgentEvent[];
  currentEnergy: number;
  currentMode: AgentEventMode;
  availableDays?: string[];
  constraints?: EvieAiPathPipelineConstraints;
  patternContext?: GuidePatternContext;
};

/** One saved AI pipeline run — never overwritten, newest-first, capped history (see AI_EVIE_PATH_PIPELINES_KEY). */
export type EvieAiPathPipelineRecord = {
  id: string;
  createdAt: string;
  userPrompt: string;
  response: EvieAiPathPipelineResponse;
  /** Hash of (userPrompt + lifeProfile.updatedAt + learningMemory.lastUpdatedAt) — lets a later request with identical inputs reuse this instead of calling OpenAI again. Absent on records saved before caching was added. */
  cacheKey?: string;
};

// ---------------------------------------------------------------------------
// Luna AI Support Modifier — MYLIT's first LLM-backed support/plan-adjustment guide (see
// api/agents/luna-support-modifier.ts and lib/lunaSupportModifier.ts). Luna is NOT a general
// chatbot in this phase: her only job is to notice struggle (missed quests, low energy, poor
// sleep, heavy reflections) and propose gentle plan adjustments. Every adjustment is a
// SUGGESTION — applying one routes through the same validated helpers/mutation guards as
// everything else (see lib/lunaSupportModifier.ts), never an automatic change. Types only —
// no AI call happens in this file.
// ---------------------------------------------------------------------------

export type LunaSupportModifierStatus = "ready" | "support_only" | "needs_clarification";

export type LunaAdjustmentType =
  | "reduce_duration"
  | "move_later"
  | "move_earlier"
  | "swap_progress_for_recovery"
  | "add_recovery"
  | "pause_goal"
  | "ask_evie_to_rebuild";

export type LunaPlanAdjustment = {
  type: LunaAdjustmentType;
  reason: string;
  /** Id of an item in the request's activeQuests — required for reduce_duration/move_later/move_earlier/swap_progress_for_recovery. */
  targetQuestId?: string;
  suggestedDurationMinutes?: number;
};

export type LunaRecoveryQuestSuggestion = {
  title: string;
  reason: string;
  durationMinutes: 15 | 30 | 45 | 60;
  energyRestoreEstimate: number;
};

export type LunaSupportModifierResponse = {
  status: LunaSupportModifierStatus;
  guide: "luna";
  supportMessage: string;
  whatLunaNoticed: string[];
  suggestedPlanAdjustments: LunaPlanAdjustment[];
  recoveryQuestSuggestions: LunaRecoveryQuestSuggestion[];
  evieHandoffNote: string;
  safetyNote: string;
  /** Set only when this response is the deterministic fallback, not a real model result. */
  aiUnavailableReason?: AiUnavailableReason;
};

export type LunaActiveQuestSummary = {
  id: string;
  title: string;
  kind: "progress" | "recovery";
  durationMinutes: number;
  startTime?: string;
  status: string;
};

export type LunaCurrentPathPipelineSummary = {
  goalText?: string;
  threeMonthHeadline?: string;
  twoWeekHeadline?: string;
};

export type LunaSleepContext = {
  effectiveSleepMinutes?: number;
  interrupted?: boolean;
  /** e.g. "2:30 PM" — from Afternoon Check-In, when the user reported having caffeine. */
  caffeineTime?: string;
  /** How closely recent nights have matched Sleep Guide's suggested window — never a medical judgment, just adherence. */
  sleepGuideAdherence?: "good" | "inconsistent" | "unknown";
};

export type LunaReflectionSummary = {
  quest: string;
  whatGotInTheWay: string;
};

export type LunaSupportModifierRequest = {
  userMessage: string;
  currentPathPipeline: LunaCurrentPathPipelineSummary | null;
  recentMisses: { title: string; dateKey: string }[];
  recentEnergy: number;
  sleepContext: LunaSleepContext;
  reflectionSummary: LunaReflectionSummary | null;
  learningMemory: LearningMemory;
  currentMode: AgentEventMode;
  activeQuests: LunaActiveQuestSummary[];
  patternContext?: GuidePatternContext;
};

/** One saved Luna support session — never overwritten, newest-first, capped history. */
export type LunaSupportModifierRecord = {
  id: string;
  createdAt: string;
  userMessage: string;
  response: LunaSupportModifierResponse;
};

// ---------------------------------------------------------------------------
// Guide Conversation Memory — lightweight, guided conversation modes ("Talk to Evie about
// my path" / "Talk to Luna about what feels hard"). This is deliberately NOT an unrestricted
// chatbot: a conversation can only ever affect MYLIT's stored memory through a structured
// update proposal the user explicitly approves, and it can never create or delete a quest —
// only the existing, already-validated Evie/Luna pipelines do that. See
// api/agents/guide-conversation.ts and lib/guideConversation.ts. Types only — no AI call
// happens in this file.
// ---------------------------------------------------------------------------

export type GuideName = "evie" | "luna";

export type GuideMemoryUpdateType =
  | "new_goal"
  | "changed_goal"
  | "obstacle"
  | "preference"
  | "recovery_need"
  | "motivation_style"
  | "task_adjustment_request";

/** One proposed structured memory update from a guide reply — inert until the user decides. */
export type GuideMemoryUpdateProposal = {
  id: string;
  type: GuideMemoryUpdateType;
  /** Short, human-facing summary, e.g. "Evie thinks your goal changed to: ..." */
  summary: string;
  /** The actual value that would be written if approved. */
  proposedValue: string;
  decision?: "approved" | "dismissed";
  decidedAt?: string;
};

export type GuideConversationRole = "user" | "guide";

/** One turn in a guide conversation. Guide turns may carry pending/decided memory update proposals. */
export type GuideConversationTurn = {
  id: string;
  guide: GuideName;
  role: GuideConversationRole;
  text: string;
  createdAt: string;
  memoryUpdateProposals?: GuideMemoryUpdateProposal[];
};

/** Audit log entry written once a proposal is decided (approved OR dismissed) — never for pending proposals. */
export type GuideMemoryUpdateLogEntry = {
  id: string;
  guide: GuideName;
  type: GuideMemoryUpdateType;
  summary: string;
  proposedValue: string;
  decision: "approved" | "dismissed";
  /** Which field this was written to, e.g. "longTermDreamStatement" — omitted for dismissed or non-field-mapped types. */
  appliedToField?: string;
  sourceTurnId: string;
  decidedAt: string;
};

export type GuideConversationRequest = {
  guide: GuideName;
  userMessage: string;
  /** Compact recent turns only (last few exchanges, truncated) — never the full conversation history. */
  recentTurns: { role: GuideConversationRole; text: string }[];
  lifeProfile: UserLifeProfile;
  guideMemory: GuideMemory;
  learningMemory: LearningMemory;
  statsInsights: StatsInsight[];
  currentMode: AgentEventMode;
  patternContext?: GuidePatternContext;
};

export type GuideConversationResponse = {
  guide: GuideName;
  reply: string;
  memoryUpdateProposals: Array<{
    type: GuideMemoryUpdateType;
    summary: string;
    proposedValue: string;
  }>;
  safetyNote: string;
  /** Set only when this response is the deterministic fallback, not a real model result. */
  aiUnavailableReason?: AiUnavailableReason;
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
