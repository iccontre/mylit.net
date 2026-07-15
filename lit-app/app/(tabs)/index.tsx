import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, type AppStateStatus } from "react-native";

import { BottomNav } from "../../components/BottomNav";
import { LunaGuideModal } from "../../components/LunaGuideModal";
import { AnimatedFlame } from "../../components/AnimatedFlame";
import { EvieGuideModal } from "../../components/EvieGuideModal";
import { LdmErrorBoundary } from "../../components/LdmErrorBoundary";
import { uiAssets } from "../../constants/uiAssets";
import { useMobileFrame } from "../../constants/mobileLayout";
import {
  getActiveSuggestedQuest,
  generateRecoveryStarterQuest,
  type QuestProfileContext,
} from "../../lib/questGeneration";
import { ANALYTICS_EVENTS, trackEvent } from "../../lib/analytics";
import { setChecklistItemChecked, syncQuestCompleted, syncQuestMissed, syncQuestStarted } from "../../lib/progressSync";
import { clearProgressKey, mergeCloudIntoLocalSafely, persistProgressKeys } from "../../lib/progressStore";
import { isSupabaseConfigured } from "../../lib/supabase";
import { loadGuideMemory, loadUserLifeProfile, recordAgentEvent } from "../../lib/mylitAgents";
import {
  emitQuestCompletionFeedback,
  subscribeToCompletionFeedback,
  type CompletionEnergyEffect,
  type CompletionGuide,
} from "../../lib/completionFeedback";
import { syncAndGetStepRank, type StepRank } from "../../lib/stepRank";
import {
  ACTIVE_TIMED_ITEM_KEY,
  applyQuestBoardCapacity,
  buildForcedRecoveryItem,
  collectExpiredUnresolvedQuickThoughts,
  collectTodayCalendarItems,
  computeFreshRankBonuses,
  computeTodayScopedEarnedSteps,
  findNextScheduledItem,
  FORCED_RECOVERY_MESSAGE,
  FORCED_RECOVERY_RESTORE_ENERGY,
  formatCapacityHeader,
  getChecklistItemsForDay,
  getForcedRecoveryTrigger,
  getTodayKey,
  getWeekdayName,
  isTodayQuestActiveForToday,
  isTodayQuestCompletedToday,
  kindAccent,
  loadFocusBlockLog,
  loadTodayCompletions,
  loadTodayMissed,
  markItemComplete,
  markItemMissed,
  normalizeQuestItems,
  questSourceLabel,
  reconcileMonotonicTotalSteps,
  sourceIcon,
  TODAY_QUEST_TWO_HOUR_MINUTES,
  type CompletionEntry,
  type FocusBlockLogEntry,
  type GuideOwner,
  type HomeQuestItem,
  type MissedEntry,
  type QuestKind,
} from "../../lib/questProgress";
import {
  computeAfternoonUnlockLabel,
  computeAfternoonUnlockTimestamp,
  DEFAULT_AFTERNOON_UNLOCK_TIME,
  resolveWakeTimestamp,
  formatDurationLabel,
  formatMinutesAsTime,
  formatEnergyDelta,
  getEnergyDelta,
  getGuideMessageSlot,
  getMandatoryQuestRestoreEnergy,
  getQuestDayKey,
  getStepsForItem,
  isLdmActive,
  isMandatoryQuestTitle,
  MANDATORY_ENERGY_QUEST_TITLE,
  MANDATORY_FOOD_QUEST_TITLE,
  parseTimeToMinutes,
  pickGuideMessage,
} from "../../lib/scheduling";
import { AFFIRMATIONS_KEY, DAILY_STEPS_LOG_KEY, FOOD_LOGS_KEY, LATEST_PRE_SLEEP_INTENTION_KEY, SLEEP_ROUTINE_KEY, TOTAL_STEPS_FLOOR_KEY } from "../../lib/storageKeys";
import { readJson } from "../../lib/readJson";
import { FoodLogModal } from "../../components/FoodLogModal";
import { computeFuel, type FoodLog } from "../../lib/fuel";
import { computeMandatoryGateState } from "../../lib/mandatoryGates";
import { loadTodaysEvieMorningQuest, type EvieMorningQuest } from "../../lib/evieMorningQuest";

const mylitLogo = uiAssets.logo.mylit;
const fireAssets = uiAssets.fires;
const fireAnimations = uiAssets.fireAnimations;
const FLAME_SHEET_COLUMNS = 6;
const FLAME_SHEET_ROWS = 6;
const FLAME_SHEET_FRAME_COUNT = FLAME_SHEET_COLUMNS * FLAME_SHEET_ROWS;
const FLAME_EMBER_SHEET_WIDTH = 1488;
const FLAME_LOW_SHEET_WIDTH = 1032;
const FLAME_STEADY_SHEET_WIDTH = 1116;
const FLAME_BRIGHT_SHEET_WIDTH = 1056;
const FLAME_BLAZING_SHEET_WIDTH = 936;
const FLAME_SHEET_HEIGHT = 1536;

type Quest = {
  title: string;
  type: string;
  steps: number;
  description?: string;
  mandatory?: boolean;
  restoreEnergy?: number;
  starter?: boolean;
  suggested?: boolean;
  durationMinutes?: number;
  kind?: QuestKind;
  /** LDM routine task (hygiene/journaling/reading/night reflection) — see getLdmRoutineQuests. */
  ldmRoutine?: boolean;
  guide?: GuideOwner;
};

type QueueItem = {
  id?: string;
  text?: string;
  title?: string;
  task?: string;
  note?: string;
  type?: string;
  date?: string;
  dateKey?: string;
  time?: string;
  startTime?: string;
  duration?: string;
  durationMinutes?: number;
  steps?: number;
  status?: string;
  completedAt?: string;
  classification?: QuestKind;
  kind?: string;
};

type ActiveTimedItem = {
  id: string;
  title: string;
  source: HomeQuestItem["source"];
  kind: QuestKind;
  steps: number;
  durationMinutes: number;
  startedAt: number;
  endsAt: number;
  scheduledTime?: string;
};

type RawTodayQuest = {
  id?: string;
  title?: string;
  startTime?: string;
  duration?: string;
  durationMinutes?: number;
  steps?: number;
  kind?: QuestKind;
  status?: string;
  date?: string;
};

type DayPlanRaw = {
  todayQuest?: RawTodayQuest;
  weekdayChecklists?: Partial<Record<WeekdayName, RawChecklistItem[]>>;
};

type RawChecklistItem = {
  id?: string;
  text?: string;
  title?: string;
  checked?: boolean;
  steps?: number;
  startTime?: string;
  time?: string;
  duration?: string;
  durationMinutes?: number;
  kind?: QuestKind;
  status?: string;
  weekdays?: WeekdayName[];
};

type CheckIn = {
  id?: string;
  checkInType?: "morning" | "afternoon";
  hours?: string;
  mood?: string;
  stress?: string;
  energy: number;
  mode: "Recovery" | "Progress";
  eatenSinceMorning?: boolean;
  foodSinceMorning?: string;
  createdAt?: string;
  afternoonCheckInCompletedToday?: boolean;
  /** Quest-day (6 AM boundary) the Afternoon Check-In was completed for — see sleep-checkin.tsx. */
  afternoonCheckInQuestDayKey?: string;
  /** Sleep Guide fields — used only to compute the wind-down lock window (see getWindDownQuest). */
  desiredSleepTime?: string;
  windDownMinutes?: number;
  /** Morning Check-In's recorded wake time — top priority source for the Afternoon Check-In 5-hour unlock. */
  wakeTime?: string;
  finalWakeTime?: string;
};

type WeekdayName = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
type LowercaseWeekdayName = Lowercase<WeekdayName>;

type DayPlan = {
  todayGoal?: string;
  Monday?: string;
  Tuesday?: string;
  Wednesday?: string;
  Thursday?: string;
  Friday?: string;
  Saturday?: string;
  Sunday?: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
};

type UserProfile = {
  name: string;
  longTermDream?: string;
  dreamCategory?: string;
  supplementaryCategory?: string;
  progressMeaning?: string;
  // Phase 1 tiered goals (preferred)
  specificGoal?: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  // Legacy fields, kept for backward compat with profiles saved before tiered flow
  goalOne?: string;
  goalTwo?: string;
  goalThree?: string;
  biggestObstacle?: string;
  hasWorkOrSchool?: boolean;
  hasTransportation?: boolean;
  hasGymAccess?: boolean;
  hasQuietSpace?: boolean;
  hasFoodControl?: boolean;
  goalsGeneratedAt?: string;
};

type ModeState = "Recovery" | "Progress" | "Neutral";

const PROFILE_KEY = "lit_user_profile";
const CHECKIN_KEY = "lit_latest_checkin";
const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";
const USER_STATS_KEY = "lit_user_stats";
const PASSIVE_DECAY_POINTS = 5;
const PASSIVE_DECAY_INTERVAL_HOURS = 2;

// Luna's mandatory recovery quest, triggered when energy runs low — thresholds/durations and
// the full gate state machine now live in lib/mandatoryGates.ts (single source of truth shared
// by both tap handlers and rendering below). MANDATORY_QUEST_TITLE lives in scheduling.ts so
// Calendar can identify completions too.
const MANDATORY_MILD_DURATION_MINUTES = 15;

// Luna's wind-down lock, triggered by TIME (desired sleep time minus wind-down minutes),
// separate from the energy-based mandatory quests above (see getWindDownQuest). Locks
// Progress starts only — Recovery/sleep-routine tasks stay open, matching the mild tier.
const WIND_DOWN_QUEST_TITLE = "Start your pre-sleep routine";
const DEFAULT_WIND_DOWN_MINUTES = 30;
const MAX_WIND_DOWN_MINUTES = 60;

// Guide message rotation — deterministic, local, no AI. A new message every 30-minute slot from
// 6:00 AM through 11:30 PM (see getGuideMessageSlot/pickGuideMessage in lib/scheduling.ts, which
// own the actual slot math so it stays in one place and matches the 6 AM quest-day boundary).
// Luna: mental/emotional support, rest/recovery, eating/restoring energy (mixed with the user's
// own saved affirmations in Recovery mode — see guideMessage below). Evie: Path/progress
// guidance and brief practical reminders (hydration, movement, ~45 min of exercise).
const LUNA_ROTATING_MESSAGES = [
  "It's okay to take it slow, stargazer. Rest is part of becoming your brightest self.",
  "Drink some water — your body is doing recovery work too.",
  "You don't have to earn rest. You already have.",
  "Small comfort counts: a blanket, a song, a slow breath.",
  "One gentle thing today — stretch, journal, or just sit quietly.",
  "You're allowed a slow day. The path is still there tomorrow.",
  "Even resting is progress when your flame needed it.",
  "Maybe today's hobby is just doing nothing for a bit.",
];
const EVIE_ROTATING_MESSAGES = [
  "You're on fire! Keep building momentum. Your best day is ahead.",
  "Drink some water — keep your focus sharp.",
  "One more honest step counts more than a perfect plan.",
  "Progress isn't always loud. Keep showing up.",
  "Take a breath, then get back after it.",
  "You chose to show up today. That's the hard part.",
  "Momentum builds from small honest steps.",
  "A quick hobby break can refill you for the next push.",
  "Get moving today — even a short walk counts.",
  "Aim for about 45 minutes of exercise today, if you can.",
];
const NEUTRAL_ROTATING_MESSAGES = [
  "A new day awaits. Small steps today, bright tomorrows.",
  "Drink some water to start the day right.",
  "Check in when you're ready — there's no rush.",
  "Whatever today holds, you get to choose your pace.",
  "A calm start is still a start.",
];

