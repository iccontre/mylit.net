import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomNav } from "../../components/BottomNav";
import { uiAssets } from "../../constants/uiAssets";
import { useMobileFrame } from "../../constants/mobileLayout";
import {
  getActiveSuggestedQuest,
  generateRecoveryStarterQuest,
  type QuestProfileContext,
} from "../../lib/questGeneration";
import { ANALYTICS_EVENTS, trackEvent } from "../../lib/analytics";
import { setChecklistItemChecked, syncQuestCompleted, syncQuestMissed, syncQuestStarted } from "../../lib/progressSync";
import { clearProgressKey, persistProgressKeys } from "../../lib/progressStore";
import { syncAndGetStepRank, type StepRank } from "../../lib/stepRank";
import {
  ACTIVE_TIMED_ITEM_KEY,
  applyQuestBoardCapacity,
  buildForcedRecoveryItem,
  collectTodayCalendarItems,
  computeFreshRankBonuses,
  computeTotalEarnedSteps,
  findNextScheduledItem,
  FORCED_RECOVERY_MESSAGE,
  FORCED_RECOVERY_RESTORE_ENERGY,
  formatCapacityHeader,
  getChecklistItemsForDay,
  getForcedRecoveryTrigger,
  getTodayKey,
  getWeekdayName,
  isDefaultTodayQuestTitle,
  kindAccent,
  loadFocusBlockLog,
  loadTodayCompletions,
  loadTodayMissed,
  markItemComplete,
  markItemMissed,
  normalizeQuestItems,
  questSourceLabel,
  sourceIcon,
  TODAY_QUEST_TWO_HOUR_MINUTES,
  type CompletionEntry,
  type FocusBlockLogEntry,
  type HomeQuestItem,
  type MissedEntry,
  type QuestKind,
} from "../../lib/questProgress";
import { formatDurationLabel, formatEnergyDelta, getEnergyDelta } from "../../lib/scheduling";
import { LATEST_PRE_SLEEP_INTENTION_KEY } from "../../lib/storageKeys";

const mylitLogo = uiAssets.logo.mylit;
const fireAssets = uiAssets.fires;

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

// Luna's mandatory recovery quest, triggered when energy runs low (see getMandatoryQuest).
const MANDATORY_QUEST_TITLE = "Eat or rest to restore energy";
const MANDATORY_QUEST_RESTORE_ENERGY = 5;
// Below 60 energy: a short 15-min reset that only blocks starting new PROGRESS quests.
const MANDATORY_MILD_THRESHOLD = 60;
const MANDATORY_MILD_DURATION_MINUTES = 15;
// Below 30 energy: a stronger 30-min requirement that locks the whole Quest Board.
const MANDATORY_SEVERE_THRESHOLD = 30;
const MANDATORY_SEVERE_DURATION_MINUTES = 30;

function clampEnergy(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Maps the energy reserve to one of the five emotive fire PNG assets.
// Bands: 0–24 ember · 25–44 low · 45–64 steady · 65–84 bright · 85–100 blazing.
function getFireAssetForEnergy(score: number) {
  if (score >= 85) {
    return { image: fireAssets.blazingFlame, emoji: "🔥", label: "Blazing Flame", size: 74 };
  }

  if (score >= 65) {
    return { image: fireAssets.brightFlame, emoji: "🔥", label: "Bright Flame", size: 62 };
  }

  if (score >= 45) {
    return { image: fireAssets.steadyFlame, emoji: "🔥", label: "Steady Flame", size: 50 };
  }

  if (score >= 25) {
    return { image: fireAssets.lowFlame, emoji: "🔥", label: "Low Flame", size: 40 };
  }

  return { image: fireAssets.ember, emoji: "✨", label: "Ember", size: 30 };
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [stepRank, setStepRank] = useState<StepRank | null>(null);

  const [dayPlanRaw, setDayPlanRaw] = useState<DayPlanRaw | null>(null);
  const [preSleepDoneToday, setPreSleepDoneToday] = useState(false);
  const [activeItem, setActiveItem] = useState<ActiveTimedItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<HomeQuestItem | null>(null);
  const [lockMessage, setLockMessage] = useState("");
  const [showQuestHelp, setShowQuestHelp] = useState(false);
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
  }, []);

  // Keep the Day / Time Track marker on the real local time (refresh every 30s).
  useEffect(() => {
    const id = setInterval(() => setTimeNow(new Date()), 30000);
    return () => clearInterval(id);
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
    const [completions, missed, stats, focusLogEntries] = await Promise.all([
      loadTodayCompletions(),
      loadTodayMissed(),
      AsyncStorage.getItem(USER_STATS_KEY),
      loadFocusBlockLog(),
    ]);
    setCompletedQuests(completions);
    setMissedQuests(missed);
    setFocusLog(focusLogEntries);
    if (stats) {
      try {
        setUserStats(JSON.parse(stats));
      } catch {
        setUserStats({});
      }
    }
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

  async function completeChecklistItem(item: HomeQuestItem) {
    const ok = await setChecklistItemChecked(item.id, true);
    if (!ok) return;
    // Also record a completion entry so this checklist item's duration/kind feeds
    // into today's energy math (progress spends energy, recovery restores it).
    const nextCompleted = await markItemComplete(item, completedQuests);
    setCompletedQuests(nextCompleted);
    setFocusLog(await loadFocusBlockLog());
    await successHaptic();
    setSelectedItem(null);
    await loadDayPlan();
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

    const nextCompleted = await markItemComplete(item, completedQuests);
    await successHaptic();
    setCompletedQuests(nextCompleted);
    setFocusLog(await loadFocusBlockLog());
    setSelectedItem(null);
    await loadDayPlan();
    await loadQuickThoughts();
    if (activeItem?.id === item.id) {
      await clearActiveItem();
    }
    void trackEvent(ANALYTICS_EVENTS.quest_completed, { id: item.id, title: item.title, steps: item.steps });
    void syncQuestCompleted(item);
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

  const completedMandatoryEntries = completedQuests.filter((entry) => entry.title === MANDATORY_QUEST_TITLE);
  const completedNormalEntries = completedQuests.filter((entry) => entry.title !== MANDATORY_QUEST_TITLE);
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
  const mandatoryRecoveryBoost =
    completedMandatoryEntries.filter(completedAfterCheckIn).length * MANDATORY_QUEST_RESTORE_ENERGY;
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
        mandatory: opts.mandatory || opts.title === MANDATORY_QUEST_TITLE,
      })
    );

  // Mild (15-min, energy 30-59) only blocks new PROGRESS starts — Recovery items still open.
  // Severe (30-min, energy < 30) locks the whole board until the mandatory quest resolves.
  const activeMandatoryQuest = getMandatoryQuest();
  const mandatoryActive = activeMandatoryQuest !== null;
  const mandatoryLocksRecoveryToo = activeMandatoryQuest?.durationMinutes === MANDATORY_SEVERE_DURATION_MINUTES;

  const todayName = getWeekdayName();

  const flameState = useMemo(() => getFireAssetForEnergy(energyYield), [energyYield]);
  const flameLabel = hasEnergyData ? flameState.label : "Check-in needed";

  const modeInstruction = isNeutral
    ? "A new day awaits. Small steps today, bright tomorrows."
    : isRecovery
    ? "Gentle steps today. You're doing enough."
    : "Keep building momentum. Your best day is ahead.";

  const guideName = isRecovery ? "Luna" : "Evie";
  const guideImage = isRecovery ? uiAssets.guides.luna : uiAssets.guides.evie;
  const guideMessage = isRecovery
    ? "It's okay to take it slow, stargazer. Rest is part of becoming your brightest self."
    : "You're on fire! Keep building momentum. Your best day is ahead.";

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
        status: "STEADY",
        mode: "BALANCED MODE",
      };

  function generateQuests(): Quest[] {
    const mandatoryQuest = getMandatoryQuest();

    if (isNeutral) {
      return [{ title: "Complete Morning Check-In", type: "Start", steps: 1 }];
    }

    const completedTitles = new Set(completedQuests.map((entry) => entry.title));
    const missedTitles = new Set(missedQuests.map((entry) => entry.title));
    const suggestedQuest = getActiveSuggestedQuest(
      questContext,
      isProgress ? "progress" : "recovery",
      completedTitles,
      missedTitles
    );

    // After an hour of progress work today, offer a path-aligned recovery starter quest.
    const recoveryStarter = progressMinutesToday >= 60 ? generateRecoveryStarterQuest(questContext) : null;
    const recoveryStarterActive =
      recoveryStarter && !completedTitles.has(recoveryStarter.title) && !missedTitles.has(recoveryStarter.title)
        ? recoveryStarter
        : null;

    return [
      ...(mandatoryQuest ? [mandatoryQuest] : []),
      ...(suggestedQuest ? [suggestedQuest] : []),
      ...(recoveryStarterActive ? [recoveryStarterActive] : []),
    ];
  }

  /**
   * Below 60 energy: mild 15-min mandatory reset (blocks new Progress starts only).
   * Below 30 energy: severe 30-min mandatory reset (blocks the whole Quest Board).
   * Only ever one mandatory quest at a time — the severe tier replaces the mild one,
   * it never stacks a second mandatory quest alongside it.
   */
  function getMandatoryQuest(): Quest | null {
    if (!hasEnergyData) return null;
    if (energyYield >= MANDATORY_MILD_THRESHOLD) return null;

    const alreadyDone = completedQuests.some((entry) => entry.title === MANDATORY_QUEST_TITLE);
    if (alreadyDone) return null;

    const isSevere = energyYield < MANDATORY_SEVERE_THRESHOLD;
    return {
      title: MANDATORY_QUEST_TITLE,
      type: "Mandatory",
      steps: 1,
      durationMinutes: isSevere ? MANDATORY_SEVERE_DURATION_MINUTES : MANDATORY_MILD_DURATION_MINUTES,
      restoreEnergy: MANDATORY_QUEST_RESTORE_ENERGY,
      mandatory: true,
      description: isSevere
        ? "Your flame is very low. Take 30 minutes to eat or rest before continuing."
        : "Your flame dipped below 60. Take 15 minutes to eat or rest before more progress.",
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
    hasEnergyData && !isNeutral
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
        })
      : [];

  const availableItems = allHomeItems.filter((item) => item.id !== activeItem?.id);
  const boardCapacity = applyQuestBoardCapacity(availableItems, boardMode);
  const visibleItems = boardCapacity.visibleItems;
  const extraItemCount = boardCapacity.hiddenCount;
  const capacityLabel = formatCapacityHeader(boardCapacity.plannedMinutes, boardMode);

  const remainingMs = activeItem ? Math.max(0, activeItem.endsAt - countdownNow) : 0;
  const timerFinished = activeItem !== null && remainingMs <= 0;
  const isBoardLocked = activeItem !== null;
  const todayQuestUnset = isDefaultTodayQuestTitle(dayPlanRaw?.todayQuest?.title);

  const nowMinutes = timeNow.getHours() * 60 + timeNow.getMinutes();
  const timeTrackPosition = getCurrentTimeTrackPosition(timeNow);
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
      const nextCompleted = await markItemComplete(buildForcedRecoveryItem(forcedRecoveryTrigger), completedQuests);
      if (cancelled) return;
      setCompletedQuests(nextCompleted);
      setFocusLog(await loadFocusBlockLog());
    })();
    return () => {
      cancelled = true;
    };
  }, [forcedRecoveryTrigger?.id, forcedRecoveryResolved, recoveryNow, completedQuests]);

  const currentBackground = isRecovery
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
  const totalEarnedSteps = computeTotalEarnedSteps({
    dayPlan: dayPlanRaw,
    quickThoughts: queueItems,
    todayCompletions: completedQuests,
    userStats,
  });
  const completedCount = completedQuests.length;
  const totalCount = allHomeItems.length + completedCount;
  // Same bonus-inclusive total the Stats page ranks with, so Home and Stats agree.
  const totalStepsForRank = totalEarnedSteps + computeFreshRankBonuses(totalEarnedSteps).rankBonusPool;
  const rankDisplay = stepRank ? `#${stepRank.rank}` : "Unranked";

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

              <View style={styles.modeRow}>
                <Text style={[styles.modeTitle, { color: theme.accent }]}>{theme.mode}</Text>
                <Text style={styles.modeSubtitle} numberOfLines={1}>{modeInstruction}</Text>
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

              {!isNeutral ? (
                <View style={styles.guideScene}>
                  <Image source={guideImage} style={[styles.guideEmblem, { borderColor: theme.accent }]} resizeMode="contain" />
                  <View style={[styles.speechBubble, { borderColor: theme.accent }]}>
                    <Text style={styles.speechText}>{guideMessage}</Text>
                    <Text style={[styles.speechName, { color: theme.accent }]}>{guideName} {isRecovery ? "💜" : "💚"}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.neutralStatusPanel}>
                  <Text style={[styles.neutralStatusText, { color: theme.glow }]}>{modeInstruction}</Text>
                </View>
              )}

              <View style={[styles.energyCard, { borderColor: theme.accent }]}>
                <View style={styles.energyHeaderRow}>
                  <Text style={[styles.energyTitle, { color: theme.accent }]}>{isRecovery ? "+ RECOVERY MODE +" : "ENERGY FLAME"}</Text>
                  <View style={[styles.energyPill, { borderColor: theme.accent }]}>
                    <Text style={[styles.energyPillText, { color: theme.accent }]}>{isNeutral ? "STEADY" : isRecovery ? "RECOVERY" : "PROGRESS"}</Text>
                  </View>
                </View>
                {hasEnergyData && flameState.image ? (
                  <Image
                    source={flameState.image}
                    style={[
                      styles.energyFlame,
                      {
                        height: flameState.size + 58,
                        width: flameState.size + 58,
                      },
                    ]}
                    resizeMode="contain"
                  />
                ) : !hasEnergyData && fireAssets.steadyFlame ? (
                  <Image
                    source={fireAssets.steadyFlame}
                    style={[
                      styles.energyFlame,
                      {
                        height: 112,
                        width: 112,
                      },
                    ]}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.energyFlameFallback}>
                    <Text style={styles.energyFlameFallbackText}>
                      {hasEnergyData ? flameState.emoji : "🔥"}
                    </Text>
                  </View>
                )}
                <View style={styles.energyScoreLine}>
                  <Text style={[styles.energyScore, { color: theme.glow }]}>{hasEnergyData ? energyYield : "—"}</Text>
                  <Text style={styles.energyOutOf}> / 100</Text>
                </View>
                <Text style={[styles.flameMeterText, { color: theme.soft }]}>{hasEnergyData ? flameLabel : "CHECK-IN NEEDED"}</Text>
                <Text style={styles.energyFooterText} numberOfLines={2}>{modeInstruction}</Text>
                {hasEnergyData ? (
                  <Text style={[styles.flameProtectText, { color: theme.accent }]} numberOfLines={2}>
                    {isProgress
                      ? "Protect your flame — don't let it drop below 60."
                      : "Protect your flame — don't let it drop below 30."}
                  </Text>
                ) : null}
              </View>

              <View style={styles.checkInRow}>
                <TouchableOpacity style={[styles.checkInCard, { borderColor: theme.accent }]} onPress={() => navigateWithHaptic("/sleep-checkin")}>
                  <View style={styles.checkIconBox}><Text style={styles.checkIcon}>🌄</Text></View>
                  <View style={styles.checkTextBox}>
                    <Text style={[styles.checkTitle, { color: theme.glow }]}>MORNING{"\n"}CHECK-IN</Text>
                    <Text style={styles.checkSubtitle} numberOfLines={2}>{isRecovery ? "Start your day with kindness." : "Start strong. Set your focus."}</Text>
                  </View>
                  <Text style={[styles.checkArrow, { color: theme.accent }]}>›</Text>
                </TouchableOpacity>

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
              </View>

              <View style={[styles.questBoard, { borderColor: isBoardLocked && activeItem ? kindAccent(activeItem.kind) : isRecoveryLocked ? "#C4A7FF" : theme.accent }]}>
                <View style={styles.questHeaderRow}>
                  <View style={styles.questTitleRow}>
                    <Text style={[styles.questTitle, { color: theme.accent }]}>{isRecovery ? "+ QUEST BOARD +" : "⚔ QUEST BOARD"}</Text>
                    {!isNeutral ? (
                      <TouchableOpacity style={[styles.questHelpBtn, { borderColor: theme.accent }]} onPress={() => setShowQuestHelp(true)}>
                        <Text style={[styles.questHelpBtnText, { color: theme.accent }]}>?</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={[styles.questCount, { color: theme.accent }]}>
                    {isNeutral ? "LOCKED" : isBoardLocked ? "LOCKED" : isRecoveryLocked ? "RECOVERY" : capacityLabel}
                  </Text>
                </View>

                {!isNeutral && todayQuestUnset ? (
                  <TouchableOpacity style={styles.setMainQuestBtn} onPress={() => navigateWithHaptic("/day-plan")}>
                    <Text style={styles.setMainQuestBtnTitle}>SET TODAY’S QUEST</Text>
                    <Text style={styles.setMainQuestBtnHint}>Choose your main quest for today.</Text>
                  </TouchableOpacity>
                ) : null}

                {isNeutral ? (
                  <View style={styles.questLockedCard}>
                    <Text style={styles.questLockedTitle}>Quest Board Locked</Text>
                    <Text style={styles.questLockedText} numberOfLines={2}>Complete a check-in to reveal energy-aware quests for your path.</Text>
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
                ) : availableItems.length === 0 ? (
                  <View style={styles.questLockedCard}>
                    <Text style={styles.questLockedTitle}>No quests yet</Text>
                    <Text style={styles.questLockedText} numberOfLines={2}>Add items in Day Plan or Quests to fill your board.</Text>
                  </View>
                ) : (
                  <>
                    {visibleItems.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.questRow,
                          item.source === "Today's Quest"
                            ? styles.questRowTodayQuest
                            : { borderColor: item.mandatory ? "#F87171" : "#2E3542" },
                        ]}
                        onPress={() => openQuestItem(item)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.questIconSlot}>
                          <Text style={styles.questIcon}>{item.mandatory ? "!" : sourceIcon(item.source)}</Text>
                        </View>
                        <View style={styles.questCopy}>
                          <Text style={styles.questText} numberOfLines={1}>{item.title}</Text>
                          <View style={styles.questMetaRow}>
                            <Text style={[styles.questMeta, { color: theme.soft }]} numberOfLines={1}>
                              {questSourceLabel(item.source)} · {formatDurationLabel(item.durationMinutes)} · {energyLabelFor(item)}{item.scheduledTime ? ` · ${item.scheduledTime}` : ""}
                            </Text>
                            <Text style={[styles.questSteps, { color: kindAccent(item.kind) }]}>+{item.steps}</Text>
                          </View>
                        </View>
                        <Text style={[styles.startChevron, { color: theme.accent }]}>▶</Text>
                      </TouchableOpacity>
                    ))}
                    {lockMessage ? <Text style={styles.lockMessage}>{lockMessage}</Text> : null}
                    {extraItemCount > 0 ? (
                      <Text style={styles.moreHint}>+{extraItemCount} more beyond today&apos;s capacity</Text>
                    ) : null}
                  </>
                )}
              </View>

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
                    <Text style={[styles.statLabel, { color: theme.accent }]}>STEPS</Text>
                    <Text style={styles.statValue}>{totalEarnedSteps}</Text>
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
                      Quest Board shows what to focus on now. It can include MYLIT quests, Day Plan items, checklist items, and Quests you scheduled. Quests are timed — start one at a time and the board locks until it ends. Checklist items are just checked off. Steps are based on duration: 15 min earns +1, 30 min earns +2, 45 min earns +3, 1 hr earns +4. Missed? helps you reflect without punishment. To protect energy, MYLIT limits long progress streaks — after 2 hours of back-to-back tasks, the board locks for a 1-hour recovery break before more work.
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

                    <View style={styles.modalButtonRow}>
                      <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSelectedItem(null)}>
                        <Text style={styles.modalCancelText}>CLOSE</Text>
                      </TouchableOpacity>
                      {selectedItem.source === "Checklist" ? (
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
    backgroundColor: "rgba(6, 10, 18, 0.78)",
    borderWidth: 3,
    borderRadius: 4,
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
  energyCard: {
    width: "64%",
    minHeight: 202,
    alignSelf: "center",
    backgroundColor: "rgba(6, 10, 18, 0.96)",
    borderWidth: 4,
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.7,
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
    backgroundColor: "rgba(5, 9, 17, 0.96)",
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
  questLockedCard: {
    flex: 1,
    minHeight: 86,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "rgba(15, 23, 42, 0.9)",
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
  questRowDone: {
    borderColor: "#22C55E",
    backgroundColor: "rgba(20, 83, 45, 0.72)",
  },
  // Today's Quest always keeps a white border so it reads as "Today's Quest" regardless of its Progress/Recovery color.
  questRowTodayQuest: {
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
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
    backgroundColor: "rgba(10, 14, 26, 0.96)",
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
    borderRadius: 6,
    backgroundColor: "rgba(8, 12, 22, 0.98)",
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
    color: "#F8F1D7",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 6,
    lineHeight: 22,
  },
  modalMetaGrid: {
    marginTop: 12,
    gap: 5,
  },
  modalMeta: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "800",
  },
  modalDescription: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 10,
  },
  recoveryTriggerNote: {
    color: "#C4A7FF",
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
  modalStartText: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
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