function clampEnergy(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Lucid Dreaming Mode — a fully automatic NIGHT overlay on the normal Progress/Recovery/Neutral
// mode, derived purely from local time via isLdmActive (no button/session/route). Active
// 9:00 PM through the shared 6:00 AM quest-day boundary.
const PRE_SLEEP_ROUTINE_TITLE = "Start pre-sleep routine";
/** Squarely in the existing Low Flame band (25-44) — see getFireAssetForEnergy. */
const LDM_FORCED_FLAME_SCORE = 30;
const PRE_SLEEP_ROUTINE_DURATION_MINUTES = 60;
/** Total scheduled quest duration shown during LDM may never exceed this — the 60-min routine
 *  quest counts toward it, leaving at most 60 more minutes for other LDM-eligible quests. */
const LDM_BOARD_CAPACITY_MINUTES = 120;
const PRE_SLEEP_ROUTINE_ITEMS = [
  { id: "hygiene", text: "Brush teeth, wash up, and get your body ready for sleep." },
  { id: "journaling", text: "Write down what you're carrying so your mind can rest." },
  { id: "reading", text: "Read something calm or light. No pressure to finish." },
  { id: "night-reflection", text: "Look back on today with kindness — no judgment, just noticing." },
] as const;


// Maps the energy reserve to one of the five emotive fire PNG assets.
// Bands: 0–24 ember · 25–44 low · 45–64 steady · 65–84 bright · 85–100 blazing.
function getFireAssetForEnergy(score: number) {
  if (score >= 85) {
    return { image: fireAssets.blazingFlame, animated: fireAnimations.blazingSheet, emoji: "🔥", label: "Blazing Flame", size: 74 };
  }

  if (score >= 65) {
    return { image: fireAssets.brightFlame, animated: fireAnimations.brightSheet, emoji: "🔥", label: "Bright Flame", size: 62 };
  }

  if (score >= 45) {
    return { image: fireAssets.steadyFlame, animated: fireAnimations.steadySheet, emoji: "🔥", label: "Steady Flame", size: 50 };
  }

  if (score >= 25) {
    return { image: fireAssets.lowFlame, animated: fireAnimations.lowSheet, emoji: "🔥", label: "Low Flame", size: 40 };
  }

  return { image: fireAssets.ember, animated: fireAnimations.emberSheet, emoji: "✨", label: "Ember", size: 30 };
}

/**
 * Quest visual system — separates WHAT a quest means (modeType: item.kind, already tracked)
 * from HOW it's drawn (sourceType, derived here, purely presentational). Never inferred the
 * other way around: a card's color never changes what mode/energy effect it actually has.
 */
type QuestSourceType = "regular" | "today" | "path";

function getQuestSourceType(item: HomeQuestItem): QuestSourceType {
  if (item.source === "Today's Quest") return "today";
  // "Path Quest" = quests the path/pipeline system itself surfaced (Evie's suggested quest,
  // the post-progress recovery starter) — not a separately stored field, just what
  // suggested/starter already mean.
  if (item.suggested || item.starter) return "path";
  return "regular";
}

function getQuestVisual(item: HomeQuestItem): { fill: string; text: string; border: string; meta: string; badge?: string } {
  const sourceType = getQuestSourceType(item);
  const modeColor = item.kind === "recovery" ? "#7C3AED" : "#FBBF24";

  if (sourceType === "today") {
    // White fill regardless of Progress/Recovery — the small badge dot carries the mode.
    return { fill: "#FFFFFF", text: "#1F2937", border: "#1F2937", meta: "#4B5563", badge: modeColor };
  }
  if (sourceType === "path") {
    // Green fill regardless of Progress/Recovery — same badge convention as Today.
    return { fill: "#22C55E", text: "#052E14", border: "#14532D", meta: "#0B3B1E", badge: modeColor };
  }
  return item.kind === "recovery"
    ? { fill: "#7C3AED", text: "#FFFFFF", border: "#4C1D95", meta: "#E9D5FF" }
    : { fill: "#FBBF24", text: "#241A00", border: "#92610A", meta: "#4A3200" };
}

// Day / Time Track spans 6 AM → 12 PM → 6 PM → 12 AM (an 18-hour window).
// Times before 6 AM wrap to the far (late-night) end so the marker stays valid.
function getCurrentTimeTrackPosition(now: Date): number {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = 6 * 60;
  const spanMinutes = 18 * 60;
  let offset = minutes - startMinutes;
  if (offset < 0) offset += 24 * 60;
  const pct = (offset / spanMinutes) * 100;
  return Math.max(2, Math.min(98, pct));
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mobile = useMobileFrame();

  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const rawEnergy = Array.isArray(params.energy) ? params.energy[0] : params.energy;

  const hasRouteCheckIn =
    (rawMode === "Recovery" || rawMode === "Progress") &&
    rawEnergy !== undefined &&
    rawEnergy !== null &&
    rawEnergy !== "";

  const routeEnergyNumber = hasRouteCheckIn ? Number(rawEnergy) : NaN;
  const hasRouteEnergy = hasRouteCheckIn && !Number.isNaN(routeEnergyNumber);

  const [savedMode, setSavedMode] = useState<"Recovery" | "Progress">("Recovery");
  const [savedEnergy, setSavedEnergy] = useState(0);
  const [hasSavedCheckIn, setHasSavedCheckIn] = useState(false);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan>({
    todayGoal: "",
    Monday: "",
    Tuesday: "",
    Wednesday: "",
    Thursday: "",
    Friday: "",
    Saturday: "",
    Sunday: "",
    monday: "",
    tuesday: "",
    wednesday: "",
    thursday: "",
    friday: "",
    saturday: "",
    sunday: "",
  });

  const [completedQuests, setCompletedQuests] = useState<CompletionEntry[]>([]);
  const [missedQuests, setMissedQuests] = useState<MissedEntry[]>([]);
  const [focusLog, setFocusLog] = useState<FocusBlockLogEntry[]>([]);
  const [userStats, setUserStats] = useState<{ totalSteps?: number }>({});
  const [affirmationsCount, setAffirmationsCount] = useState(0);
  const [affirmationTexts, setAffirmationTexts] = useState<string[]>([]);
  const [afternoonUnlockLabel, setAfternoonUnlockLabel] = useState(DEFAULT_AFTERNOON_UNLOCK_TIME);
  const [afternoonUnlockChecked, setAfternoonUnlockChecked] = useState(false);
  const [afternoonWakeTimeLabel, setAfternoonWakeTimeLabel] = useState<string | undefined>(undefined);
  const [guideReaction, setGuideReaction] = useState<CompletionGuide | null>(null);
  const [flameReaction, setFlameReaction] = useState<CompletionEnergyEffect | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const reactionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (mounted) setReducedMotion(Boolean(enabled));
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (enabled: boolean) =>
      setReducedMotion(Boolean(enabled))
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  // Guide/flame REACT to every completion, then return to their prior idle state — the global
  // "+N STEPS" toast (mounted at the app root) already covers the haptic + step confirmation
  // for every completion path; this adds the Home-specific visual reaction on top whenever
  // Home is the screen that's mounted. Skipped entirely with reduced motion (the toast's static
  // text is the whole confirmation in that case).
  useEffect(() => {
    return subscribeToCompletionFeedback((event) => {
      if (reducedMotion) return;
      if (reactionTimeout.current) clearTimeout(reactionTimeout.current);
      setGuideReaction(event.guide);
      setFlameReaction(event.energyEffect);
      reactionTimeout.current = setTimeout(() => {
        setGuideReaction(null);
        setFlameReaction(null);
      }, 800);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    return () => {
      if (reactionTimeout.current) clearTimeout(reactionTimeout.current);
    };
  }, []);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [stepRank, setStepRank] = useState<StepRank | null>(null);
  // Monotonic high-water mark for total earned steps — never lets the displayed/ranked
  // total drop below the highest value ever computed (see reconcileMonotonicTotalSteps).
  const [stepsFloor, setStepsFloor] = useState(0);

  const [dayPlanRaw, setDayPlanRaw] = useState<DayPlanRaw | null>(null);
  const [preSleepDoneToday, setPreSleepDoneToday] = useState(false);
  // checkedIds is a map (not an array of plain strings) so the cross-device object merge
  // (mergeJsonArrays only merges arrays of OBJECTS by id — plain strings are silently dropped)
  // never wipes out checked routine progress.
  const [preSleepRoutineChecked, setPreSleepRoutineChecked] = useState<{ questDayKey: string; checkedIds: Record<string, boolean> }>({
    questDayKey: "",
    checkedIds: {},
  });
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [showFoodLogModal, setShowFoodLogModal] = useState(false);
  const [evieMorningQuest, setEvieMorningQuest] = useState<EvieMorningQuest | null>(null);
  const [activeItem, setActiveItem] = useState<ActiveTimedItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<HomeQuestItem | null>(null);
  const [lockMessage, setLockMessage] = useState("");
  const [showQuestHelp, setShowQuestHelp] = useState(false);
  const [showHomeLunaModal, setShowHomeLunaModal] = useState(false);
  const [showHomeEvieModal, setShowHomeEvieModal] = useState(false);
  const [showQuestChooserModal, setShowQuestChooserModal] = useState(false);
  const [timeNow, setTimeNow] = useState<Date>(() => new Date());
  const [countdownNow, setCountdownNow] = useState<number>(() => Date.now());
  const [recoveryNow, setRecoveryNow] = useState<number>(() => Date.now());
  const lockMessageTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latestCheckInDay = latestCheckIn?.createdAt
    ? new Date(latestCheckIn.createdAt).toLocaleDateString("en-CA")
    : null;
  const latestCheckInTime = latestCheckIn?.createdAt
    ? new Date(latestCheckIn.createdAt).getTime()
    : null;
  const pathSetTime = profile?.goalsGeneratedAt
    ? new Date(profile.goalsGeneratedAt).getTime()
    : null;
  const isSavedCheckInToday = latestCheckInDay === getTodayKey();
  const isSavedCheckInAfterPath =
    latestCheckInTime !== null && pathSetTime !== null
      ? latestCheckInTime >= pathSetTime
      : true;
  const hasSavedEnergyData =
    hasSavedCheckIn &&
    latestCheckIn !== null &&
    isSavedCheckInToday &&
    isSavedCheckInAfterPath;

  const hasEnergyData = hasRouteEnergy || hasSavedEnergyData;

  const baseEnergyYield = hasRouteEnergy ? routeEnergyNumber : hasSavedEnergyData ? savedEnergy : 0;

  useFocusEffect(
    useCallback(() => {
      loadProgressState();
      loadLatestCheckIn();
      loadQuickThoughts();
      loadDayPlan();
      loadActiveItem();
      loadPreSleepStatus();
      loadFoodLogs();
      loadEvieMorningQuest();
      loadPreSleepRoutineChecked();
      loadAfternoonUnlockLabel();
    }, [])
  );

  useEffect(() => {
    loadProgressState();
    loadProfile();
    loadLatestCheckIn();
    loadQuickThoughts();
    loadDayPlan();
    loadActiveItem();
    loadPreSleepStatus();
    loadFoodLogs();
    loadEvieMorningQuest();
    loadPreSleepRoutineChecked();
    loadAfternoonUnlockLabel();
  }, []);

  /** Same computation sleep-checkin.tsx uses for its own lock screen — kept in sync via the
   *  shared computeAfternoonUnlockLabel helper so Home's gate and the form's lock agree.
   *  Prefers today's actually-recorded wake time (Morning Check-In) over the general
   *  planned/learned estimate, read directly rather than via `latestCheckIn` state to avoid a
   *  load-order race within this same effect. */
  async function loadAfternoonUnlockLabel() {
    const [lifeProfile, guideMemory, savedCheckInRaw] = await Promise.all([
      loadUserLifeProfile(),
      loadGuideMemory(),
      AsyncStorage.getItem(CHECKIN_KEY),
    ]);
    let todayRecordedWakeTime: string | undefined;
    try {
      const saved = savedCheckInRaw ? (JSON.parse(savedCheckInRaw) as CheckIn) : null;
      if (saved?.createdAt && getQuestDayKey(new Date(saved.createdAt)) === getQuestDayKey()) {
        todayRecordedWakeTime = saved.wakeTime || saved.finalWakeTime;
      }
    } catch {
      // Malformed saved check-in — fall back to the general estimate.
    }
    setAfternoonUnlockLabel(
      computeAfternoonUnlockLabel(lifeProfile.plannedWakeTime, guideMemory.wakeRhythm?.consistentWakeTimeEstimate, todayRecordedWakeTime)
    );
    setAfternoonWakeTimeLabel(todayRecordedWakeTime || lifeProfile.plannedWakeTime || guideMemory.wakeRhythm?.consistentWakeTimeEstimate);
    setAfternoonUnlockChecked(true);
  }

  // Cross-device convergence: useFocusEffect above only re-reads LOCAL storage, which still
  // reflects whatever the one-time startup merge produced — if another device changes LDM/quest
  // state in the cloud afterward, this device would otherwise never see it without a full
  // reload. Re-runs the cloud merge (safe/idempotent, coalesced by mergeInFlight) whenever the
  // app is foregrounded, plus a light poll while it stays foregrounded, then reloads local
  // state from the freshly-merged snapshot. No realtime subscriptions exist in this codebase
  // yet, so this is the narrow foreground refetch + polling fallback.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    async function rehydrateFromCloud() {
      await mergeCloudIntoLocalSafely();
      loadProgressState();
      loadLatestCheckIn();
      loadQuickThoughts();
      loadDayPlan();
      loadActiveItem();
      loadPreSleepStatus();
      loadFoodLogs();
      loadEvieMorningQuest();
      loadPreSleepRoutineChecked();
    }

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") void rehydrateFromCloud();
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);

    const CROSS_DEVICE_POLL_MS = 2 * 60 * 1000;
    const pollId = setInterval(() => {
      if (AppState.currentState === "active") void rehydrateFromCloud();
    }, CROSS_DEVICE_POLL_MS);

    return () => {
      subscription.remove();
      clearInterval(pollId);
    };
  }, []);

  // Keep the Day / Time Track marker (and the guide message slot, which is derived from
  // timeNow) on the real local time — refreshed every 30s while foregrounded, and immediately
  // on foreground itself so a backgrounded app never shows a stale slot for up to 30s after
  // reopening. No permanent background interval: this timer only runs while the screen/app is
  // actually mounted and active.
  useEffect(() => {
    const id = setInterval(() => setTimeNow(new Date()), 30000);
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") setTimeNow(new Date());
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, []);

  // Tick the active countdown once per second while a timed item is running.
  useEffect(() => {
    if (!activeItem) return;
    setCountdownNow(Date.now());
    const id = setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeItem]);

  useEffect(() => {
    return () => {
      if (lockMessageTimeout.current) clearTimeout(lockMessageTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (hasRouteEnergy && (rawMode === "Recovery" || rawMode === "Progress")) {
      setSavedMode(rawMode);
      setSavedEnergy(routeEnergyNumber);
      setHasSavedCheckIn(true);
    }
  }, [hasRouteEnergy, rawMode, routeEnergyNumber]);

  async function lightHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function mediumHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function navigateWithHaptic(path: any) {
    await lightHaptic();
    router.push(path);
  }

  async function loadProfile() {
    const saved = await AsyncStorage.getItem(PROFILE_KEY);

    if (!saved) {
      setProfile(null);
      setProfileChecked(true);
      return;
    }

    setProfile(JSON.parse(saved));
    setProfileChecked(true);
  }

  async function loadQuickThoughts() {
    const saved = await AsyncStorage.getItem(TOMORROW_QUEUE_KEY);

    if (!saved) {
      setQueueItems([]);
      return;
    }

    try {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        setQueueItems(parsed);
      } else {
        setQueueItems([]);
      }
    } catch {
      setQueueItems([]);
    }
  }

  async function loadDayPlan() {
    const saved = await AsyncStorage.getItem(DAY_PLAN_KEY);

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as Partial<DayPlan> & Record<string, string | undefined>;

      setDayPlanRaw(parsed as DayPlanRaw);
      setDayPlan({
        todayGoal: parsed.todayGoal || "",
        Monday: parsed.Monday || parsed.monday || "",
        Tuesday: parsed.Tuesday || parsed.tuesday || "",
        Wednesday: parsed.Wednesday || parsed.wednesday || "",
        Thursday: parsed.Thursday || parsed.thursday || "",
        Friday: parsed.Friday || parsed.friday || "",
        Saturday: parsed.Saturday || parsed.saturday || "",
        Sunday: parsed.Sunday || parsed.sunday || "",
        monday: parsed.monday || parsed.Monday || "",
        tuesday: parsed.tuesday || parsed.Tuesday || "",
        wednesday: parsed.wednesday || parsed.Wednesday || "",
        thursday: parsed.thursday || parsed.Thursday || "",
        friday: parsed.friday || parsed.Friday || "",
        saturday: parsed.saturday || parsed.Saturday || "",
        sunday: parsed.sunday || parsed.Sunday || "",
      });
    } catch {
      // Keep the default empty day plan if saved data cannot be parsed.
    }
  }

  async function loadProgressState() {
    const [completions, missed, stats, focusLogEntries, savedDailyLog, savedLegacyFloor, affirmationsRaw] = await Promise.all([
      loadTodayCompletions(),
      loadTodayMissed(),
      AsyncStorage.getItem(USER_STATS_KEY),
      loadFocusBlockLog(),
      AsyncStorage.getItem(DAILY_STEPS_LOG_KEY),
      AsyncStorage.getItem(TOTAL_STEPS_FLOOR_KEY),
      AsyncStorage.getItem(AFFIRMATIONS_KEY),
    ]);
    setCompletedQuests(completions);
    setMissedQuests(missed);
    setFocusLog(focusLogEntries);
    try {
      const parsedAffirmations = affirmationsRaw ? JSON.parse(affirmationsRaw) : [];
      const list = Array.isArray(parsedAffirmations) ? parsedAffirmations : [];
      setAffirmationsCount(list.length);
      setAffirmationTexts(
        list
          .map((entry) => (entry && typeof entry === "object" ? String((entry as { text?: unknown }).text ?? "").trim() : ""))
          .filter((text): text is string => text.length > 0)
      );
    } catch {
      setAffirmationsCount(0);
      setAffirmationTexts([]);
    }
    if (stats) {
      try {
        setUserStats(JSON.parse(stats));
      } catch {
        setUserStats({});
      }
    }
    // Home and Stats must read total steps from the same canonical source. Seed the floor
    // from storage immediately (not just from the reconcile-triggered effect below) so Home
    // never flashes a lower number than Stats while today's completions are still loading.
    let seededFloor = 0;
    try {
      const parsedLog = savedDailyLog ? JSON.parse(savedDailyLog) : null;
      if (parsedLog && typeof parsedLog === "object" && !Array.isArray(parsedLog)) {
        seededFloor = Object.values(parsedLog as Record<string, unknown>).reduce(
          (sum: number, value) => sum + (Number(value) || 0),
          0
        );
      }
    } catch {
      // Ignore malformed ledger data — the reconcile effect will still repair it.
    }
    if (!seededFloor && savedLegacyFloor) {
      try {
        const parsedFloor = Number(JSON.parse(savedLegacyFloor));
        if (Number.isFinite(parsedFloor)) seededFloor = parsedFloor;
      } catch {
        // Ignore malformed legacy floor data.
      }
    }
    if (seededFloor) setStepsFloor((current) => Math.max(current, seededFloor));
  }

  async function loadLatestCheckIn() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);

    if (!saved) {
      setHasSavedCheckIn(false);
      setLatestCheckIn(null);
      return;
    }

    const checkIn = JSON.parse(saved);

    if (
      (checkIn.mode === "Recovery" || checkIn.mode === "Progress") &&
      typeof checkIn.energy === "number"
    ) {
      setSavedMode(checkIn.mode);
      setSavedEnergy(checkIn.energy);
      setHasSavedCheckIn(true);
      setLatestCheckIn(checkIn);
    } else {
      setHasSavedCheckIn(false);
      setLatestCheckIn(null);
    }
  }

  async function loadPreSleepStatus() {
    const saved = await AsyncStorage.getItem(LATEST_PRE_SLEEP_INTENTION_KEY);
    if (!saved) {
      setPreSleepDoneToday(false);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as { date?: string };
      setPreSleepDoneToday(parsed?.date === getTodayKey());
    } catch {
      setPreSleepDoneToday(false);
    }
  }

  async function loadFoodLogs() {
    const logs = await readJson<FoodLog[]>(FOOD_LOGS_KEY, []);
    setFoodLogs(Array.isArray(logs) ? logs : []);
  }

  async function loadEvieMorningQuest() {
    setEvieMorningQuest(await loadTodaysEvieMorningQuest());
  }

  async function loadPreSleepRoutineChecked() {
    const saved = await readJson<{ questDayKey: string; checkedIds: Record<string, boolean> } | null>(SLEEP_ROUTINE_KEY, null);
    if (saved && saved.questDayKey === getQuestDayKey()) {
      setPreSleepRoutineChecked({ questDayKey: saved.questDayKey, checkedIds: saved.checkedIds ?? {} });
    } else {
      setPreSleepRoutineChecked({ questDayKey: getQuestDayKey(), checkedIds: {} });
    }
  }

  async function loadActiveItem() {
    const saved = await AsyncStorage.getItem(ACTIVE_TIMED_ITEM_KEY);

    if (!saved) {
      setActiveItem(null);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as ActiveTimedItem;
      if (parsed && typeof parsed.title === "string" && typeof parsed.endsAt === "number") {
        setActiveItem(parsed);
      } else {
        setActiveItem(null);
      }
    } catch {
      setActiveItem(null);
    }
  }

  async function saveActiveItem(item: ActiveTimedItem) {
    setActiveItem(item);
    await persistProgressKeys({ [ACTIVE_TIMED_ITEM_KEY]: JSON.stringify(item) });
  }

  async function clearActiveItem() {
    setActiveItem(null);
    // Clears cloud too — otherwise a resolved timer could be "resurrected" by the next sign-in merge.
    await clearProgressKey(ACTIVE_TIMED_ITEM_KEY);
  }

  function showLockMessage() {
    mediumHaptic();
    setLockMessage("Finish the current quest first.");
    if (lockMessageTimeout.current) clearTimeout(lockMessageTimeout.current);
    lockMessageTimeout.current = setTimeout(() => setLockMessage(""), 2500);
  }

  function showRecoveryLockMessage() {
    mediumHaptic();
    setLockMessage("Recovery time — the board unlocks again in a bit.");
    if (lockMessageTimeout.current) clearTimeout(lockMessageTimeout.current);
    lockMessageTimeout.current = setTimeout(() => setLockMessage(""), 2500);
  }

  function showMandatoryLockMessage() {
    mediumHaptic();
    setLockMessage("Your flame is low — finish the eat or rest quest first.");
    if (lockMessageTimeout.current) clearTimeout(lockMessageTimeout.current);
    lockMessageTimeout.current = setTimeout(() => setLockMessage(""), 2500);
  }

  function openQuestItem(item: HomeQuestItem) {
    // Completing the food gate requires a genuinely new meal log, not a tap-complete — open
    // Food Log directly. A qualifying meal logged while this gate is active clears it and
    // awards its steps once (see the FoodLogModal onSaved handler below).
    if (item.title === MANDATORY_FOOD_QUEST_TITLE) {
      lightHaptic();
      setShowFoodLogModal(true);
      return;
    }
    if (item.source === "Sleep") {
      lightHaptic();
      router.push("/pre-sleep-intention");
      return;
    }
    // Mild mandatory (15 min) only blocks PROGRESS starts; severe (30 min) blocks everything.
    if (mandatoryActive && !item.mandatory && (mandatoryLocksRecoveryToo || item.kind !== "recovery")) {
      showMandatoryLockMessage();
      return;
    }
    // Checklist items are a checkbox, not a timed quest — they can be reviewed/marked
    // complete even while another timed quest is active or during a recovery lock.
    if (item.source === "Checklist") {
      lightHaptic();
      setSelectedItem(item);
      return;
    }
    if (isRecoveryLocked) {
      showRecoveryLockMessage();
      return;
    }
    if (activeItem) {
      showLockMessage();
      return;
    }
    lightHaptic();
    setSelectedItem(item);
  }

  /** Explicit guide metadata first (mandatory Luna gates, Evie Path quests); generic items fall
   *  back to whichever guide is currently active — never inferred from card color. */
  function resolveCompletionGuide(item: HomeQuestItem): CompletionGuide {
    return item.guide ?? (isRecovery ? "luna" : "evie");
  }

  /** Checklist habits are simple/neutral; mandatory Luna quests and recovery-kind items restore;
   *  everything else (demanding Path/progress tasks) consumes. Visual feedback only — never
   *  changes the stored energy stage itself (that's still driven by getEnergyDelta elsewhere). */
  function resolveCompletionEnergyEffect(item: HomeQuestItem): CompletionEnergyEffect {
    if (item.source === "Checklist") return "neutral";
    if (item.mandatory || item.kind === "recovery") return "restore";
    return "consume";
  }

  async function completeChecklistItem(item: HomeQuestItem) {
    const ok = await setChecklistItemChecked(item.id, true);
    if (!ok) return;
    // Also record a completion entry so this checklist item's duration/kind feeds
    // into today's energy math (progress spends energy, recovery restores it).
    const nextCompleted = await markItemComplete(item, completedQuests);
    const wasNewCompletion = nextCompleted.length > completedQuests.length;
    setCompletedQuests(nextCompleted);
    setFocusLog(await loadFocusBlockLog());
    await successHaptic();
    setSelectedItem(null);
    await loadDayPlan();
    if (wasNewCompletion) {
      emitQuestCompletionFeedback({
        completionId: item.id,
        questId: item.id,
        stepsAwarded: item.steps,
        guide: resolveCompletionGuide(item),
        energyEffect: resolveCompletionEnergyEffect(item),
      });
    }
    void trackEvent(ANALYTICS_EVENTS.quest_completed, { id: item.id, title: item.title, steps: item.steps, source: item.source });
  }

  async function startTimedItem(item: HomeQuestItem) {
    // Mild mandatory (15 min) only blocks PROGRESS starts; severe (30 min) blocks everything.
    if (mandatoryActive && !item.mandatory && (mandatoryLocksRecoveryToo || item.kind !== "recovery")) {
      showMandatoryLockMessage();
      return;
    }
    if (isRecoveryLocked) {
      showRecoveryLockMessage();
      return;
    }
    if (activeItem) {
      showLockMessage();
      return;
    }

    const durationMinutes = item.durationMinutes > 0 ? item.durationMinutes : 30;
    const startedAt = Date.now();
    const next: ActiveTimedItem = {
      id: item.id,
      title: item.title,
      source: item.source,
      kind: item.kind,
      steps: item.steps,
      durationMinutes,
      startedAt,
      endsAt: startedAt + durationMinutes * 60 * 1000,
      scheduledTime: item.scheduledTime,
    };

    setSelectedItem(null);
    await saveActiveItem(next);
    await mediumHaptic();
    void trackEvent(ANALYTICS_EVENTS.quest_started, { id: item.id, title: item.title, source: item.source });
    void syncQuestStarted(item);
  }

  // Completion is the ONLY place steps are awarded — never on Start.
  async function completeQuestItem(item: HomeQuestItem) {
    if (completedQuests.some((entry) => entry.id === item.id)) return;

    let nextCompleted = completedQuests;
    try {
      nextCompleted = await markItemComplete(item, completedQuests);
    } catch (error) {
      // A storage failure here must never leave the card stuck on the board forever — the
      // user already pressed Complete, so still dismiss the active timer even though the
      // completion record (and its steps) couldn't be persisted this time.
      console.warn("markItemComplete error:", error);
      if (activeItem?.id === item.id) await clearActiveItem();
      setSelectedItem(null);
      return;
    }

    // These two MUST run so the card actually disappears from the board — everything below
    // is best-effort. If a later call here throws, completedQuests already contains this
    // item, so the guard above would silently block every future tap while the active-timer
    // card stayed stuck forever (the exact "Complete does nothing" bug). Isolating the
    // best-effort work in its own try/catch means a failure there can no longer do that.
    setCompletedQuests(nextCompleted);
    setSelectedItem(null);
    if (activeItem?.id === item.id) {
      await clearActiveItem();
    }

    emitQuestCompletionFeedback({
      completionId: item.id,
      questId: item.id,
      stepsAwarded: item.steps,
      guide: resolveCompletionGuide(item),
      energyEffect: resolveCompletionEnergyEffect(item),
    });

    try {
      await successHaptic();
      setFocusLog(await loadFocusBlockLog());
      await loadDayPlan();
      await loadQuickThoughts();
    } catch (error) {
      console.warn("completeQuestItem follow-up error:", error);
    }

    void trackEvent(ANALYTICS_EVENTS.quest_completed, { id: item.id, title: item.title, steps: item.steps });
    void syncQuestCompleted(item);
    void recordAgentEvent({
      type: "quest_completed",
      sourcePage: "home",
      relatedItemId: item.id,
      mode: item.kind,
      durationMinutes: item.durationMinutes,
      stepDelta: item.steps,
      metadata: { source: item.source, title: item.title },
    });
  }

  async function completeActiveItem() {
    if (!activeItem) return;
    const boardItem: HomeQuestItem = {
      id: activeItem.id,
      title: activeItem.title,
      source: activeItem.source,
      kind: activeItem.kind,
      steps: activeItem.steps,
      durationMinutes: activeItem.durationMinutes,
      scheduledTime: activeItem.scheduledTime,
    };
    await completeQuestItem(boardItem);
  }

  /**
   * A meal logged while the food gate is active clears it — steps are awarded exactly once
   * through the SAME completeQuestItem/markItemComplete ledger every other quest uses, not a
   * separate reward path. Looks up the gate's already-normalized board item (computed this
   * render, before the new log) rather than reconstructing its id, so the id always matches
   * exactly what the board itself used.
   */
  async function handleFoodLogSaved(log: FoodLog) {
    await loadFoodLogs();
    if (log.entryType !== "meal") return;
    const gateItem = allHomeItems.find((item) => item.title === MANDATORY_FOOD_QUEST_TITLE);
    if (gateItem) {
      await completeQuestItem(gateItem);
    }
  }

  async function missQuestItem(item: HomeQuestItem) {
    const nextMissed = await markItemMissed(item, missedQuests, activeItem?.id ?? null);
    await lightHaptic();
    setMissedQuests(nextMissed);
    setSelectedItem(null);
    if (activeItem?.id === item.id) {
      await clearActiveItem();
    }
    void trackEvent(ANALYTICS_EVENTS.quest_missed, { id: item.id, title: item.title });
    void syncQuestMissed(item);
    void recordAgentEvent({
      type: "quest_missed",
      sourcePage: "home",
      relatedItemId: item.id,
      mode: item.kind,
      durationMinutes: item.durationMinutes,
      metadata: { source: item.source, title: item.title },
    });
    router.push({ pathname: "/reflection", params: { quest: item.title } });
  }

  async function reflectActiveItem() {
    if (!activeItem) return;
    const boardItem: HomeQuestItem = {
      id: activeItem.id,
      title: activeItem.title,
      source: activeItem.source,
      kind: activeItem.kind,
      steps: activeItem.steps,
      durationMinutes: activeItem.durationMinutes,
      scheduledTime: activeItem.scheduledTime,
    };
    await missQuestItem(boardItem);
  }

  const questContext: QuestProfileContext = {
    category: profile?.dreamCategory?.trim() || "Purpose",
    specificGoal: profile?.specificGoal?.trim() || "",
    progressMeaning: profile?.progressMeaning?.trim() || "",
    shortTermBenchmark: profile?.shortTermGoal?.trim() || profile?.goalOne?.trim() || "",
    midTermBenchmark: profile?.midTermGoal?.trim() || profile?.goalTwo?.trim() || "",
    longTermBenchmark: profile?.longTermGoal?.trim() || profile?.goalThree?.trim() || "",
  };

  const completedMandatoryEntries = completedQuests.filter((entry) => isMandatoryQuestTitle(entry.title));
  const completedNormalEntries = completedQuests.filter((entry) => !isMandatoryQuestTitle(entry.title));
  // The flame is anchored to the latest check-in's energy. Only quests completed AFTER that
  // check-in should move it — anything finished earlier in the day is already baked into the
  // energy the user reported at check-in, so re-subtracting it double-counts and made a fresh
  // check-in of e.g. 86 show up as 72 on Home.
  const checkInAtMs = latestCheckIn?.createdAt ? new Date(latestCheckIn.createdAt).getTime() : 0;
  const completedAfterCheckIn = (entry: CompletionEntry) => {
    if (!checkInAtMs) return true;
    const at = entry.completedAt ? new Date(entry.completedAt).getTime() : 0;
    return at >= checkInAtMs;
  };
  const energyRelevantEntries = completedNormalEntries.filter(completedAfterCheckIn);
  // Every completed non-mandatory item applies its signed energy delta once:
  // progress spends (-1/-3/-5/-7), recovery restores (+2/+4/+6/+8), naps restore (+5/+10).
  // Legacy completions saved before `kind` was tracked default to "progress".
  const questEnergyDelta = energyRelevantEntries.reduce(
    (sum, entry) => sum + getEnergyDelta({ kind: entry.kind ?? "progress", durationMinutes: entry.durationMinutes, title: entry.title }),
    0
  );
  // Minutes of PROGRESS work completed today — after 60, the app offers a recovery starter.
  const progressMinutesToday = completedNormalEntries
    .filter((entry) => entry.kind !== "recovery")
    .reduce((sum, entry) => sum + (typeof entry.durationMinutes === "number" ? entry.durationMinutes : 0), 0);
  const passiveDecay =
    hasEnergyData && latestCheckIn?.createdAt
      ? Math.floor(
          Math.max(0, Date.now() - new Date(latestCheckIn.createdAt).getTime()) /
            (PASSIVE_DECAY_INTERVAL_HOURS * 60 * 60 * 1000)
        ) * PASSIVE_DECAY_POINTS
      : 0;
  // Each mandatory completion restores based on ITS OWN duration (mild 15-min → +5, severe
  // 30-min → +10) — previously this multiplied a flat +5 by count regardless of which tier
  // was actually completed, so the severe (harder, lower-energy) tier under-restored.
  const mandatoryRecoveryBoost = completedMandatoryEntries
    .filter(completedAfterCheckIn)
    .reduce((sum, entry) => sum + getMandatoryQuestRestoreEnergy(entry.durationMinutes ?? MANDATORY_MILD_DURATION_MINUTES), 0);
  // Forced Recovery's +10 energy restore is applied through questEnergyDelta above like any
  // other completion (see getForcedRecoveryTrigger/buildForcedRecoveryItem below) — no separate
  // schedule-based restore needed here.
  const energyYield = hasEnergyData
    ? clampEnergy(baseEnergyYield - passiveDecay + questEnergyDelta + mandatoryRecoveryBoost)
    : 0;

  // CHANGE 3: mode is derived live from current energy so Home, Quest Board, guide text,
  // and Stats all agree. Progress at >= 60, Recovery at <= 59, Neutral before check-in.
  const currentMode: ModeState = !hasEnergyData ? "Neutral" : energyYield >= 60 ? "Progress" : "Recovery";
  const isRecovery = currentMode === "Recovery";
  const isProgress = currentMode === "Progress";
  const isNeutral = currentMode === "Neutral";

  // "Energy: +4" / "Energy: -3" label shown on quest cards, the detail modal, and the
  // active timer, matching exactly the energy applied when the item is completed.
  const energyLabelFor = (opts: { kind: QuestKind; durationMinutes: number; title: string; mandatory?: boolean }) =>
    formatEnergyDelta(
      getEnergyDelta({
        kind: opts.kind,
        durationMinutes: opts.durationMinutes,
        title: opts.title,
        // Title-specific, not "any mandatory item" — the wind-down quest is also
        // `mandatory: true` (for its "!" styling) but restores energy through the normal
        // Recovery formula, not the food/energy gate quests' tiered restore.
        mandatory: isMandatoryQuestTitle(opts.title),
      })
    );

  // Hunger/fuel — derived fresh from FoodLog timestamps every render (see lib/fuel.ts), never
  // decremented by a persisted interval. Recomputes on the same timeNow heartbeat everything
  // else on Home already uses (30s tick + AppState foreground refresh), so reload/foreground/
  // "next minute boundary" all just work without a dedicated fuel timer.
  const fuelResult = computeFuel(foodLogs, timeNow);
  // Green/gold at high fuel, purple at low — deliberately no red anywhere (this is a
  // supportive estimate, never a danger/alarm indicator).
  const fuelBarColor = fuelResult.fuel >= 60 ? "#FBBF24" : fuelResult.fuel >= 30 ? "#84CC16" : "#A78BFA";

  // LDM (Lucid Dreaming Mode) is fully automatic — 9:00 PM through the shared 6:00 AM quest-day
  // boundary — recomputed from timeNow, no button/session/route (see PRE_SLEEP_ROUTINE_* above).
  const ldmActive = isLdmActive(timeNow);
  const preSleepRoutineQuestDone = completedQuests.some((entry) => entry.title === PRE_SLEEP_ROUTINE_TITLE);
  const preSleepRoutineCheckedToday = preSleepRoutineChecked.questDayKey === getTodayKey() ? preSleepRoutineChecked.checkedIds : {};
  const preSleepRoutineAllChecked = PRE_SLEEP_ROUTINE_ITEMS.every((item) => Boolean(preSleepRoutineCheckedToday[item.id]));

  // Centralized Luna gate selector (priority order):
  //   1. Afternoon Check-In incomplete (past its unlock time) — full-board replacement, handled
  //      in render below, not as a quest-board item.
  //   2. Afternoon Check-In said "didn't eat" — mandatory food quest.
  //   3. Energy below the existing low-energy threshold — mandatory energy/rest quest.
  //   4. Both 2 and 3 — both quests show; ordinary quests stay locked until both resolve.
  //
  // afternoonUnlockAt = wakeTimestamp + 5 hours, using the real recorded wake time when known
  // (see loadAfternoonUnlockLabel's priority chain) — resolveWakeTimestamp anchors it to the
  // correct calendar date even for a wake time that crosses midnight. Falls back to the
  // label-based minutes-of-day comparison only when no wake timestamp can be resolved at all.
  const wakeTimestamp = resolveWakeTimestamp(afternoonWakeTimeLabel, timeNow);
  const afternoonUnlockAt = computeAfternoonUnlockTimestamp(wakeTimestamp);
  const afternoonUnlockFallbackMinutes = parseTimeToMinutes(afternoonUnlockLabel) ?? 14 * 60;
  const nowMinutesForGates = timeNow.getHours() * 60 + timeNow.getMinutes();
  const afternoonUnlockReached = afternoonUnlockAt
    ? timeNow.getTime() >= afternoonUnlockAt.getTime()
    : nowMinutesForGates >= afternoonUnlockFallbackMinutes;
  const afternoonUnlockDisplayLabel = afternoonUnlockAt ? formatMinutesAsTime(afternoonUnlockAt.getHours() * 60 + afternoonUnlockAt.getMinutes()) : afternoonUnlockLabel;
  const afternoonCheckInDoneToday =
    latestCheckIn?.afternoonCheckInCompletedToday === true && latestCheckIn?.afternoonCheckInQuestDayKey === getTodayKey();
  // Never unlocks during LDM, even once 5 hours have elapsed since waking.
  const afternoonCheckInUnlocked = !ldmActive && afternoonUnlockChecked && afternoonUnlockReached;
  // Only meaningful once Morning Check-In is already done (hasEnergyData) — Neutral mode has
  // its own separate "Complete Morning Check-In" prompt in generateQuests().
  const isAfternoonCheckInGateActive = hasEnergyData && afternoonCheckInUnlocked && !afternoonCheckInDoneToday;

  // Single centralized gate state machine (lib/mandatoryGates.ts) — both tap handlers and
  // rendering below derive from this SAME computed state, so they can never drift out of sync
  // with each other. completedTitlesToday comes from completedQuests, which is already
  // day-scoped (see loadTodayCompletions), so a stale prior-day completion can never satisfy
  // "already done today" and incorrectly suppress — or fail to clear — a gate.
  const completedTitlesToday = new Set(completedQuests.map((entry) => entry.title));
  const mandatoryGateState = computeMandatoryGateState({
    afternoonCheckInRequired: isAfternoonCheckInGateActive,
    eatenSinceMorning: latestCheckIn?.eatenSinceMorning,
    fuel: fuelResult.fuel,
    hasEnergyData,
    energyYield,
    completedTitlesToday,
  });
  const activeFoodGate = mandatoryGateState.gates.find((gate) => gate.id === "food") ?? null;
  const activeEnergyGate = mandatoryGateState.gates.find((gate) => gate.id === "energy") ?? null;
  const mandatoryFoodQuest: Quest | null = activeFoodGate
    ? {
        title: MANDATORY_FOOD_QUEST_TITLE,
        type: "Mandatory",
        steps: 1,
        durationMinutes: activeFoodGate.durationMinutes,
        restoreEnergy: getMandatoryQuestRestoreEnergy(activeFoodGate.durationMinutes),
        mandatory: true,
        guide: "luna",
        description: "It's okay to take a break. Eat so you have enough energy to continue.",
      }
    : null;
  const mandatoryEnergyQuest: Quest | null = activeEnergyGate
    ? {
        title: MANDATORY_ENERGY_QUEST_TITLE,
        type: "Mandatory",
        steps: 1,
        durationMinutes: activeEnergyGate.durationMinutes,
        restoreEnergy: getMandatoryQuestRestoreEnergy(activeEnergyGate.durationMinutes),
        mandatory: true,
        guide: "luna",
        description: "It's okay to take a break. Rest so you have enough energy to continue.",
      }
    : null;
  const mandatoryGateQuestCount = (mandatoryFoodQuest ? 1 : 0) + (mandatoryEnergyQuest ? 1 : 0);
  // Wind-down (time-based, see getWindDownQuest) only applies when no Luna gate quest is active.
  const windDownQuestActive = mandatoryGateQuestCount === 0 && !isAfternoonCheckInGateActive ? getWindDownQuest() : null;
  const mandatoryActive = mandatoryGateState.active || windDownQuestActive !== null;
  // The food gate and the severe energy tier both lock Recovery-kind items too — the mild
  // energy tier and wind-down leave Recovery open.
  const mandatoryLocksRecoveryToo = mandatoryGateState.locksRecovery;

  const todayName = getWeekdayName();

  // LDM forces the DISPLAYED flame to the existing Low Flame band (25-44) without touching
  // energyYield itself — every other calculation (mandatory gates, energy costs/restores,
  // Stats) keeps reading the real underlying stored value untouched. Normal flame selection
  // resumes automatically once ldmActive goes false (this recomputes on the very next render).
  const flameState = useMemo(
    () => getFireAssetForEnergy(ldmActive ? LDM_FORCED_FLAME_SCORE : energyYield),
    [energyYield, ldmActive]
  );
  const flameLabel = ldmActive ? flameState.label : hasEnergyData ? flameState.label : "Check-in needed";

  const modeInstruction = isNeutral
    ? "A new day awaits. Small steps today, bright tomorrows."
    : isRecovery
    ? "Gentle steps today. You're doing enough."
    : "Keep building momentum. Your best day is ahead.";

  // LDM always uses Luna, regardless of the underlying stored day mode — previously this only
  // checked isRecovery, so a user whose last check-in was Progress-mode would see Evie during
  // LDM instead of Luna.
  const guideName = ldmActive || isRecovery ? "Luna" : "Evie";
  const guideImage = ldmActive || isRecovery ? uiAssets.guides.luna : uiAssets.guides.evie;
  // Deterministic by user + quest-day + 30-minute slot — every device on the same account
  // resolves the identical message at the identical slot without persisting "which message is
  // showing" anywhere (see getGuideMessageSlot/pickGuideMessage in lib/scheduling.ts).
  const guideMessageSlot = getGuideMessageSlot(timeNow);
  const guideMessageUserSalt = profile?.name?.trim() || "guest";
  const guideMessageSalt = `${guideMessageUserSalt}-${getQuestDayKey(timeNow)}-${guideMessageSlot}`;
  // Recovery mode mixes in the user's own saved affirmations alongside Luna's built-in
  // support messages; with none saved yet, Luna's built-ins are the whole pool.
  const lunaMessagePool = affirmationTexts.length > 0 ? [...LUNA_ROTATING_MESSAGES, ...affirmationTexts] : LUNA_ROTATING_MESSAGES;
  const guideMessage = pickGuideMessage(ldmActive || isRecovery ? lunaMessagePool : EVIE_ROTATING_MESSAGES, guideMessageSalt);
  const guideMessageIsAffirmation = isRecovery && affirmationTexts.includes(guideMessage);
  const neutralGuideMessage = pickGuideMessage(NEUTRAL_ROTATING_MESSAGES, guideMessageSalt);

  const theme = isRecovery
    ? {
        accent: "#C4A7FF",
        accent2: "#8B5CF6",
        glow: "#E9D5FF",
        dark: "rgba(22, 17, 42, 0.94)",
        panel: "rgba(18, 16, 34, 0.95)",
        soft: "#DDD6FE",
        status: "RECOVERY",
        mode: "RECOVERY MODE",
      }
    : isProgress
    ? {
        accent: "#FBBF24",
        accent2: "#84CC16",
        glow: "#FEF3C7",
        dark: "rgba(15, 18, 15, 0.94)",
        panel: "rgba(8, 13, 18, 0.95)",
        soft: "#D9F99D",
        status: "ACTIVE",
        mode: "PROGRESS MODE",
      }
    : {
        accent: "#F8C84A",
        accent2: "#22C55E",
        glow: "#FDE68A",
        dark: "rgba(11, 17, 22, 0.92)",
        panel: "rgba(8, 14, 18, 0.94)",
        soft: "#F8E7A1",
        status: "NEUTRAL",
        mode: "NEUTRAL MODE",
      };

  function generateQuests(): Quest[] {
    // Gate #1 (Afternoon Check-In incomplete) is a full-board replacement rendered separately —
    // no ordinary or other mandatory quest appears until it resolves.
    if (isAfternoonCheckInGateActive) return [];

    const gateQuests: Quest[] = [
      ...(mandatoryFoodQuest ? [mandatoryFoodQuest] : []),
      ...(mandatoryEnergyQuest ? [mandatoryEnergyQuest] : []),
    ];

    // LDM (9 PM–6 AM, see ldmActive) is a night overlay independent of the day's
    // Progress/Recovery/Neutral mode — Luna's pre-sleep routine quest always takes priority
    // here (after the gates above), with no daytime Progress/suggested quests mixed in (the
    // board's own LDM item filter, applied below, also excludes anything non-recovery).
    if (ldmActive) {
      const routineQuest: Quest | null = preSleepRoutineQuestDone
        ? null
        : {
            title: PRE_SLEEP_ROUTINE_TITLE,
            type: "Sleep",
            steps: getStepsForItem(PRE_SLEEP_ROUTINE_DURATION_MINUTES, "recovery"),
            durationMinutes: PRE_SLEEP_ROUTINE_DURATION_MINUTES,
            kind: "recovery",
            mandatory: true,
            guide: "luna",
            description: "Your pre-sleep routine — check off each step, then complete the quest once you're through.",
          };
      return [...gateQuests, ...(routineQuest ? [routineQuest] : [])];
    }

    if (isNeutral) {
      return [{ title: "Complete Morning Check-In", type: "Start", steps: 1 }];
    }

    const completedTitles = new Set(completedQuests.map((entry) => entry.title));
    const missedTitles = new Set(missedQuests.map((entry) => entry.title));

    // Evie's Morning Check-In quest takes the "first quest of the day" slot in place of the
    // generic algorithmic suggestion once it exists for today — one concrete quest, not two
    // competing suggestions on the board.
    const evieMorningQuestActive =
      evieMorningQuest && !completedTitles.has(evieMorningQuest.title) && !missedTitles.has(evieMorningQuest.title)
        ? evieMorningQuest
        : null;
    const suggestedQuest = evieMorningQuestActive
      ? null
      : getActiveSuggestedQuest(questContext, isProgress ? "progress" : "recovery", completedTitles, missedTitles);

    // After an hour of progress work today, offer a path-aligned recovery starter quest.
    const recoveryStarter = progressMinutesToday >= 60 ? generateRecoveryStarterQuest(questContext) : null;
    const recoveryStarterActive =
      recoveryStarter && !completedTitles.has(recoveryStarter.title) && !missedTitles.has(recoveryStarter.title)
        ? recoveryStarter
        : null;

    return [
      ...gateQuests,
      ...(windDownQuestActive ? [windDownQuestActive] : []),
      ...(evieMorningQuestActive ? [evieMorningQuestActive] : []),
      ...(suggestedQuest ? [suggestedQuest] : []),
      ...(recoveryStarterActive ? [recoveryStarterActive] : []),
    ];
  }

  /**
   * Time-based wind-down lock: once "now" is within [desiredSleepTime - windDownMinutes,
   * desiredSleepTime), Progress starts lock (Recovery/sleep-routine tasks stay open) and
   * this mandatory quest prompts the user to start their pre-sleep routine. Never stacks
   * with the energy-based mandatory quest above — that one takes priority if both are true.
   */
  function getWindDownQuest(): Quest | null {
    if (isNeutral) return null;
    // LDM's own pre-sleep routine quest already covers "start your pre-sleep routine" for
    // tonight — showing both would duplicate the same intent as two separate board entries.
    if (ldmActive) return null;
    const sleepTime = latestCheckIn?.desiredSleepTime;
    if (!sleepTime) return null;

    const alreadyDone = completedQuests.some((entry) => entry.title === WIND_DOWN_QUEST_TITLE);
    if (alreadyDone) return null;

    const sleepMinutes = parseTimeToMinutes(sleepTime);
    if (sleepMinutes === null) return null;
    const windDownMinutes = Math.min(MAX_WIND_DOWN_MINUTES, Number(latestCheckIn?.windDownMinutes) || DEFAULT_WIND_DOWN_MINUTES);
    const windDownStart = sleepMinutes - windDownMinutes;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    // Normalize into a 0–1440 same-day comparison, handling sleep times that cross midnight
    // (e.g. sleep at 12:30 AM -> windDownStart is still "tonight" before midnight).
    const inWindow = (candidate: number) => {
      const wrappedStart = ((windDownStart % 1440) + 1440) % 1440;
      const wrappedEnd = ((sleepMinutes % 1440) + 1440) % 1440;
      if (wrappedStart <= wrappedEnd) return candidate >= wrappedStart && candidate < wrappedEnd;
      return candidate >= wrappedStart || candidate < wrappedEnd;
    };
    if (!inWindow(nowMinutes)) return null;

    return {
      title: WIND_DOWN_QUEST_TITLE,
      type: "Mandatory",
      steps: 1,
      durationMinutes: windDownMinutes,
      mandatory: true,
      kind: "recovery",
      description: "Wind-down time — start your pre-sleep routine before your desired sleep time.",
    };
  }

  const todayKey = getTodayKey();
  const todayChecklist: RawChecklistItem[] = getChecklistItemsForDay(dayPlanRaw, todayName);
  const quests = generateQuests();
  const calendarItems = collectTodayCalendarItems(dayPlanRaw, queueItems, todayKey);
  const completedIds = new Set(completedQuests.map((entry) => entry.id));
  const missedIds = new Set(missedQuests.map((entry) => entry.id));
  const boardMode: "Progress" | "Recovery" = isRecovery ? "Recovery" : "Progress";

  const allHomeItems: HomeQuestItem[] =
    (hasEnergyData && !isNeutral) || ldmActive
      ? normalizeQuestItems({
          quests,
          todayQuest: dayPlanRaw?.todayQuest ?? null,
          checklist: todayChecklist,
          quickThoughts: queueItems,
          calendarItems,
          todayKey,
          completedIds,
          missedIds,
          preSleepIntentionDoneToday: preSleepDoneToday,
          now: timeNow,
        })
      : [];

  // During LDM only sleep/reflection/dream/recovery/mandatory items may show — never daytime
  // Progress quests. Filtered BEFORE capacity math so the 120-min LDM cap only ever considers
  // LDM-eligible items; nothing is deleted, items that don't fit are simply deferred (hiddenCount).
  const availableItemsRaw = allHomeItems.filter((item) => item.id !== activeItem?.id);
  const availableItems = ldmActive
    ? availableItemsRaw.filter((item) => item.mandatory || item.kind === "recovery" || item.source === "Sleep")
    : availableItemsRaw;
  const boardCapacity = applyQuestBoardCapacity(availableItems, boardMode, ldmActive ? LDM_BOARD_CAPACITY_MINUTES : undefined);
  const visibleItems = boardCapacity.visibleItems;
  const extraItemCount = boardCapacity.hiddenCount;
  const capacityLabel = ldmActive ? "LDM" : formatCapacityHeader(boardCapacity.plannedMinutes, boardMode);

  const remainingMs = activeItem ? Math.max(0, activeItem.endsAt - countdownNow) : 0;
  const timerFinished = activeItem !== null && remainingMs <= 0;
  const isBoardLocked = activeItem !== null;
  // Completed-today is distinct from "not active" — without excluding it, SET TODAY'S QUEST
  // would reappear immediately after finishing today's quest instead of waiting for tomorrow.
  const todayQuestUnset =
    !isTodayQuestActiveForToday(dayPlanRaw?.todayQuest ?? null, todayKey) &&
    !isTodayQuestCompletedToday(dayPlanRaw?.todayQuest ?? null, todayKey);

  const nowMinutes = timeNow.getHours() * 60 + timeNow.getMinutes();
  const timeTrackPosition = getCurrentTimeTrackPosition(timeNow);

  async function toggleRoutineItemChecked(itemId: string) {
    const current = preSleepRoutineChecked.questDayKey === todayKey ? preSleepRoutineChecked.checkedIds : {};
    const nextState = { questDayKey: todayKey, checkedIds: { ...current, [itemId]: !current[itemId] } };
    setPreSleepRoutineChecked(nextState);
    await persistProgressKeys({ [SLEEP_ROUTINE_KEY]: JSON.stringify(nextState) });
  }

  const nextItem = activeItem ? findNextScheduledItem(availableItems, activeItem.id, nowMinutes) : null;

  // Luna's Forced Recovery is derived purely from COMPLETED Progress work today (never from
  // scheduled/planned items) — 120 minutes of contiguous completed Progress triggers it.
  const forcedRecoveryTrigger = getForcedRecoveryTrigger(focusLog, todayKey);
  const forcedRecoveryResolved = forcedRecoveryTrigger
    ? completedQuests.some((entry) => entry.id === forcedRecoveryTrigger.id)
    : false;
  const isRecoveryLocked = forcedRecoveryTrigger !== null && !forcedRecoveryResolved;
  const recoveryRemainingMs = forcedRecoveryTrigger ? Math.max(0, forcedRecoveryTrigger.endsAtMs - recoveryNow) : 0;

  // Ticks recoveryNow every second while locked, and once the 1-hour window elapses,
  // completes Forced Recovery exactly once (awards +10 energy via markItemComplete/getEnergyDelta).
  useEffect(() => {
    if (!isRecoveryLocked || !forcedRecoveryTrigger) return;
    setRecoveryNow(Date.now());
    const id = setInterval(() => setRecoveryNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRecoveryLocked, forcedRecoveryTrigger?.id]);

  useEffect(() => {
    if (!forcedRecoveryTrigger || forcedRecoveryResolved) return;
    if (recoveryNow < forcedRecoveryTrigger.endsAtMs) return;
    let cancelled = false;
    (async () => {
      const forcedRecoveryItem = buildForcedRecoveryItem(forcedRecoveryTrigger);
      const nextCompleted = await markItemComplete(forcedRecoveryItem, completedQuests);
      if (cancelled) return;
      const wasNewCompletion = nextCompleted.length > completedQuests.length;
      setCompletedQuests(nextCompleted);
      setFocusLog(await loadFocusBlockLog());
      if (wasNewCompletion) {
        emitQuestCompletionFeedback({
          completionId: forcedRecoveryItem.id,
          questId: forcedRecoveryItem.id,
          stepsAwarded: forcedRecoveryItem.steps,
          guide: "luna",
          energyEffect: "restore",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forcedRecoveryTrigger?.id, forcedRecoveryResolved, recoveryNow, completedQuests]);

  // 24-hour rollover: once a scheduled Quick Thought/Quest's window closes unresolved,
  // record it as missed (kept in history, never deleted) so it stops cluttering the active
  // board — mirrors the exclusion filter inside normalizeQuestItems (isScheduledItemExpired).
  useEffect(() => {
    const expired = collectExpiredUnresolvedQuickThoughts({ quickThoughts: queueItems, completedIds, missedIds });
    if (expired.length === 0) return;
    let cancelled = false;
    (async () => {
      let nextMissed = missedQuests;
      for (const candidate of expired) {
        nextMissed = await markItemMissed(
          { id: candidate.id, title: candidate.title, source: "Quick Thought", kind: "progress", steps: 0, durationMinutes: 30 },
          nextMissed,
          activeItem?.id ?? null
        );
      }
      if (!cancelled) setMissedQuests(nextMissed);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueItems, todayKey]);

  const currentBackground = ldmActive || isRecovery
    ? uiAssets.backgrounds.recovery
    : isProgress
    ? uiAssets.backgrounds.progress
    : uiAssets.backgrounds.neutral;

  const completedHomeItems = [
    ...completedQuests.map((entry) => ({
      id: entry.id,
      title: entry.title,
      source: entry.source,
      kind: "progress" as QuestKind,
      steps: entry.steps,
      durationMinutes: 30,
    })),
  ];
  const todayScopedEarnedSteps = computeTodayScopedEarnedSteps({
    dayPlan: dayPlanRaw,
    quickThoughts: queueItems,
    todayCompletions: completedQuests,
  });
  // Already all-time cumulative on their own (never reset day-to-day), so they're added on
  // top of the per-day ledger rather than banked into it — banking them too would double
  // count them on every future day. See reconcileMonotonicTotalSteps.
  const alwaysCumulativeSteps = affirmationsCount + (userStats.totalSteps ?? 0);
  const completedCount = completedQuests.length;
  const totalCount = allHomeItems.length + completedCount;
  // stepsFloor is the sum of the per-day earned-steps ledger (see reconcileMonotonicTotalSteps)
  // — it actually accumulates across days, unlike a same-day-only recompute maxed against a
  // single historical peak (the old behavior, which is why totals appeared to stop growing).
  const displayedTotalSteps = stepsFloor + alwaysCumulativeSteps;
  // Same bonus-inclusive total the Stats page ranks with, so Home and Stats agree.
  const totalStepsForRank = displayedTotalSteps + computeFreshRankBonuses(displayedTotalSteps).rankBonusPool;
  const rankDisplay = stepRank ? `#${stepRank.rank}` : "Unranked";

  useEffect(() => {
    void reconcileMonotonicTotalSteps(todayScopedEarnedSteps).then(setStepsFloor);
  }, [todayScopedEarnedSteps]);

  useEffect(() => {
    if (!profileChecked) return;
    void syncAndGetStepRank(totalStepsForRank).then(setStepRank);
  }, [profileChecked, totalStepsForRank]);

  if (!profileChecked) return null;

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image
            source={currentBackground}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>
        <View style={styles.worldOverlay}>
            <ScrollView
              style={styles.screenScroller}
              contentContainerStyle={[styles.hudContent, { paddingBottom: mobile.scrollPaddingBottom }]}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.topHud}>
                <Image source={mylitLogo} style={styles.heroLogo} resizeMode="contain" />
              </View>

              <View style={[styles.timePanel, { borderColor: theme.accent }]}>
                <View style={styles.panelHeaderRow}>
                  <Text style={styles.panelHeaderText}>DAY / TIME TRACK</Text>
                  <View style={[styles.statusPill, { borderColor: theme.accent }]}>
                    <Text style={[styles.statusPillText, { color: theme.accent }]}>{theme.status}</Text>
                  </View>
                </View>
                <View style={styles.timelineIconsRow}>
                  <Text style={styles.timelineIcon}>🌅</Text>
                  <Text style={styles.timelineIcon}>☀️</Text>
                  <Text style={styles.timelineIcon}>{isRecovery ? "☾" : "🌇"}</Text>
                  <Text style={styles.timelineIcon}>🌙</Text>
                </View>
                <View style={styles.timelineTrack}>
                  <View style={[styles.timelineFill, { backgroundColor: theme.accent, width: `${timeTrackPosition}%` }]} />
                  <View
                    style={[
                      styles.timelineMarker,
                      { borderColor: theme.accent, backgroundColor: theme.glow, left: `${timeTrackPosition}%` },
                    ]}
                  />
                </View>
                <View style={styles.timelineLabelsRow}>
                  <Text style={styles.timelineLabel}>6 AM</Text>
                  <Text style={styles.timelineLabel}>12 PM</Text>
                  <Text style={styles.timelineLabel}>6 PM</Text>
                  <Text style={styles.timelineLabel}>12 AM</Text>
                </View>
              </View>

              <Text style={[styles.modeLabel, { color: ldmActive ? "#C4B5FD" : theme.accent }]}>
                {ldmActive ? "Lucid Dreaming Mode" : isNeutral ? "NEUTRAL MODE" : isRecovery ? "RECOVERY MODE" : "PROGRESS MODE"}
              </Text>

              {ldmActive ? (
                <LdmErrorBoundary>
                  <View style={styles.capBannerRow}>
                    <Text style={[styles.capBannerText, { color: "#E9D5FF" }]} numberOfLines={2}>
                      Lucid Dreaming Mode — up to 2 hours of pre-sleep tasks tonight.
                    </Text>
                  </View>
                </LdmErrorBoundary>
              ) : !isNeutral ? (
                <View style={styles.capBannerRow}>
                  <Text style={[styles.capBannerText, { color: theme.soft }]} numberOfLines={1}>
                    {isBoardLocked ? "Board locked" : isRecoveryLocked ? "Recovery required" : capacityLabel}
                  </Text>
                </View>
              ) : null}

              {!isNeutral || ldmActive ? (
                <View style={styles.guideScene}>
                  <View style={styles.guideEmblemWrap}>
                    <Image source={guideImage} style={[styles.guideEmblem, { borderColor: theme.accent }]} resizeMode="contain" />
                    {guideReaction ? (
                      <View pointerEvents="none" style={styles.guideReactionOverlay}>
                        <Text style={styles.guideReactionStar}>✦</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.guideTextColumn}>
                    <View style={[styles.speechBubble, { borderColor: guideMessageIsAffirmation ? "#F472B6" : theme.accent }]}>
                      <Text style={styles.speechText}>{guideMessage}</Text>
                      <Text style={[styles.speechName, { color: guideMessageIsAffirmation ? "#F472B6" : theme.accent }]}>
                        {guideMessageIsAffirmation ? "Luna · from your affirmations 💗" : `${guideName} ${ldmActive || isRecovery ? "💜" : "💚"}`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.talkToGuideBtn, { backgroundColor: theme.accent }]}
                      onPress={() => (ldmActive || isRecovery ? setShowHomeLunaModal(true) : setShowHomeEvieModal(true))}
                    >
                      <Text style={styles.talkToGuideBtnText}>
                        {ldmActive || isRecovery ? "Talk to Luna" : "Talk to Evie"}
                      </Text>
                    </TouchableOpacity>
                    {isRecovery ? (
                      <>
                        <TouchableOpacity
                          style={styles.addNapBtn}
                          onPress={() => router.push({ pathname: "/tomorrow-queue", params: { focus: "nap" } })}
                        >
                          <Text style={styles.addNapBtnText}>😴 Add a Nap</Text>
                        </TouchableOpacity>
                        <Text style={styles.addNapNote}>Add a recovery nap to restore energy when completed.</Text>
                      </>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={styles.neutralStatusPanel}>
                  <Text style={[styles.neutralStatusText, { color: theme.glow }]}>{neutralGuideMessage}</Text>
                </View>
              )}

              <View style={styles.flameSection}>
                {(hasEnergyData || ldmActive) && flameState.image ? (
                  <AnimatedFlame
                    source={flameState.animated}
                    fallbackSource={flameState.image}
                    frameCount={FLAME_SHEET_FRAME_COUNT}
                    columns={FLAME_SHEET_COLUMNS}
                    rows={FLAME_SHEET_ROWS}
                    sheetWidth={
                      flameState.animated === fireAnimations.brightSheet
                        ? FLAME_BRIGHT_SHEET_WIDTH
                        : flameState.animated === fireAnimations.blazingSheet
                          ? FLAME_BLAZING_SHEET_WIDTH
                          : flameState.animated === fireAnimations.lowSheet
                            ? FLAME_LOW_SHEET_WIDTH
                            : flameState.animated === fireAnimations.emberSheet
                              ? FLAME_EMBER_SHEET_WIDTH
                              : FLAME_STEADY_SHEET_WIDTH
                    }
                    sheetHeight={FLAME_SHEET_HEIGHT}
                    fps={11}
                    size={flameState.size + 96}
                    glowStyle={{
                      shadowColor: theme.glow,
                      shadowOpacity: 0.5,
                      shadowRadius: 14,
                      shadowOffset: { width: 0, height: 0 },
                    }}
                  />
                ) : (
                  // Neutral (no check-in yet): calm steady-flame animation as a default visual —
                  // no energy score/label attached, see the isNeutral guard below.
                  <AnimatedFlame
                    source={fireAnimations.steadySheet}
                    fallbackSource={fireAssets.steadyFlame}
                    frameCount={FLAME_SHEET_FRAME_COUNT}
                    columns={FLAME_SHEET_COLUMNS}
                    rows={FLAME_SHEET_ROWS}
                    sheetWidth={FLAME_STEADY_SHEET_WIDTH}
                    sheetHeight={FLAME_SHEET_HEIGHT}
                    fps={11}
                    size={50 + 96}
                    glowStyle={{
                      shadowColor: theme.glow,
                      shadowOpacity: 0.5,
                      shadowRadius: 14,
                      shadowOffset: { width: 0, height: 0 },
                    }}
                  />
                )}
                {flameReaction ? (
                  // Overlay only — never resizes/moves the flame stage itself, and returns to
                  // idle (unmounts) after the reaction timeout in the effect above.
                  <View pointerEvents="none" style={styles.flameReactionOverlay}>
                    {flameReaction === "restore" ? (
                      <Text style={styles.flameReactionRestore}>✦</Text>
                    ) : flameReaction === "consume" ? (
                      <View style={styles.flameReactionDim} />
                    ) : (
                      <Text style={styles.flameReactionNeutral}>✦</Text>
                    )}
                  </View>
                ) : null}
                {ldmActive ? (
                  // The numeric score reflects the real underlying (untouched) energy value —
                  // showing it next to the forced Low Flame label would look contradictory, so
                  // LDM shows only the flame label plus a short night-appropriate caption.
                  <>
                    <Text style={[styles.flameMeterText, { color: theme.soft }]}>{flameLabel}</Text>
                    <Text style={[styles.flameProtectText, { color: theme.accent }]} numberOfLines={2}>
                      Rest now — your flame stays protected overnight.
                    </Text>
                  </>
                ) : !isNeutral ? (
                  <>
                    <View style={styles.energyScoreLine}>
                      <Text style={[styles.energyScore, { color: theme.glow }]}>{energyYield}</Text>
                      <Text style={styles.energyOutOf}> / 100</Text>
                    </View>
                    <Text style={[styles.flameMeterText, { color: theme.soft }]}>{flameLabel}</Text>
                    <Text style={[styles.flameProtectText, { color: theme.accent }]} numberOfLines={2}>
                      {isProgress
                        ? "Protect your flame — don't let it drop below 60."
                        : "Protect your flame — don't let it drop below 30."}
                    </Text>
                  </>
                ) : null}
              </View>

              {/* Fixed layout beneath the flame — never affects the flame's own size/position.
                  A supportive estimate only: no calorie targets, weight language, or claims of
                  knowing real biological hunger — see lib/fuel.ts. */}
              <View style={styles.fuelRow}>
                <View style={[styles.fuelBar, { borderColor: fuelBarColor }]}>
                  <Text style={[styles.fuelBarLabel, { color: fuelBarColor }]}>FUEL</Text>
                  <View style={styles.fuelBarTrack}>
                    <View style={[styles.fuelBarFill, { width: `${fuelResult.fuel}%`, backgroundColor: fuelBarColor }]} />
                  </View>
                  <Text style={[styles.fuelBarStatus, { color: fuelBarColor }]}>
                    {fuelResult.status} · {fuelResult.fuel}%
                  </Text>
                </View>
                <TouchableOpacity style={styles.foodLogBtn} onPress={() => { lightHaptic(); setShowFoodLogModal(true); }}>
                  <Text style={styles.foodLogBtnText}>🍽️ Food Log</Text>
                </TouchableOpacity>
              </View>

              <FoodLogModal
                visible={showFoodLogModal}
                onClose={() => setShowFoodLogModal(false)}
                onSaved={(log) => void handleFoodLogSaved(log)}
              />

              <LunaGuideModal visible={showHomeLunaModal} onClose={() => setShowHomeLunaModal(false)} />
              <EvieGuideModal visible={showHomeEvieModal} onClose={() => setShowHomeEvieModal(false)} />

              {!ldmActive ? (
                <View style={styles.checkInRow}>
                  <TouchableOpacity style={[styles.checkInCard, { borderColor: theme.accent }]} onPress={() => navigateWithHaptic("/sleep-checkin")}>
                    <View style={styles.checkIconBox}><Text style={styles.checkIcon}>🌄</Text></View>
                    <View style={styles.checkTextBox}>
                      <Text style={[styles.checkTitle, { color: theme.glow }]}>MORNING{"\n"}CHECK-IN</Text>
                      <Text style={styles.checkSubtitle} numberOfLines={2}>{isRecovery ? "Start your day with kindness." : "Start strong. Set your focus."}</Text>
                    </View>
                    <Text style={[styles.checkArrow, { color: theme.accent }]}>›</Text>
                  </TouchableOpacity>

                  {afternoonCheckInUnlocked ? (
                    <TouchableOpacity
                      style={[styles.checkInCard, { borderColor: theme.accent }]}
                      onPress={() =>
                        router.push({
                          pathname: "/sleep-checkin",
                          params: { checkInType: "afternoon" },
                        })
                      }
                    >
                      <View style={styles.checkIconBox}><Text style={styles.checkIcon}>{isRecovery ? "🌙" : "🌇"}</Text></View>
                      <View style={styles.checkTextBox}>
                        <Text style={[styles.checkTitle, { color: theme.glow }]}>AFTERNOON{"\n"}CHECK-IN</Text>
                        <Text style={styles.checkSubtitle} numberOfLines={2}>{isRecovery ? "Pause, breathe, reset." : "Recalibrate. Keep going."}</Text>
                      </View>
                      <Text style={[styles.checkArrow, { color: theme.accent }]}>›</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.checkInCard, styles.checkInCardLocked]}>
                      <View style={styles.checkIconBox}><Text style={styles.checkIcon}>🔒</Text></View>
                      <View style={styles.checkTextBox}>
                        <Text style={[styles.checkTitle, { color: "#94A3B8" }]}>AFTERNOON{"\n"}CHECK-IN</Text>
                        <Text style={styles.checkSubtitle} numberOfLines={2}>Opens {afternoonUnlockDisplayLabel}</Text>
                      </View>
                    </View>
                  )}
                </View>
              ) : null}

              {!ldmActive ? (
                <>
                  <TouchableOpacity style={styles.createQuestBtn} onPress={() => setShowQuestChooserModal(true)}>
                    <Text style={styles.createQuestBtnText}>+ CREATE A QUEST</Text>
                  </TouchableOpacity>
                  <Text style={styles.createQuestNote}>Create a quest for today or a day you choose.</Text>
                </>
              ) : null}

              <Modal visible={showQuestChooserModal} transparent animationType="fade" onRequestClose={() => setShowQuestChooserModal(false)}>
                <View style={styles.chooserBackdrop}>
                  <View style={styles.chooserPanel}>
                    <Text style={styles.chooserTitle}>CREATE A QUEST</Text>
                    <TouchableOpacity
                      style={[styles.chooserRow, styles.chooserRowGold]}
                      onPress={() => { setShowQuestChooserModal(false); router.push({ pathname: "/day-plan", params: { openTodayQuest: "1" } }); }}
                    >
                      <Text style={styles.chooserRowIcon}>⭐</Text>
                      <View style={styles.chooserRowCopy}>
                        <Text style={styles.chooserRowName}>Today Quest</Text>
                        <Text style={styles.chooserRowExplain}>Your one main quest for today</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chooserRow, styles.chooserRowGreen]}
                      onPress={() => { setShowQuestChooserModal(false); router.push("/tomorrow-queue"); }}
                    >
                      <Text style={styles.chooserRowIcon}>🍃</Text>
                      <View style={styles.chooserRowCopy}>
                        <Text style={styles.chooserRowName}>Path Quest</Text>
                        <Text style={styles.chooserRowExplain}>A step toward your long-term path</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chooserRow, styles.chooserRowPurple]}
                      onPress={() => { setShowQuestChooserModal(false); router.push({ pathname: "/tomorrow-queue", params: { focus: "nap" } }); }}
                    >
                      <Text style={styles.chooserRowIcon}>🕯</Text>
                      <View style={styles.chooserRowCopy}>
                        <Text style={styles.chooserRowName}>Recovery / Nap</Text>
                        <Text style={styles.chooserRowExplain}>Restore energy, guided by Luna</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chooserRow, styles.chooserRowPink]}
                      onPress={() => { setShowQuestChooserModal(false); router.push({ pathname: "/day-plan", params: { openHobby: "1" } }); }}
                    >
                      <Text style={styles.chooserRowIcon}>🌸</Text>
                      <View style={styles.chooserRowCopy}>
                        <Text style={styles.chooserRowName}>Hobby</Text>
                        <Text style={styles.chooserRowExplain}>Something you enjoy, no pressure</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chooserCloseBtn} onPress={() => setShowQuestChooserModal(false)}>
                      <Text style={styles.chooserCloseBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

              {ldmActive ? (
                <LdmErrorBoundary>
                  <TouchableOpacity style={styles.dreamJournalBtn} onPress={() => navigateWithHaptic("/dream-journal")}>
                    <Text style={styles.dreamJournalBtnText}>🌙 DREAM JOURNAL</Text>
                  </TouchableOpacity>
                </LdmErrorBoundary>
              ) : null}

              {ldmActive && preSleepRoutineQuestDone ? (
                <LdmErrorBoundary>
                  <View style={styles.ldmDoneCard}>
                    <Text style={styles.ldmDoneText}>Luna: Your routine is done. Try to let the night carry you now — you can write dreams if you wake up.</Text>
                  </View>
                </LdmErrorBoundary>
              ) : null}

              {isNeutral && !ldmActive ? (
                // LDM's quest board must never fall behind the "do a morning check-in" lock —
                // LDM is time-derived and reachable regardless of the day's check-in-derived
                // mode, which otherwise hid the whole LDM board behind this prompt overnight.
                <View style={styles.lockedBoardStrip}>
                  <Text style={styles.lockedBoardStripText}>Complete morning check-in to unlock</Text>
                  <TouchableOpacity style={styles.lockedBoardStripBtn} onPress={() => navigateWithHaptic("/sleep-checkin")}>
                    <Text style={styles.lockedBoardStripBtnText}>START CHECK-IN</Text>
                  </TouchableOpacity>
                </View>
              ) : (
              <View style={[styles.questBoard, { borderColor: isBoardLocked && activeItem ? kindAccent(activeItem.kind) : isRecoveryLocked ? "#C4A7FF" : theme.accent }]}>
                <View style={styles.questHeaderRow}>
                  <View style={styles.questTitleRow}>
                    <Text style={[styles.questTitle, { color: theme.accent }]}>{ldmActive ? "☾ NIGHT BOARD ☾" : isRecovery ? "+ RECOVERY BOARD +" : "⚔ TODAY'S QUESTS"}</Text>
                    {!isNeutral ? (
                      <TouchableOpacity style={[styles.questHelpBtn, { borderColor: theme.accent }]} onPress={() => setShowQuestHelp(true)}>
                        <Text style={[styles.questHelpBtnText, { color: theme.accent }]}>?</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={[styles.questCount, { color: theme.accent }]}>
                    {isNeutral && !ldmActive ? "LOCKED" : isBoardLocked ? "LOCKED" : isRecoveryLocked ? "RECOVERY" : capacityLabel}
                  </Text>
                </View>

                {!isNeutral && !ldmActive && todayQuestUnset ? (
                  <TouchableOpacity style={styles.setMainQuestBtn} onPress={() => navigateWithHaptic("/day-plan")}>
                    <Text style={styles.setMainQuestBtnTitle}>SET TODAY’S QUEST</Text>
                    <Text style={styles.setMainQuestBtnHint}>Choose your main quest for today.</Text>
                  </TouchableOpacity>
                ) : null}

                {isNeutral && !ldmActive ? (
                  <View style={styles.questLockedCard}>
                    <Text style={styles.questLockedTitle}>Quest Board Locked</Text>
                    <Text style={styles.questLockedText} numberOfLines={2}>Check in to reveal today&apos;s quests.</Text>
                    <TouchableOpacity style={[styles.questLockedButton, { borderColor: theme.accent }]} onPress={() => navigateWithHaptic("/sleep-checkin")}>
                      <Text style={styles.questLockedButtonText}>START CHECK-IN</Text>
                    </TouchableOpacity>
                  </View>
                ) : isBoardLocked && activeItem ? (
                  <View style={[styles.activeCard, { borderColor: kindAccent(activeItem.kind) }]}>
                    <View style={styles.activeHeaderRow}>
                      <Text style={[styles.activeLockLabel, { color: timerFinished ? "#22C55E" : theme.glow }]}>
                        {timerFinished ? "QUEST COMPLETE" : "QUEST BOARD LOCKED"}
                      </Text>
                      <View style={[styles.kindPill, { borderColor: kindAccent(activeItem.kind) }]}>
                        <Text style={[styles.kindPillText, { color: kindAccent(activeItem.kind) }]}>
                          {activeItem.kind === "recovery" ? "RECOVERY" : "PROGRESS"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.activeTitle} numberOfLines={2}>{activeItem.title}</Text>
                    <Text style={[styles.countdownText, { color: timerFinished ? "#22C55E" : theme.glow }]}>
                      {formatCountdown(remainingMs)}
                    </Text>
                    <Text style={styles.activeMeta} numberOfLines={1}>
                      {questSourceLabel(activeItem.source)} · {formatDurationLabel(activeItem.durationMinutes)} · +{activeItem.steps} steps
                    </Text>
                    <Text style={[styles.activeMeta, { color: kindAccent(activeItem.kind) }]} numberOfLines={1}>
                      {energyLabelFor(activeItem)}
                    </Text>

                    <TouchableOpacity
                      style={[styles.waitingRoomBtn, { borderColor: theme.accent }]}
                      onPress={() => router.push("/waiting-room")}
                    >
                      <Text style={[styles.waitingRoomBtnText, { color: theme.accent }]}>🕯️ Wait in Study Room</Text>
                    </TouchableOpacity>

                    {!timerFinished ? (
                      <>
                        {nextItem ? (
                          <View style={styles.nextRow}>
                            <Text style={[styles.nextLabel, { color: theme.accent }]}>NEXT</Text>
                            <Text style={styles.nextTitle} numberOfLines={1}>{nextItem.title}</Text>
                            <Text style={styles.nextMeta} numberOfLines={1}>
                              {questSourceLabel(nextItem.source)}{nextItem.scheduledTime ? ` · ${nextItem.scheduledTime}` : ""} · {formatDurationLabel(nextItem.durationMinutes)}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.nextEmpty}>Next: No scheduled item yet.</Text>
                        )}
                        {lockMessage ? <Text style={styles.lockMessage}>{lockMessage}</Text> : null}
                      </>
                    ) : (
                      <View style={styles.completeRow}>
                        <TouchableOpacity style={[styles.completeBtn]} onPress={completeActiveItem}>
                          <Text style={styles.completeBtnText}>COMPLETE</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.reflectBtn, { borderColor: theme.accent }]} onPress={reflectActiveItem}>
                          <Text style={styles.reflectBtnText}>MISSED?</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : isRecoveryLocked ? (
                  <View style={[styles.activeCard, { borderColor: "#C4A7FF" }]}>
                    <View style={styles.recoveryHeaderRow}>
                      <Image source={uiAssets.guides.luna} style={styles.recoveryLunaAvatar} resizeMode="contain" />
                      <Text style={[styles.activeLockLabel, { color: "#C4A7FF" }]}>FORCED RECOVERY</Text>
                    </View>
                    <Text style={styles.recoveryLockText}>{FORCED_RECOVERY_MESSAGE}</Text>
                    <Text style={[styles.countdownText, { color: "#C4A7FF" }]}>{formatCountdown(recoveryRemainingMs)}</Text>
                    <Text style={styles.recoveryLockHint}>
                      1 hr • Energy: +{FORCED_RECOVERY_RESTORE_ENERGY} once it resolves. Stretch, drink some water, step outside, or just breathe.
                    </Text>
                    <TouchableOpacity
                      style={[styles.waitingRoomBtn, { borderColor: "#C4A7FF" }]}
                      onPress={() => router.push("/waiting-room")}
                    >
                      <Text style={[styles.waitingRoomBtnText, { color: "#C4A7FF" }]}>🕯️ Wait in Study Room</Text>
                    </TouchableOpacity>
                  </View>
                ) : isAfternoonCheckInGateActive ? (
                  <View style={[styles.activeCard, { borderColor: "#C4A7FF", backgroundColor: "#6D28D9" }]}>
                    <View style={styles.recoveryHeaderRow}>
                      <Image source={uiAssets.guides.luna} style={styles.recoveryLunaAvatar} resizeMode="contain" />
                      <Text style={[styles.activeLockLabel, { color: "#F5F3FF" }]}>AFTERNOON CHECK-IN NEEDED</Text>
                    </View>
                    <Text style={[styles.recoveryLockText, { color: "#F5F3FF" }]}>
                      Luna needs your Afternoon Check-In before more quests unlock — it&apos;s quick, and helps her look out for you.
                    </Text>
                    <TouchableOpacity
                      style={[styles.waitingRoomBtn, { borderColor: "#F5F3FF" }]}
                      onPress={() => { lightHaptic(); router.push({ pathname: "/sleep-checkin", params: { type: "afternoon" } }); }}
                    >
                      <Text style={[styles.waitingRoomBtnText, { color: "#F5F3FF" }]}>Complete Afternoon Check-In</Text>
                    </TouchableOpacity>
                  </View>
                ) : ldmActive && availableItems.length === 0 ? (
                  // Never invent routine tasks — if tonight's routine is already fully done
                  // (or never had anything to show), Luna's bubble replaces the empty board
                  // instead of the generic "No quests yet" message.
                  <TouchableOpacity
                    style={[styles.speechBubble, { borderColor: "#A78BFA" }]}
                    onPress={() => navigateWithHaptic("/sleep-calendar")}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.speechText}>Set up your pre-sleep routine</Text>
                  </TouchableOpacity>
                ) : availableItems.length === 0 ? (
                  <View style={styles.questLockedCard}>
                    <Text style={styles.questLockedTitle}>No quests yet</Text>
                    <Text style={styles.questLockedText} numberOfLines={2}>Add items in Day Plan or Quests to fill your board.</Text>
                  </View>
                ) : (
                  <>
                    {visibleItems.map((item) => {
                      const visual = getQuestVisual(item);
                      const setByNotice = item.mandatory
                        ? "Set by Luna"
                        : item.suggested || item.starter
                        ? "Set by Evie based on your Path"
                        : null;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.questRow,
                            // Mandatory Luna gate quests are always kind:"recovery", so this is
                            // already the same purple fill/chunky border as any Recovery card —
                            // no separate red-border treatment.
                            { backgroundColor: visual.fill, borderColor: visual.border },
                          ]}
                          onPress={() => openQuestItem(item)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.questIconSlot}>
                            <Text style={styles.questIcon}>{item.mandatory ? "!" : sourceIcon(item.source)}</Text>
                          </View>
                          <View style={styles.questCopy}>
                            <View style={styles.questTitleWithBadge}>
                              {visual.badge ? <View style={[styles.questModeBadge, { backgroundColor: visual.badge }]} /> : null}
                              <Text style={[styles.questText, { color: visual.text }]} numberOfLines={1}>{item.title}</Text>
                            </View>
                            <View style={styles.questMetaRow}>
                              <Text style={[styles.questMeta, { color: visual.meta }]} numberOfLines={1}>
                                {questSourceLabel(item.source)} · {formatDurationLabel(item.durationMinutes)} · {energyLabelFor(item)}{item.scheduledTime ? ` · ${item.scheduledTime}` : ""}
                              </Text>
                              <Text style={[styles.questSteps, { color: visual.text }]}>+{item.steps}</Text>
                            </View>
                            {setByNotice ? (
                              <Text style={[styles.questSetByNotice, { color: visual.meta }]} numberOfLines={1}>{setByNotice}</Text>
                            ) : null}
                          </View>
                          <Text style={[styles.startChevron, { color: visual.text }]}>▶</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {lockMessage ? <Text style={styles.lockMessage}>{lockMessage}</Text> : null}
                    {extraItemCount > 0 ? (
                      <Text style={styles.moreHint}>+{extraItemCount} more beyond today&apos;s capacity</Text>
                    ) : null}
                  </>
                )}
              </View>
              )}

              <View style={[styles.statsBar, { borderColor: theme.accent }]}>
                <View style={styles.statCell}>
                  <Text style={styles.statIcon}>🏆</Text>
                  <View>
                    <Text style={[styles.statLabel, { color: theme.accent }]}>RANK</Text>
                    <Text style={styles.statValue}>{rankDisplay}</Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statIcon}>🥾</Text>
                  <View>
                    <Text style={[styles.statLabel, { color: theme.accent }]} numberOfLines={1}>TOTAL STEPS</Text>
                    <Text style={styles.statValue}>{displayedTotalSteps}</Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statIcon}>🎒</Text>
                  <View>
                    <Text style={[styles.statLabel, { color: theme.accent }]}>INVENTORY</Text>
                    <Text style={styles.statValue}>{completedCount} / {totalCount || 0}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <Modal
              visible={showQuestHelp}
              transparent
              animationType="fade"
              onRequestClose={() => setShowQuestHelp(false)}
            >
              <View style={styles.modalBackdrop}>
                <View style={[styles.modalPanel, { borderColor: theme.accent }]}>
                  <Text style={[styles.modalSource, { color: theme.accent }]}>QUEST BOARD HELP</Text>
                  <Text style={styles.modalTitle}>How the Quest Board works</Text>
                  <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false} bounces={false}>
                    <Text style={styles.modalDescription}>
                      Quest Board shows what to focus on now. It can include MYLIT quests, Day Plan items, checklist items, and Quests you scheduled. Quests are timed — start one at a time and the board locks until it ends. Checklist items are just checked off. Steps are based on duration: 15 min earns +1, 30 min earns +2, 45 min earns +3, 1 hr earns +4. Quests stay active through the next 24 hours so you can complete or mark Missed? — after that they drop off the board but stay in your history. Recovery is only required after about 2 hours of progress work — Recovery tasks don't count toward that streak and reset it, so mixing in a Recovery task keeps the board unlocked.
                    </Text>
                  </ScrollView>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowQuestHelp(false)}>
                    <Text style={styles.modalCancelText}>CLOSE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            <Modal
              visible={selectedItem !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setSelectedItem(null)}
            >
              <View style={styles.modalBackdrop}>
                {selectedItem ? (
                  <View style={[styles.modalPanel, { borderColor: kindAccent(selectedItem.kind) }]}>
                    <Text style={[styles.modalSource, { color: kindAccent(selectedItem.kind) }]}>
                      {questSourceLabel(selectedItem.source).toUpperCase()}
                    </Text>
                    <Text style={styles.modalTitle}>{selectedItem.title}</Text>

                    {selectedItem.mandatory ? (
                      <View style={styles.modalGuideRow}>
                        <Image source={uiAssets.guides.luna} style={styles.modalGuideAvatar} resizeMode="contain" />
                        <Text style={styles.modalGuideText}>
                          {selectedItem.title === MANDATORY_FOOD_QUEST_TITLE
                            ? "It's okay to take a break. Eat so you have enough energy to continue."
                            : selectedItem.title === MANDATORY_ENERGY_QUEST_TITLE
                            ? "It's okay to take a break. Rest so you have enough energy to continue."
                            : selectedItem.title === PRE_SLEEP_ROUTINE_TITLE
                            ? "Let's wind down together. Check off each step, then complete the routine."
                            : "Luna set this quest to help protect your flame."}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.modalMetaGrid}>
                      <Text style={styles.modalMeta}>Type: {selectedItem.kind === "recovery" ? "Recovery" : "Progress"}</Text>
                      <Text style={styles.modalMeta}>Source: {questSourceLabel(selectedItem.source)}</Text>
                      <Text style={styles.modalMeta}>Duration: {formatDurationLabel(selectedItem.durationMinutes)}</Text>
                      <Text style={styles.modalMeta}>Steps possible: +{selectedItem.steps}</Text>
                      <Text style={[styles.modalMeta, { color: kindAccent(selectedItem.kind), fontWeight: "900" }]}>{energyLabelFor(selectedItem)}</Text>
                      {selectedItem.scheduledTime ? (
                        <Text style={styles.modalMeta}>Scheduled: {selectedItem.scheduledTime}</Text>
                      ) : (
                        <Text style={styles.modalMeta}>Scheduled: Anytime today</Text>
                      )}
                    </View>

                    {selectedItem.source === "Today's Quest" &&
                    selectedItem.kind === "progress" &&
                    selectedItem.durationMinutes >= TODAY_QUEST_TWO_HOUR_MINUTES ? (
                      <Text style={styles.recoveryTriggerNote}>Triggers 1 hr recovery after completion.</Text>
                    ) : null}

                    {selectedItem.description ? (
                      <Text style={styles.modalDescription}>{selectedItem.description}</Text>
                    ) : null}

                    {selectedItem.title === PRE_SLEEP_ROUTINE_TITLE ? (
                      <View style={styles.routineList}>
                        {PRE_SLEEP_ROUTINE_ITEMS.map((item) => {
                          const checked = Boolean(preSleepRoutineCheckedToday[item.id]);
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={styles.routineRow}
                              onPress={() => void toggleRoutineItemChecked(item.id)}
                              activeOpacity={0.8}
                            >
                              <View style={[styles.routineCheckbox, checked && styles.routineCheckboxChecked]}>
                                {checked ? <Text style={styles.routineCheckMark}>✓</Text> : null}
                              </View>
                              <Text style={[styles.routineRowText, checked && styles.routineRowTextChecked]}>{item.text}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}

                    <View style={styles.modalButtonRow}>
                      <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSelectedItem(null)}>
                        <Text style={styles.modalCancelText}>CLOSE</Text>
                      </TouchableOpacity>
                      {selectedItem.title === PRE_SLEEP_ROUTINE_TITLE ? (
                        <TouchableOpacity
                          style={[styles.modalStartBtn, !preSleepRoutineAllChecked && styles.modalStartBtnDisabled]}
                          disabled={!preSleepRoutineAllChecked}
                          onPress={() => void completeQuestItem(selectedItem)}
                        >
                          <Text style={styles.modalStartText}>COMPLETE ROUTINE</Text>
                        </TouchableOpacity>
                      ) : selectedItem.source === "Checklist" ? (
                        <TouchableOpacity style={styles.modalStartBtn} onPress={() => void completeChecklistItem(selectedItem)}>
                          <Text style={styles.modalStartText}>MARK COMPLETE</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={styles.modalStartBtn} onPress={() => startTimedItem(selectedItem)}>
                          <Text style={styles.modalStartText}>START</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.modalButtonRow}>
                      <TouchableOpacity
                        style={styles.modalMissedBtn}
                        onPress={() => void missQuestItem(selectedItem)}
                      >
                        <Text style={styles.modalMissedText}>MISSED?</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            </Modal>

            <BottomNav activeRoute="home" bottomOffset={mobile.bottomNavOffset} />
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#02040A",
  },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#050814",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "rgba(251, 191, 36, 0.55)",
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 0,
    shadowOffset: { width: 6, height: 6 },
  },
  phoneStageFullscreen: {
    borderWidth: 0,
    shadowOpacity: 0,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImage: {
    width: "100%",
    height: "100%",
  },
  worldOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 12, 0.02)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    flexGrow: 1,
    paddingTop: 9,
    paddingHorizontal: 14,
    paddingBottom: 82,
  },
  topHud: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogo: {
    height: 82,
    width: 250,
    marginTop: -2,
  },
  pageHeader: {
    alignItems: "center",
    marginBottom: 4,
  },
  pageKicker: {
    color: "#FBBF24",
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  pageTitle: {
    color: "#F8FAFC",
    fontFamily: "monospace",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 2,
  },
  pageSubtitle: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
  },
  capBannerRow: {
    alignItems: "center",
    marginBottom: 6,
  },
  capBannerText: {
    fontSize: 11,
    fontWeight: "800",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  modeRow: {
    marginTop: -10,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modeTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 0,
  },
  modeSubtitle: {
    flex: 1,
    color: "#F8F1D7",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "right",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  timePanel: {
    // Lighter/no-fill — Day Track integrates with the background instead of sitting in a
    // heavy black box, matching the flame section's treatment.
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelHeaderText: {
    color: "#F8F1D7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  statusPill: {
    borderWidth: 2,
    backgroundColor: "rgba(9, 14, 24, 0.95)",
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "900",
  },
  timelineIconsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: -1,
  },
  timelineIcon: {
    fontSize: 18,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 0,
  },
  timelineTrack: {
    height: 8,
    backgroundColor: "rgba(1, 5, 12, 0.96)",
    borderWidth: 2,
    borderColor: "#111827",
    position: "relative",
    overflow: "visible",
  },
  timelineFill: {
    position: "absolute",
    left: 0,
    top: 1,
    bottom: 1,
    width: "42%",
    opacity: 0.75,
  },
  timelineMarker: {
    position: "absolute",
    top: -9,
    height: 22,
    width: 22,
    marginLeft: -11,
    borderWidth: 3,
    transform: [{ rotate: "45deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
  },
  timelineLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  timelineLabel: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "900",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 0,
  },
  guideScene: {
    minHeight: 94,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    marginVertical: 3,
  },
  neutralStatusPanel: {
    alignSelf: "center",
    width: "76%",
    minHeight: 44,
    marginVertical: 6,
    borderWidth: 2,
    borderColor: "rgba(248, 200, 74, 0.85)",
    backgroundColor: "rgba(8, 12, 20, 0.82)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  neutralStatusText: {
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  guideEmblem: {
    height: 86,
    width: 86,
    borderWidth: 3,
    borderRadius: 43,
    backgroundColor: "rgba(8, 13, 24, 0.55)",
    marginRight: 10,
  },
  // Wrapper is the same size as the emblem plus its own margin, so the reaction overlay is
  // purely decorative — it never changes the emblem's own size/position.
  guideEmblemWrap: {
    width: 96,
    height: 86,
    position: "relative",
  },
  guideReactionOverlay: {
    position: "absolute",
    top: -6,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  guideReactionStar: {
    fontSize: 22,
    color: "#FDE68A",
    textShadowColor: "#000",
    textShadowRadius: 0,
    textShadowOffset: { width: 1, height: 1 },
  },
  speechBubble: {
    flex: 1,
    backgroundColor: "rgba(8, 12, 20, 0.94)",
    borderWidth: 3,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  speechText: {
    color: "#F8F1D7",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  speechName: {
    fontSize: 14,
    fontWeight: "900",
    marginTop: 5,
  },
  modeLabel: {
    textAlign: "center",
    fontFamily: "monospace",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: "uppercase",
    // Black outline/shadow so the label stays legible over any background color.
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  createQuestBtn: {
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#1E293B",
    marginBottom: 4,
  },
  createQuestBtnText: { color: "#F8FAFC", fontFamily: "monospace", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  createQuestNote: { color: "#94A3B8", fontSize: 10, fontWeight: "700", textAlign: "center", marginTop: 6, marginBottom: 10 },
  hubGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  hubGridBtn: {
    flexBasis: "48%",
    flexGrow: 1,
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "#1E293B",
  },
  hubGridBtnText: { color: "#E2E8F0", fontFamily: "monospace", fontSize: 11, fontWeight: "900", letterSpacing: 0.3, textAlign: "center" },
  chooserBackdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.88)", alignItems: "center", justifyContent: "center", padding: 18 },
  chooserPanel: { width: "100%", maxWidth: 380, backgroundColor: "rgba(8,13,24,0.98)", borderWidth: 3, borderColor: "#334155", borderRadius: 12, padding: 16 },
  chooserTitle: { color: "#F8FAFC", fontFamily: "monospace", fontSize: 16, fontWeight: "900", textAlign: "center", marginBottom: 12, letterSpacing: 1 },
  chooserRow: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "rgba(15,23,42,0.9)" },
  chooserRowGold: { borderColor: "#FBBF24" },
  chooserRowGreen: { borderColor: "#22C55E" },
  chooserRowPurple: { borderColor: "#A78BFA" },
  chooserRowPink: { borderColor: "#F472B6" },
  chooserRowIcon: { fontSize: 26, marginRight: 12 },
  chooserRowCopy: { flex: 1 },
  chooserRowName: { color: "#F8FAFC", fontFamily: "monospace", fontSize: 13, fontWeight: "900" },
  chooserRowExplain: { color: "#94A3B8", fontSize: 11, fontWeight: "700", marginTop: 2 },
  chooserCloseBtn: { marginTop: 4, alignItems: "center", paddingVertical: 10 },
  chooserCloseBtnText: { color: "#94A3B8", fontFamily: "monospace", fontSize: 11, fontWeight: "900" },
  // Solid purple filled action button — the same fill/border pairing already used for
  // Luna/Recovery-kind quest cards elsewhere on Home, per the shared purple filled-action
  // treatment (no dedicated ActionButton component exists yet to import instead).
  dreamJournalBtn: {
    borderWidth: 3,
    borderColor: "#4C1D95",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#7C3AED",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  dreamJournalBtnText: { color: "#FFFFFF", fontFamily: "monospace", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  ldmDoneCard: { borderWidth: 2, borderColor: "#A78BFA", borderRadius: 8, padding: 12, backgroundColor: "rgba(88,28,135,0.35)", marginBottom: 10 },
  ldmDoneText: { color: "#E9D5FF", fontSize: 12, lineHeight: 17, fontWeight: "700", textAlign: "center" },
  // No outer card — the flame sits directly on the background with just its own glow (see
  // shadowColor/shadowRadius on the Image itself) instead of a heavy black box.
  flameSection: {
    width: "64%",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  // Safe temporary reaction effects (no restore/consume/neutral flame spritesheets exist yet —
  // see assets/ui/animations/flame/). Purely decorative overlays: absolutely positioned, never
  // affects the flame's own size/position, and unmounts back to nothing (idle) on its own.
  flameReactionOverlay: {
    position: "absolute",
    top: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  flameReactionRestore: {
    fontSize: 30,
    color: "#FEF3C7",
    textShadowColor: "#FBBF24",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
  },
  flameReactionNeutral: {
    fontSize: 20,
    color: "#E2E8F0",
  },
  flameReactionDim: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(15, 15, 15, 0.28)",
  },
  talkToGuideBtn: {
    marginTop: 6,
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: "center",
    alignSelf: "stretch",
  },
  talkToGuideBtnText: {
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: "#0B0F16",
  },
  addNapBtn: {
    marginTop: 8,
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#7E22CE",
    borderWidth: 2,
    borderColor: "#C4B5FD",
  },
  addNapBtnText: {
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: "#F5F3FF",
  },
  addNapNote: {
    marginTop: 5,
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "700",
    color: "#E9D5FF",
    textAlign: "center",
  },
  guideTextColumn: { flex: 1 },
  energyCard: {
    width: "64%",
    minHeight: 202,
    alignSelf: "center",
    // Lighter/more transparent than the old near-opaque black box — the flame should read
    // as glowing against the background, with the border doing the framing, not a solid fill.
    backgroundColor: "rgba(6, 10, 18, 0.28)",
    borderWidth: 3,
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  energyHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  energyTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  energyPill: {
    borderWidth: 1,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  energyPillText: {
    fontSize: 8,
    fontWeight: "900",
  },
  energyFlame: {
    marginTop: 8,
    marginBottom: 2,
  },
  energyScoreLine: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  energyFlameFallback: {
    height: 112,
    width: 112,
    marginTop: 8,
    marginBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  energyFlameFallbackText: {
    fontSize: 76,
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  energyScore: {
    fontSize: 52,
    fontWeight: "900",
    lineHeight: 56,
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  energyOutOf: {
    color: "#F8F1D7",
    fontSize: 22,
    fontWeight: "900",
  },
  flameMeterText: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  energyFooterText: {
    color: "#F8F1D7",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
  },
  flameProtectText: {
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 6,
    letterSpacing: 0.3,
  },
  fuelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  fuelBar: {
    flex: 1,
    backgroundColor: "rgba(6, 10, 18, 0.95)",
    borderWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
  },
  fuelBarLabel: {
    fontFamily: "monospace",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  fuelBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(148, 163, 184, 0.25)",
    overflow: "hidden",
    marginTop: 4,
  },
  fuelBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  fuelBarStatus: {
    fontFamily: "monospace",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 4,
  },
  foodLogBtn: {
    backgroundColor: "rgba(6, 10, 18, 0.95)",
    borderWidth: 3,
    borderColor: "#334155",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
  },
  foodLogBtnText: {
    color: "#E2E8F0",
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "900",
  },
  checkInRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 7,
  },
  checkInCard: {
    flex: 1,
    minHeight: 76,
    backgroundColor: "rgba(6, 10, 18, 0.95)",
    borderWidth: 3,
    borderRadius: 4,
    padding: 7,
    flexDirection: "row",
    alignItems: "center",
  },
  checkInCardLocked: {
    borderColor: "#334155",
    opacity: 0.75,
  },
  checkIconBox: {
    height: 46,
    width: 46,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
  },
  checkIcon: {
    fontSize: 27,
  },
  checkTextBox: {
    flex: 1,
  },
  checkTitle: {
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
  },
  checkSubtitle: {
    color: "#F8F1D7",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    marginTop: 2,
  },
  checkArrow: {
    fontSize: 30,
    fontWeight: "900",
    marginLeft: 3,
  },
  questBoard: {
    minHeight: 142,
    // Lighter than the quest-row cards it contains — avoids a dark box nested inside a
    // dark box; the rows still read as distinct slips against this lighter backing.
    backgroundColor: "rgba(5, 9, 17, 0.4)",
    borderWidth: 3,
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
  },
  questHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  questTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  questHelpBtn: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.9)",
  },
  questHelpBtnText: {
    fontSize: 12,
    fontWeight: "900",
  },
  questTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },
  questCount: {
    fontSize: 13,
    fontWeight: "900",
  },
  lockedBoardStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EAD9B6",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    gap: 8,
  },
  lockedBoardStripText: { flex: 1, color: "#3F2E14", fontSize: 11, fontWeight: "800" },
  lockedBoardStripBtn: { backgroundColor: "#B3261E", borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10 },
  lockedBoardStripBtnText: { color: "#FDE68A", fontFamily: "monospace", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  questLockedCard: {
    flex: 1,
    minHeight: 86,
    borderWidth: 2,
    borderColor: "#334155",
    // Lighter than before — one less nested dark box inside the already-dark questBoard.
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  questLockedTitle: {
    color: "#F8F1D7",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  questLockedText: {
    color: "#CBD5E1",
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    marginVertical: 6,
  },
  questLockedButton: {
    borderWidth: 2,
    backgroundColor: "#111827",
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  questLockedButtonText: {
    color: "#F8F1D7",
    fontSize: 10,
    fontWeight: "900",
  },
  // A setup PROMPT, not a quest — white border + bright title make it visually distinct
  // from the gold/purple quest rows below it, so it reads as "do this first", not "a quest".
  setMainQuestBtn: {
    borderWidth: 2,
    borderColor: "#FFFFFF",
    borderStyle: "dashed",
    backgroundColor: "#111827",
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  setMainQuestBtnTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  setMainQuestBtnHint: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  questRow: {
    minHeight: 39,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderWidth: 2,
    borderColor: "#2E3542",
    paddingHorizontal: 6,
    marginBottom: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  questTitleWithBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  questModeBadge: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: "#00000055" },
  questIconSlot: {
    height: 28,
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  questIcon: {
    fontSize: 18,
  },
  questCopy: {
    flex: 1,
  },
  questText: {
    color: "#F8F1D7",
    fontSize: 12,
    fontWeight: "900",
  },
  questMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
  },
  questMeta: {
    flex: 1,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 1,
  },
  questSteps: {
    fontSize: 10,
    fontWeight: "900",
  },
  questSetByNotice: {
    fontSize: 9,
    fontWeight: "700",
    fontStyle: "italic",
    marginTop: 2,
  },
  kindDot: {
    height: 9,
    width: 9,
    borderRadius: 5,
    marginLeft: 6,
  },
  startChevron: {
    fontSize: 14,
    fontWeight: "900",
    marginLeft: 6,
  },
  moreHint: {
    color: "#CBD5E1",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 2,
  },
  lockMessage: {
    color: "#FCA5A5",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 4,
  },
  activeCard: {
    minHeight: 120,
    borderWidth: 2,
    borderRadius: 4,
    // Lighter than before — one less nested dark box inside the already-dark questBoard.
    backgroundColor: "rgba(10, 14, 26, 0.78)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  activeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeLockLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  recoveryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recoveryLunaAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  recoveryLockText: {
    color: "#F8F1D7",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 8,
  },
  recoveryLockHint: {
    color: "#C4A7FF",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 6,
  },
  kindPill: {
    borderWidth: 2,
    backgroundColor: "rgba(9, 14, 24, 0.95)",
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  kindPillText: {
    fontSize: 8,
    fontWeight: "900",
  },
  activeTitle: {
    color: "#F8F1D7",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
  },
  countdownText: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 2,
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  activeMeta: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 1,
  },
  waitingRoomBtn: {
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: "center",
    marginTop: 8,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
  },
  waitingRoomBtnText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  nextRow: {
    marginTop: 8,
    borderWidth: 2,
    borderColor: "#2E3542",
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  nextLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  nextTitle: {
    color: "#F8F1D7",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 1,
  },
  nextMeta: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 1,
  },
  nextEmpty: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 8,
  },
  completeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  completeBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#22C55E",
    backgroundColor: "#14532D",
    paddingVertical: 9,
    alignItems: "center",
  },
  completeBtnText: {
    color: "#DCFCE7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  reflectBtn: {
    flex: 1,
    borderWidth: 2,
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    paddingVertical: 9,
    alignItems: "center",
  },
  reflectBtnText: {
    color: "#F8F1D7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 4, 10, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  modalPanel: {
    width: "100%",
    maxWidth: 320,
    borderWidth: 3,
    borderRadius: 8,
    backgroundColor: "#EAD9B6",
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOpacity: 0.8,
    shadowRadius: 0,
    shadowOffset: { width: 5, height: 5 },
  },
  modalSource: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  modalTitle: {
    color: "#3D2C18",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 6,
    lineHeight: 22,
  },
  modalGuideRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#A78BFA",
    backgroundColor: "rgba(109, 40, 217, 0.28)",
  },
  modalGuideAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#C4A7FF",
    marginRight: 10,
  },
  modalGuideText: {
    flex: 1,
    color: "#F5F3FF",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  modalMetaGrid: {
    marginTop: 12,
    gap: 5,
  },
  modalMeta: {
    color: "#4A3620",
    fontSize: 12,
    fontWeight: "800",
  },
  modalDescription: {
    color: "#5C4425",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 10,
  },
  recoveryTriggerNote: {
    color: "#5B21B6",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 8,
  },
  modalScroll: {
    maxHeight: 220,
    marginTop: 4,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    paddingVertical: 11,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  modalStartBtn: {
    flex: 1,
    borderWidth: 3,
    borderColor: "#FBBF24",
    backgroundColor: "#3B2F0B",
    paddingVertical: 11,
    alignItems: "center",
  },
  modalStartBtnDisabled: {
    borderColor: "#475569",
    backgroundColor: "#1E293B",
  },
  modalStartText: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  routineList: {
    marginTop: 12,
    gap: 8,
  },
  routineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routineCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#A78BFA",
    alignItems: "center",
    justifyContent: "center",
  },
  routineCheckboxChecked: {
    backgroundColor: "#7C3AED",
  },
  routineCheckMark: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  routineRowText: {
    flex: 1,
    color: "#E9D5FF",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  routineRowTextChecked: {
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },
  modalCompleteBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#22C55E",
    backgroundColor: "#14532D",
    paddingVertical: 11,
    alignItems: "center",
  },
  modalCompleteText: {
    color: "#DCFCE7",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  modalMissedBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#A78BFA",
    backgroundColor: "rgba(88,28,135,0.45)",
    paddingVertical: 11,
    alignItems: "center",
  },
  modalMissedText: {
    color: "#E9D5FF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  reflectButton: {
    height: 25,
    width: 25,
    marginLeft: 5,
    borderWidth: 1,
    borderColor: "#64748B",
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  reflectButtonText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "900",
  },
  checkBox: {
    height: 24,
    width: 24,
    marginLeft: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1020",
  },
  checkBoxDone: {
    backgroundColor: "#166534",
  },
  checkBoxText: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
  },
  statsBar: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(5, 9, 17, 0.96)",
    borderWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  statCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  statDivider: {
    height: 40,
    width: 2,
    backgroundColor: "#4B5563",
  },
  statIcon: {
    fontSize: 26,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  statValue: {
    color: "#F8F1D7",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 1,
  },
  bottomNav: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    height: 62,
    backgroundColor: "rgba(4, 8, 16, 0.98)",
    borderWidth: 3,
    borderRadius: 5,
    padding: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#3A4558",
    borderRadius: 3,
    paddingVertical: 4,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonActive: {
    backgroundColor: "#162314",
  },
  navText: {
    color: "#E2E8F0",
    fontSize: 17,
    fontWeight: "900",
  },
  navTextActive: {
    color: "#FDE68A",
    fontSize: 17,
    fontWeight: "900",
  },
  navLabel: {
    color: "#CBD5E1",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
  },
  navLabelActive: {
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
  },
});