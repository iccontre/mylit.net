import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { FormScreen } from "../components/FormScreen";
import { DreamJournalEntryModal } from "../components/DreamJournalEntryModal";
import { SaveButton, type SaveState } from "../components/parchment/SaveButton";
import { uiAssets } from "../constants/uiAssets";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { getSessionSafe } from "../lib/auth";
import { isDuplicateFoodLog, type FoodLog } from "../lib/fuel";
import { persistProgressKeys } from "../lib/progressStore";
import { readJson } from "../lib/readJson";
import { CHECKIN_HISTORY_KEY, FOOD_LOGS_KEY, LATEST_CHECKIN_KEY, MORNING_CHECKIN_DRAFT_KEY } from "../lib/storageKeys";
import { syncDailySnapshot } from "../lib/progressSync";
import {
  AFTERNOON_UNLOCK_HOURS_AFTER_WAKE,
  computeAfternoonUnlockLabel,
  computeSleepSession,
  DEFAULT_AFTERNOON_UNLOCK_TIME,
  formatMinutesAsTime,
  getQuestDayKey,
  parseTimeToMinutes,
  sleepInterruptionPenalty,
} from "../lib/scheduling";
import { loadGuideMemory, loadUserLifeProfile, recordAgentEvent, saveGuideMemory } from "../lib/mylitAgents";
import { ensureEvieMorningQuest } from "../lib/evieMorningQuest";
import type { WakeRhythm } from "../lib/agentTypes";

type CheckInMode = "Recovery" | "Progress";
type CheckInType = "morning" | "afternoon";
type ModeState = CheckInMode | "Neutral";

type MorningCheckInDraft = {
  sleptTimeInput: string;
  sleepQuality: string;
  mood: string;
  stress: string;
  currentEnergyFeeling: string;
  wakeTime: string;
  sleepInterrupted: "yes" | "no" | "";
  interruptionWakeInput: string;
  interruptionSleepAgainInput: string;
  dreamedTonight: "yes" | "no" | "";
  todayIntentText: string;
};

type CheckIn = {
  id: string;
  checkInType?: CheckInType;
  hours?: string;
  sleepQuality?: string;
  sleptTime?: string;
  wakeTime?: string;
  finalWakeTime?: string;
  interrupted?: boolean;
  interruptionWakeTime?: string;
  interruptionSleepTime?: string;
  interruptionDurationMinutes?: number;
  effectiveSleepMinutes?: number;
  dreamedTonight?: boolean;
  mood: string;
  stress: string;
  currentEnergyFeeling?: string;
  eatenSinceMorning?: boolean;
  hasEatenToday?: boolean;
  foodSinceMorning?: string;
  afternoonCheckInCompletedToday?: boolean;
  /** Quest-day (6 AM boundary) this Afternoon Check-In was completed for — lets Home's mandatory
   *  gate selector tell "already done today" apart from "done yesterday" without re-deriving it. */
  afternoonCheckInQuestDayKey?: string;
  tookNap?: boolean;
  napDurationMinutes?: number;
  napEnergyRestored?: number;
  /** Afternoon-only — feeds Luna's sleep guidance, never a medical claim. */
  hadCaffeine?: boolean;
  caffeineTime?: string;
  /** Energy immediately before THIS afternoon adjustment was applied — the anchor a same-day resubmit adjusts from, so editing afternoon answers twice never compounds the +/-10 delta. */
  preAfternoonEnergy?: number;
  energy: number;
  mode: CheckInMode;
  createdAt: string;
};

/** Nap is a special Recovery subtype — its own energy tiers, distinct from generic Recovery quest/checklist values. */
const NAP_ENERGY_BY_DURATION: Record<number, number> = { 15: 3, 30: 6, 45: 9, 60: 12 };
const NAP_DURATION_OPTIONS = [15, 30, 45, 60] as const;

/** Logical quest-day (6 AM boundary) — every "already done today"/"already applied today"
 *  check on this screen compares against THIS, not a plain calendar date, so a check-in
 *  submitted between midnight and 6 AM (inside the automatic LDM window) is still correctly
 *  recognized as "today's" check-in by every other consumer that also keys by quest-day. */
function getTodayKeyLocal(): string {
  return getQuestDayKey();
}

/** Same rule applied to an arbitrary saved timestamp, for comparing a past record's day
 *  against today's quest-day rather than its raw calendar date. */
function questDayKeyOf(isoTimestamp: string): string {
  return getQuestDayKey(new Date(isoTimestamp));
}

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function clampEnergy(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Conservative on purpose (see .agent/docs/MYLIT_GUIDE_INTELLIGENCE_QA.md): poor sleep
 * quality, low mood, and high stress each subtract a fixed penalty and STACK when more than
 * one is true, short sleep gets an extra ceiling that a single good input can't buy back out
 * of, and the worst-case combination (quality/mood/stress all poor) is capped into Recovery
 * regardless of how many hours were slept. This intentionally trades a little optimism for
 * fewer "overestimated into Progress mode on a rough night" outcomes.
 */
function calculateMorningEnergy(hours: number, sleepQuality: number, mood: number, stress: number) {
  const hoursScore = clampEnergy((hours / 8) * 100);
  const sleepQualityScore = sleepQuality * 10;
  const moodScore = mood * 10;
  const stressScore = (10 - stress) * 10;

  let energy = hoursScore * 0.35 + sleepQualityScore * 0.30 + moodScore * 0.20 + stressScore * 0.15;

  if (sleepQuality <= 5) energy -= 8;
  if (mood <= 5) energy -= 6;
  if (stress >= 6) energy -= 8;

  // A single high input shouldn't let short sleep look fine — unless quality, mood, AND
  // stress are all genuinely good, short nights get an extra ceiling under the Progress
  // threshold (60).
  const exceptionalInputs = sleepQuality >= 8 && mood >= 8 && stress <= 3;
  if (hours < 6 && !exceptionalInputs) {
    energy = Math.min(energy, 59);
  }

  // Quality + mood + stress all poor at once outweighs raw sleep duration — stay in Recovery
  // even after a technically-long night.
  if (sleepQuality <= 5 && mood <= 5 && stress >= 6) {
    energy = Math.min(energy, 59);
  }

  return clampEnergy(Math.round(energy));
}

/**
 * Afternoon Check-In is a MIDDAY ADJUSTMENT, never a from-scratch recompute: it can only move
 * current energy by at most +/-10, regardless of how strong any single input is — the hard
 * clamp below is what actually guarantees that, not the per-factor weights.
 */
function calculateAfternoonEnergy(baseEnergy: number, eaten: boolean, mood: number, stress: number, currentEnergyFeeling?: number) {
  const foodAdjustment = eaten ? 6 : -4;
  const moodAdjustment = (mood - 5) * 1.2;
  const stressAdjustment = (5 - stress) * 1.2;
  let delta = foodAdjustment + moodAdjustment + stressAdjustment;

  if (currentEnergyFeeling !== undefined) {
    // Nudge toward the user's own felt-energy rating rather than replacing the baseline with it.
    const feltEnergyScore = currentEnergyFeeling * 10;
    delta += (feltEnergyScore - baseEnergy) * 0.25;
  }

  const clampedDelta = Math.max(-10, Math.min(10, Math.round(delta)));
  return clampEnergy(baseEnergy + clampedDelta);
}

function nowMinutesSinceMidnight(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** Identical shape to FoodLogModal's own resolveEatenAt — "Now" by default, or an exact
 *  free-text time parsed onto today's date. Returns null only for an unparseable exact time. */
function resolveMealEatenAt(useExact: boolean, exactTimeInput: string): Date | null {
  if (!useExact || !exactTimeInput.trim()) return new Date();
  const minutes = parseTimeToMinutes(exactTimeInput.trim());
  if (minutes === null) return null;
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/** Rolling estimate of the user's actual wake time — simple average of the last ~14 Morning Check-In wake times, per spec ("do not overcomplicate"). */
function computeConsistentWakeTime(recentWakeTimes: string[]): string | undefined {
  const minutesList = recentWakeTimes.map((t) => parseTimeToMinutes(t)).filter((m): m is number => m !== null);
  if (!minutesList.length) return undefined;
  const average = Math.round(minutesList.reduce((sum, m) => sum + m, 0) / minutesList.length);
  return formatMinutesAsTime(average);
}

const WAKE_RHYTHM_HISTORY_CAP = 14;

/** Best-effort, non-blocking — a failure here must never block saving the check-in itself. */
async function recordWakeTimeForRhythm(wakeTime: string): Promise<void> {
  try {
    const trimmed = wakeTime.trim();
    if (!trimmed || parseTimeToMinutes(trimmed) === null) return;
    const guideMemory = await loadGuideMemory();
    const existing: WakeRhythm = guideMemory.wakeRhythm ?? { recentWakeTimes: [], updatedAt: new Date(0).toISOString() };
    const recentWakeTimes = [...existing.recentWakeTimes, trimmed].slice(-WAKE_RHYTHM_HISTORY_CAP);
    const wakeRhythm: WakeRhythm = {
      recentWakeTimes,
      consistentWakeTimeEstimate: computeConsistentWakeTime(recentWakeTimes),
      updatedAt: new Date().toISOString(),
    };
    await saveGuideMemory({ wakeRhythm });
  } catch (error) {
    console.warn("recordWakeTimeForRhythm error:", error);
  }
}

function getMode(score: number): CheckInMode {
  return score > 60 ? "Progress" : "Recovery";
}

function getFlameState(score: number) {
  if (score >= 81) return { image: uiAssets.fires.blazingFlame, emoji: "🔥", label: "Blazing Flame", size: 92 };
  if (score >= 61) return { image: uiAssets.fires.brightFlame, emoji: "🔥", label: "Bright Flame", size: 84 };
  if (score >= 41) return { image: uiAssets.fires.steadyFlame, emoji: "🔥", label: "Steady Flame", size: 76 };
  if (score >= 21) return { image: uiAssets.fires.lowFlame, emoji: "🔥", label: "Low Flame", size: 68 };
  return { image: uiAssets.fires.ember, emoji: "✨", label: "Ember", size: 58 };
}

export default function SleepCheckInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mobile = useMobileFrame();
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const legacyType = Array.isArray(params.checkInType) ? params.checkInType[0] : params.checkInType;
  const type = rawType || legacyType;
  const checkInType: CheckInType = type === "afternoon" ? "afternoon" : "morning";

  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [sleptTimeInput, setSleptTimeInput] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [mood, setMood] = useState("");
  const [stress, setStress] = useState("");
  const [eatenSinceMorning, setEatenSinceMorning] = useState<"yes" | "no" | "">("");
  const [foodSinceMorning, setFoodSinceMorning] = useState("");
  // Exact meal time — same component/validation as Food Log (components/FoodLogModal.tsx):
  // "Now" by default, or toggle to an exact free-text time. Feeds a REAL FoodLog event on
  // save (see saveCheckIn) instead of a competing approximate-time field on the CheckIn
  // record, so this answer actually clears the Eat gate and updates fuel like any other meal.
  const [useExactMealTime, setUseExactMealTime] = useState(false);
  const [mealTimeInput, setMealTimeInput] = useState("");
  const [currentEnergyFeeling, setCurrentEnergyFeeling] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [sleepInterrupted, setSleepInterrupted] = useState<"yes" | "no" | "">("");
  const [interruptionWakeInput, setInterruptionWakeInput] = useState("");
  const [interruptionSleepAgainInput, setInterruptionSleepAgainInput] = useState("");
  const [dreamedTonight, setDreamedTonight] = useState<"yes" | "no" | "">("");
  const [todayIntentText, setTodayIntentText] = useState("");
  const [tookNap, setTookNap] = useState<"yes" | "no" | "">("");
  const [napDuration, setNapDuration] = useState<number | null>(null);
  const [hadCaffeine, setHadCaffeine] = useState<"yes" | "no" | "">("");
  const [caffeineTime, setCaffeineTime] = useState("");
  const [afternoonUnlockLabel, setAfternoonUnlockLabel] = useState(DEFAULT_AFTERNOON_UNLOCK_TIME);
  const [afternoonUnlockChecked, setAfternoonUnlockChecked] = useState(false);
  const [showDreamJournalModal, setShowDreamJournalModal] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  /** True once we've confirmed THIS check-in type already has a saved submission for today's
   *  quest day — drives the "already saved" banner and prefills the form below instead of
   *  showing a blank screen that looks like the user needs to start over. */
  const [alreadySavedToday, setAlreadySavedToday] = useState(false);

  // Restore an unfinished Morning Check-In draft (e.g. app was backgrounded, refreshed, or the
  // user opened Dream Journal mid-form) — restored ONCE on mount, before the user types
  // anything new, and only for the morning flow (afternoon has no draft).
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (checkInType === "afternoon" || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    void (async () => {
      const raw = await AsyncStorage.getItem(MORNING_CHECKIN_DRAFT_KEY);
      if (!raw) return;
      try {
        const draft = JSON.parse(raw) as Partial<MorningCheckInDraft>;
        if (draft.sleptTimeInput) setSleptTimeInput(draft.sleptTimeInput);
        if (draft.sleepQuality) setSleepQuality(draft.sleepQuality);
        if (draft.mood) setMood(draft.mood);
        if (draft.stress) setStress(draft.stress);
        if (draft.currentEnergyFeeling) setCurrentEnergyFeeling(draft.currentEnergyFeeling);
        if (draft.wakeTime) setWakeTime(draft.wakeTime);
        if (draft.sleepInterrupted) setSleepInterrupted(draft.sleepInterrupted);
        if (draft.interruptionWakeInput) setInterruptionWakeInput(draft.interruptionWakeInput);
        if (draft.interruptionSleepAgainInput) setInterruptionSleepAgainInput(draft.interruptionSleepAgainInput);
        if (draft.dreamedTonight) setDreamedTonight(draft.dreamedTonight);
        if (draft.todayIntentText) setTodayIntentText(draft.todayIntentText);
      } catch {
        // Malformed draft — safe to ignore, the form just starts blank.
      }
    })();
  }, [checkInType]);

  // Autosave the draft (debounced) any time a morning field changes, so backgrounding/refresh/
  // opening Dream Journal never loses what's already been entered.
  const draftSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (checkInType === "afternoon" || !draftRestoredRef.current) return;
    const draft: MorningCheckInDraft = {
      sleptTimeInput, sleepQuality, mood, stress, currentEnergyFeeling, wakeTime,
      sleepInterrupted, interruptionWakeInput, interruptionSleepAgainInput, dreamedTonight, todayIntentText,
    };
    if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
    draftSaveTimeout.current = setTimeout(() => {
      void AsyncStorage.setItem(MORNING_CHECKIN_DRAFT_KEY, JSON.stringify(draft));
    }, 400);
    return () => {
      if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
    };
  }, [
    checkInType, sleptTimeInput, sleepQuality, mood, stress, currentEnergyFeeling, wakeTime,
    sleepInterrupted, interruptionWakeInput, interruptionSleepAgainInput, dreamedTonight, todayIntentText,
  ]);

  useEffect(() => {
    loadLatestCheckIn();
    void (async () => {
      const [lifeProfile, guideMemory, savedCheckInRaw] = await Promise.all([
        loadUserLifeProfile(),
        loadGuideMemory(),
        AsyncStorage.getItem(LATEST_CHECKIN_KEY),
      ]);
      // Today's actually-recorded wake time (from this morning's real check-in) takes priority
      // over the general planned/learned estimate — see computeAfternoonUnlockLabel.
      let todayRecordedWakeTime: string | undefined;
      try {
        const saved = savedCheckInRaw ? (JSON.parse(savedCheckInRaw) as CheckIn) : null;
        if (saved?.createdAt && questDayKeyOf(saved.createdAt) === getTodayKeyLocal()) {
          todayRecordedWakeTime = saved.wakeTime || saved.finalWakeTime;
        }
      } catch {
        // Malformed saved check-in — fall back to the general estimate below.
      }
      setAfternoonUnlockLabel(
        computeAfternoonUnlockLabel(lifeProfile.plannedWakeTime, guideMemory.wakeRhythm?.consistentWakeTimeEstimate, todayRecordedWakeTime)
      );
      setAfternoonUnlockChecked(true);
    })();
  }, []);

  async function loadLatestCheckIn() {
    const saved = await AsyncStorage.getItem(LATEST_CHECKIN_KEY);

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as CheckIn;
      setLatestCheckIn(parsed);
      const isTodayAfternoon =
        parsed.checkInType === "afternoon" && questDayKeyOf(parsed.createdAt) === getTodayKeyLocal();
      if (isTodayAfternoon && typeof parsed.tookNap === "boolean") {
        setTookNap(parsed.tookNap ? "yes" : "no");
        if (parsed.napDurationMinutes) setNapDuration(parsed.napDurationMinutes);
      }

      // Reopening a check-in that's already saved for TODAY's quest day (of the same type this
      // screen instance is) prefills every answer instead of showing a blank form that reads as
      // "you need to start over" — resubmitting just updates the same day's record.
      const isTodayThisType = parsed.checkInType === checkInType && questDayKeyOf(parsed.createdAt) === getTodayKeyLocal();
      if (isTodayThisType) {
        setAlreadySavedToday(true);
        setMood(parsed.mood ?? "");
        setStress(parsed.stress ?? "");
        setCurrentEnergyFeeling(parsed.currentEnergyFeeling ?? "");
        if (checkInType === "morning") {
          setSleptTimeInput(parsed.sleptTime ?? "");
          setSleepQuality(parsed.sleepQuality ?? "");
          setWakeTime(parsed.wakeTime ?? parsed.finalWakeTime ?? "");
          setSleepInterrupted(parsed.interrupted ? "yes" : "no");
          setInterruptionWakeInput(parsed.interruptionWakeTime ?? "");
          setInterruptionSleepAgainInput(parsed.interruptionSleepTime ?? "");
          setDreamedTonight(typeof parsed.dreamedTonight === "boolean" ? (parsed.dreamedTonight ? "yes" : "no") : "");
        } else {
          setEatenSinceMorning(typeof parsed.eatenSinceMorning === "boolean" ? (parsed.eatenSinceMorning ? "yes" : "no") : "");
          setFoodSinceMorning(parsed.foodSinceMorning ?? "");
          setHadCaffeine(typeof parsed.hadCaffeine === "boolean" ? (parsed.hadCaffeine ? "yes" : "no") : "");
          setCaffeineTime(parsed.caffeineTime ?? "");
        }
      }
    } catch {
      setLatestCheckIn(null);
    }
  }

  const isAfternoon = checkInType === "afternoon";
  // Locked until the unlock check resolves (avoids a flash of the form before we know the
  // real unlock time) and, once resolved, until the current time actually passes it.
  const afternoonUnlockMinutes = parseTimeToMinutes(afternoonUnlockLabel) ?? 14 * 60;
  const isAfternoonLocked = isAfternoon && (!afternoonUnlockChecked || nowMinutesSinceMidnight() < afternoonUnlockMinutes);

  const sleepTimesEntered = sleptTimeInput.trim() !== "" && wakeTime.trim() !== "";
  const interruptionAnswered = sleepInterrupted !== "";
  const interruptionTimesEntered = interruptionWakeInput.trim() !== "" && interruptionSleepAgainInput.trim() !== "";
  const sleepSession = computeSleepSession({
    sleptTime: sleptTimeInput,
    wokeTime: wakeTime,
    interrupted: sleepInterrupted === "yes",
    interruptionWakeTime: interruptionWakeInput,
    interruptionSleepAgainTime: interruptionSleepAgainInput,
  });
  const totalInBedMinutes = sleepTimesEntered ? sleepSession.totalInBedMinutes : null;
  const sleepTimesInvalid = sleepTimesEntered && totalInBedMinutes === null;
  const interruptionDurationMinutes = sleepSession.interruptionDurationMinutes;
  // Only trust effectiveSleepMinutes once the interruption question (and its follow-up
  // times, if interrupted) is fully answered — otherwise treat it as not yet computable.
  const effectiveSleepMinutes =
    sleepTimesEntered && (sleepInterrupted !== "yes" || interruptionTimesEntered) ? sleepSession.effectiveSleepMinutes : null;
  const interruptionBlocksSave = sleepInterrupted === "yes" && interruptionTimesEntered && effectiveSleepMinutes === null;

  const hasMorningInputs =
    sleepTimesEntered &&
    totalInBedMinutes !== null &&
    sleepQuality.trim() !== "" &&
    mood.trim() !== "" &&
    stress.trim() !== "" &&
    interruptionAnswered &&
    (sleepInterrupted !== "yes" || (interruptionTimesEntered && effectiveSleepMinutes !== null));
  const savedModeForNap: ModeState = latestCheckIn?.mode === "Recovery" || latestCheckIn?.mode === "Progress" ? latestCheckIn.mode : "Neutral";
  // Nap question only makes sense in Recovery mode — gated on the mode the user has been
  // in today (from the latest saved check-in), not the not-yet-submitted afternoon inputs.
  const showNapSection = isAfternoon && savedModeForNap === "Recovery";
  const hasNapAnswer = !showNapSection || tookNap !== "" && (tookNap === "no" || napDuration !== null);
  const hasAfternoonInputs = eatenSinceMorning !== "" && mood.trim() !== "" && stress.trim() !== "" && hasNapAnswer;
  const hasAllInputs = isAfternoon ? hasAfternoonInputs : hasMorningInputs;

  const todayKeyForCheckIn = getTodayKeyLocal();
  // Nap energy restores once per day — if today's afternoon check-in already applied it,
  // resubmitting (e.g. to tweak mood/stress) must not stack the bonus again.
  const napAlreadyAppliedToday =
    latestCheckIn?.checkInType === "afternoon" &&
    questDayKeyOf(latestCheckIn.createdAt) === todayKeyForCheckIn &&
    Boolean(latestCheckIn?.napEnergyRestored);
  const napEnergyToApply =
    showNapSection && tookNap === "yes" && napDuration && !napAlreadyAppliedToday ? NAP_ENERGY_BY_DURATION[napDuration] ?? 0 : 0;

  // Editing today's afternoon answers a second time must adjust from the SAME pre-afternoon
  // baseline, not from the already-adjusted energy the first submit saved — otherwise every
  // resubmit would stack another +/-10 on top of the last one.
  const isTodayAfternoonAlreadySaved =
    latestCheckIn?.checkInType === "afternoon" && questDayKeyOf(latestCheckIn.createdAt) === todayKeyForCheckIn;
  const afternoonBaseEnergy =
    isTodayAfternoonAlreadySaved && typeof latestCheckIn?.preAfternoonEnergy === "number"
      ? latestCheckIn.preAfternoonEnergy
      : latestCheckIn?.energy ?? 50;

  const energy = useMemo(() => {
    if (!hasAllInputs) return 0;

    if (isAfternoon) {
      const base = calculateAfternoonEnergy(
        afternoonBaseEnergy,
        eatenSinceMorning === "yes",
        Number(mood),
        Number(stress),
        currentEnergyFeeling.trim() ? Number(currentEnergyFeeling) : undefined
      );
      // Nap energy is added on top, after submit — never just from tapping the duration option.
      return clampEnergy(base + napEnergyToApply);
    }

    const effectiveHours = (effectiveSleepMinutes ?? 0) / 60;
    const base = calculateMorningEnergy(effectiveHours, Number(sleepQuality), Number(mood), Number(stress));
    // Interrupted sleep is lower quality even at the same effective duration as an unbroken
    // night — apply the fragmentation penalty on top of the duration-based baseline.
    const penalty =
      sleepInterrupted === "yes" && interruptionDurationMinutes !== null ? sleepInterruptionPenalty(interruptionDurationMinutes) : 0;
    return clampEnergy(base - penalty);
  }, [
    afternoonBaseEnergy,
    currentEnergyFeeling,
    eatenSinceMorning,
    effectiveSleepMinutes,
    hasAllInputs,
    interruptionDurationMinutes,
    isAfternoon,
    mood,
    napEnergyToApply,
    sleepInterrupted,
    sleepQuality,
    stress,
  ]);

  const savedMode: ModeState = savedModeForNap;
  const mode: CheckInMode = hasAllInputs ? getMode(energy) : savedMode === "Progress" ? "Progress" : "Recovery";
  const activeMode: ModeState = hasAllInputs ? mode : savedMode;
  const isRecovery = activeMode !== "Progress";
  const isProgress = activeMode === "Progress";
  const flameState = getFlameState(hasAllInputs ? energy : latestCheckIn?.energy ?? 0);
  const flameLabel = hasAllInputs ? flameState.label : "Not calculated yet";
  const flameImage = hasAllInputs ? flameState.image : uiAssets.fires.steadyFlame;
  const currentBackground = isRecovery
    ? uiAssets.backgrounds.recovery
    : isProgress
      ? uiAssets.backgrounds.progress
      : uiAssets.backgrounds.neutral;

  const theme = isProgress
    ? { accent: "#FBBF24", glow: "#FEF3C7", panel: "rgba(18, 16, 12, 0.94)", soft: "#FDE68A" }
    : { accent: "#C4A7FF", glow: "#E9D5FF", panel: "rgba(18, 16, 34, 0.94)", soft: "#DDD6FE" };

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  /**
   * A meal logged here goes through the exact same canonical path FoodLogModal uses — same
   * shape, same 5-minute-window dedup (isDuplicateFoodLog) — so "yes I ate" from Afternoon
   * Check-In actually clears the Eat gate and updates fuel/history like any other logged meal,
   * instead of only setting an approximate-time field nothing else reads.
   */
  async function logMealFromCheckIn(eatenAtDate: Date): Promise<void> {
    const existing = await readJson<FoodLog[]>(FOOD_LOGS_KEY, []);
    const eatenAt = eatenAtDate.toISOString();
    if (isDuplicateFoodLog(existing, { eatenAt, entryType: "meal" })) return;

    // A session-lookup failure here must never block this local-first save — see getSessionSafe.
    const session = await getSessionSafe();
    const now = new Date().toISOString();
    const log: FoodLog = {
      id: `foodlog-${Date.now()}`,
      userId: session?.user?.id ?? "local",
      eatenAt,
      entryType: "meal",
      note: foodSinceMorning.trim() || undefined,
      logicalDayKey: getQuestDayKey(eatenAtDate),
      createdAt: now,
      updatedAt: now,
    };
    await persistProgressKeys({ [FOOD_LOGS_KEY]: JSON.stringify([log, ...existing]) });
  }

  async function saveCheckIn() {
    if (!hasAllInputs || saveState === "saving" || saveState === "saved") return;

    // Validate the exact meal time BEFORE entering the saving state, same as Food Log —
    // an unparseable time must never silently fall back to "now" or block the whole check-in.
    let mealEatenAtDate: Date | null = null;
    if (isAfternoon && eatenSinceMorning === "yes") {
      mealEatenAtDate = resolveMealEatenAt(useExactMealTime, mealTimeInput);
      if (!mealEatenAtDate) {
        setSaveState("error");
        return;
      }
    }

    setSaveState("saving");

    try {
      const checkIn: CheckIn = {
        // Spread the previous check-in first so Sleep Guide fields (desired sleep/wake
        // time, cutoff suggestions, etc. — saved under this same storage key from the
        // Sleep Guide screen) survive every morning/afternoon check-in for the week,
        // instead of being wiped out by this object replacing the whole record.
        ...latestCheckIn,
        id: String(Date.now()),
        checkInType,
        // `hours` is kept as a plain decimal for older consumers (weekly averages, daily
        // snapshot sync) that read it directly — always derived from effective sleep now.
        hours: isAfternoon ? latestCheckIn?.hours : effectiveSleepMinutes !== null ? (Math.round((effectiveSleepMinutes / 60) * 10) / 10).toString() : undefined,
        sleepQuality: isAfternoon ? latestCheckIn?.sleepQuality : sleepQuality,
        sleptTime: isAfternoon ? latestCheckIn?.sleptTime : sleptTimeInput.trim() || undefined,
        wakeTime: isAfternoon ? latestCheckIn?.wakeTime : wakeTime.trim() || undefined,
        finalWakeTime: isAfternoon ? latestCheckIn?.finalWakeTime : wakeTime.trim() || undefined,
        interrupted: isAfternoon ? latestCheckIn?.interrupted : sleepInterrupted === "yes",
        interruptionWakeTime: isAfternoon ? latestCheckIn?.interruptionWakeTime : sleepInterrupted === "yes" ? interruptionWakeInput.trim() : undefined,
        interruptionSleepTime: isAfternoon ? latestCheckIn?.interruptionSleepTime : sleepInterrupted === "yes" ? interruptionSleepAgainInput.trim() : undefined,
        interruptionDurationMinutes: isAfternoon ? latestCheckIn?.interruptionDurationMinutes : interruptionDurationMinutes ?? undefined,
        effectiveSleepMinutes: isAfternoon ? latestCheckIn?.effectiveSleepMinutes : effectiveSleepMinutes ?? undefined,
        dreamedTonight: isAfternoon ? latestCheckIn?.dreamedTonight : dreamedTonight === "yes",
        mood,
        stress,
        currentEnergyFeeling: currentEnergyFeeling.trim() || undefined,
        eatenSinceMorning: isAfternoon ? eatenSinceMorning === "yes" : false,
        hasEatenToday: isAfternoon ? eatenSinceMorning === "yes" : false,
        foodSinceMorning: isAfternoon ? foodSinceMorning.trim() : undefined,
        afternoonCheckInCompletedToday: isAfternoon,
        afternoonCheckInQuestDayKey: isAfternoon ? getQuestDayKey() : latestCheckIn?.afternoonCheckInQuestDayKey,
        tookNap: isAfternoon && showNapSection ? tookNap === "yes" : latestCheckIn?.tookNap,
        napDurationMinutes: isAfternoon && showNapSection && tookNap === "yes" ? napDuration ?? undefined : latestCheckIn?.napDurationMinutes,
        // Keep whatever was already restored today if the bonus was already applied —
        // otherwise record this save's nap energy (0 if no nap was taken).
        napEnergyRestored: isAfternoon
          ? napAlreadyAppliedToday
            ? latestCheckIn?.napEnergyRestored
            : napEnergyToApply
          : latestCheckIn?.napEnergyRestored,
        hadCaffeine: isAfternoon ? hadCaffeine === "yes" : latestCheckIn?.hadCaffeine,
        caffeineTime: isAfternoon ? (hadCaffeine === "yes" ? caffeineTime.trim() || undefined : undefined) : latestCheckIn?.caffeineTime,
        // Anchors any SAME-DAY resubmit of afternoon answers to this same pre-adjustment value —
        // see the afternoonBaseEnergy computation above.
        preAfternoonEnergy: isAfternoon ? afternoonBaseEnergy : latestCheckIn?.preAfternoonEnergy,
        energy,
        mode,
        createdAt: new Date().toISOString(),
      };

      // Self-heals corrupted/unparseable history instead of letting it block today's check-in —
      // a stranded old record is not a reason to refuse a save that has nothing to do with it.
      const savedHistory = await AsyncStorage.getItem(CHECKIN_HISTORY_KEY);
      let history: CheckIn[] = [];
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          if (Array.isArray(parsed)) history = parsed;
        } catch {
          history = [];
        }
      }
      const nextHistory = [checkIn, ...history];

      await persistProgressKeys({
        [LATEST_CHECKIN_KEY]: JSON.stringify(checkIn),
        [CHECKIN_HISTORY_KEY]: JSON.stringify(nextHistory),
      });

      // The check-in record above is already safely persisted at this point — a failure in this
      // secondary meal-log sub-step (e.g. a network hiccup during its own session lookup) must
      // never report the whole check-in as failed and make the user re-submit answers that
      // already saved. See getSessionSafe for the specific network-fragility this guards against.
      if (mealEatenAtDate) {
        try {
          await logMealFromCheckIn(mealEatenAtDate);
        } catch (error) {
          console.warn("logMealFromCheckIn failed after a successful check-in save:", error);
        }
      }

      if (!isAfternoon) {
        // Submission succeeded — the draft's job is done. Idempotent: removing an already-gone
        // key is a safe no-op, so a retry/refresh after this point never errors.
        await AsyncStorage.removeItem(MORNING_CHECKIN_DRAFT_KEY);
      }

      if (!isAfternoon && wakeTime.trim()) {
        void recordWakeTimeForRhythm(wakeTime.trim());
      }

      if (!isAfternoon && todayIntentText.trim()) {
        // Idempotent per quest-day — a retry/refresh/another device never generates a second
        // quest for the same day (see ensureEvieMorningQuest).
        void ensureEvieMorningQuest(todayIntentText.trim());
      }

      await successHaptic();

      void trackEvent(
        isAfternoon ? ANALYTICS_EVENTS.afternoon_checkin_completed : ANALYTICS_EVENTS.morning_checkin_completed,
        { energy, mode }
      );
      void syncDailySnapshot({
        energy_score: energy,
        mode,
        mood_score: Number(mood) || null,
        stress_score: Number(stress) || null,
        sleep_hours: isAfternoon ? Number(latestCheckIn?.hours) || null : effectiveSleepMinutes !== null ? Math.round((effectiveSleepMinutes / 60) * 10) / 10 : null,
      });
      void recordAgentEvent({
        type: "sleep_checkin_saved",
        sourcePage: "sleep-checkin",
        relatedItemId: checkIn.id,
        mode: mode === "Recovery" ? "recovery" : "progress",
        metadata: { checkInType: isAfternoon ? "afternoon" : "morning", energy },
      });

      setSaveState("saved");
      // Hold the green ✓ SAVED confirmation on screen briefly, matching the shared Save-state
      // pattern, instead of navigating away the instant persistence resolves.
      setTimeout(() => {
        router.push({ pathname: "/", params: { energy: String(energy), mode } });
      }, 800);
    } catch (error) {
      console.warn("saveCheckIn error:", error);
      // All answers stay exactly as entered — the button surfaces a visible failure + retry
      // affordance instead of silently doing nothing.
      setSaveState("error");
    }
  }

  if (isAfternoonLocked) {
    return (
      <View style={[styles.pageRoot, mobile.pageRootStyle]}>
        <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: theme.accent }]}>
          <View pointerEvents="none" style={styles.backgroundLayer}>
            <Image source={currentBackground} style={styles.backgroundImage} resizeMode="cover" />
          </View>
          <View style={styles.worldOverlay}>
            <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
              <View style={[styles.hero, { borderColor: theme.accent, backgroundColor: theme.panel }]}>
                <Text style={styles.heroTitle}>AFTERNOON CHECK-IN</Text>
                <Text style={styles.heroBody}>
                  {afternoonUnlockChecked
                    ? `Afternoon Check-In opens at ${afternoonUnlockLabel} — ${AFTERNOON_UNLOCK_HOURS_AFTER_WAKE} hours after your wake time, so there's enough of the day to reflect on.`
                    : "Checking when your Afternoon Check-In unlocks…"}
                </Text>
              </View>
              <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
                <Text style={styles.backButtonText}>Back to Today</Text>
              </TouchableOpacity>
            </FormScreen>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: theme.accent }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={currentBackground} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <View style={[styles.hero, { borderColor: theme.accent, backgroundColor: theme.panel }]}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroCopy}>
                  <Text style={[styles.modeIcon, { color: theme.glow }]}>{isAfternoon ? "🌤️" : isRecovery ? "🌙" : "☀️"}</Text>
                  <Text style={styles.heroTitle}>{isAfternoon ? "AFTERNOON CHECK-IN" : "MORNING CHECK-IN"}</Text>
                  <Text style={[styles.heroSubtitle, { color: theme.soft }]}>Update the flame honestly.</Text>
                </View>
                <Image source={isRecovery ? uiAssets.guides.luna : uiAssets.guides.evie} style={[styles.guideAvatar, { borderColor: theme.accent }]} resizeMode="contain" />
              </View>
              <Text style={styles.heroBody}>
                {isAfternoon
                  ? "Tell MYLIT what changed since morning so your Energy Reserve can update."
                  : "This morning ritual helps MYLIT choose quests that fit your real energy."}
              </Text>
              {alreadySavedToday ? (
                <Text style={[styles.heroBody, { marginTop: 6, fontStyle: "italic" }]}>
                  Already saved for today — your answers below are what you saved. Updating will replace them.
                </Text>
              ) : null}
            </View>

            <View style={[styles.dialogueCard, { borderColor: theme.accent }]}>
              <Text style={[styles.dialogueName, { color: theme.glow }]}>{isRecovery ? "🌙 Luna" : "💚 Evie"}</Text>
              <Text style={styles.dialogueText}>
                {isAfternoon
                  ? "Food, stress, mood, and effort can shift your flame. This updates the dashboard without judging you."
                  : "This check-in is not a test. It helps MYLIT decide whether today should be Recovery or Progress."}
              </Text>
            </View>

            <View style={[styles.inputCard, { borderColor: theme.accent }]}>
              <Text style={[styles.cardLabel, { color: theme.glow }]}>{isAfternoon ? "Afternoon Inputs" : "Morning Inputs"}</Text>

              {isAfternoon ? (
                <>
                  <Text style={styles.label}>Have you eaten since morning?</Text>
                  <View style={styles.choiceRow}>
                    <TouchableOpacity style={[styles.choiceButton, eatenSinceMorning === "yes" && styles.choiceButtonActive, { borderColor: eatenSinceMorning === "yes" ? theme.accent : "#5C4425" }]} onPress={() => setEatenSinceMorning("yes")}>
                      <Text style={styles.choiceText}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.choiceButton, eatenSinceMorning === "no" && styles.choiceButtonActive, { borderColor: eatenSinceMorning === "no" ? theme.accent : "#5C4425" }]}
                      onPress={() => {
                        setEatenSinceMorning("no");
                        setUseExactMealTime(false);
                        setMealTimeInput("");
                      }}
                    >
                      <Text style={styles.choiceText}>No</Text>
                    </TouchableOpacity>
                  </View>

                  {eatenSinceMorning === "yes" ? (
                    <>
                      {/* Same exact time input as Food Log (components/FoodLogModal.tsx) — this
                       *  answer creates a real meal event through the same persistence path, not
                       *  a separate approximate-time field. */}
                      <Text style={styles.label}>When did you eat?</Text>
                      <View style={styles.choiceRow}>
                        <TouchableOpacity
                          style={[styles.choiceButton, !useExactMealTime && styles.choiceButtonActive, { borderColor: !useExactMealTime ? theme.accent : "#5C4425" }]}
                          onPress={() => setUseExactMealTime(false)}
                        >
                          <Text style={styles.choiceText}>Now</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.choiceButton, useExactMealTime && styles.choiceButtonActive, { borderColor: useExactMealTime ? theme.accent : "#5C4425" }]}
                          onPress={() => setUseExactMealTime(true)}
                        >
                          <Text style={styles.choiceText}>Exact time</Text>
                        </TouchableOpacity>
                      </View>
                      {useExactMealTime ? (
                        <TextInput
                          style={styles.input}
                          placeholder="Example: 1:15 PM"
                          placeholderTextColor="#64748B"
                          autoCapitalize="characters"
                          value={mealTimeInput}
                          onChangeText={setMealTimeInput}
                        />
                      ) : null}
                    </>
                  ) : null}

                  <Text style={styles.label}>What did you eat? Optional</Text>
                  <TextInput style={styles.input} placeholder="Example: sandwich, fruit, water" placeholderTextColor="#64748B" value={foodSinceMorning} onChangeText={setFoodSinceMorning} />

                  {showNapSection ? (
                    <>
                      <Text style={styles.label}>Did you take a nap?</Text>
                      <Text style={styles.helperText}>If you napped, MYLIT can restore your energy based on how long you rested.</Text>
                      <View style={styles.choiceRow}>
                        <TouchableOpacity
                          style={[styles.choiceButton, tookNap === "yes" && styles.choiceButtonActive, { borderColor: tookNap === "yes" ? theme.accent : "#5C4425" }]}
                          onPress={() => setTookNap("yes")}
                        >
                          <Text style={styles.choiceText}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.choiceButton, tookNap === "no" && styles.choiceButtonActive, { borderColor: tookNap === "no" ? theme.accent : "#5C4425" }]}
                          onPress={() => {
                            setTookNap("no");
                            setNapDuration(null);
                          }}
                        >
                          <Text style={styles.choiceText}>No</Text>
                        </TouchableOpacity>
                      </View>

                      {tookNap === "yes" ? (
                        <View style={styles.napDurationRow}>
                          {NAP_DURATION_OPTIONS.map((minutes) => (
                            <TouchableOpacity
                              key={minutes}
                              style={[styles.napDurationButton, napDuration === minutes && styles.choiceButtonActive, { borderColor: napDuration === minutes ? theme.accent : "#5C4425" }]}
                              onPress={() => setNapDuration(minutes)}
                            >
                              <Text style={styles.napDurationText}>{minutes} min</Text>
                              <Text style={styles.napDurationEnergy}>+{NAP_ENERGY_BY_DURATION[minutes]} energy</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                      {napAlreadyAppliedToday ? (
                        <Text style={styles.helperText}>Nap energy already added today — editing other answers won&apos;t add it again.</Text>
                      ) : null}
                    </>
                  ) : null}

                  <Text style={styles.label}>Did you have caffeine today?</Text>
                  <View style={styles.choiceRow}>
                    <TouchableOpacity
                      style={[styles.choiceButton, hadCaffeine === "yes" && styles.choiceButtonActive, { borderColor: hadCaffeine === "yes" ? theme.accent : "#5C4425" }]}
                      onPress={() => setHadCaffeine("yes")}
                    >
                      <Text style={styles.choiceText}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.choiceButton, hadCaffeine === "no" && styles.choiceButtonActive, { borderColor: hadCaffeine === "no" ? theme.accent : "#5C4425" }]}
                      onPress={() => {
                        setHadCaffeine("no");
                        setCaffeineTime("");
                      }}
                    >
                      <Text style={styles.choiceText}>No</Text>
                    </TouchableOpacity>
                  </View>
                  {hadCaffeine === "yes" ? (
                    <>
                      <Text style={styles.label}>What time? Optional</Text>
                      <TextInput style={styles.input} placeholder="Example: 2:30 PM" placeholderTextColor="#64748B" autoCapitalize="characters" value={caffeineTime} onChangeText={setCaffeineTime} />
                    </>
                  ) : null}
                  <Text style={styles.helperText}>Luna may adjust tonight&apos;s sleep guide based on caffeine and your recent sleep rhythm.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.helperText}>Enter when you fell asleep and woke up. If your sleep was interrupted, MYLIT adjusts your energy estimate.</Text>

                  <Text style={styles.label}>Approximate sleep time</Text>
                  <TextInput style={styles.input} placeholder="Example: 11:30 PM" placeholderTextColor="#64748B" autoCapitalize="characters" value={sleptTimeInput} onChangeText={setSleptTimeInput} />

                  <Text style={styles.label}>Approximate wake-up time</Text>
                  <TextInput style={styles.input} placeholder="Example: 7:00 AM" placeholderTextColor="#64748B" autoCapitalize="characters" value={wakeTime} onChangeText={setWakeTime} />

                  {sleepTimesEntered ? (
                    <>
                      <Text style={styles.label}>Was your sleep interrupted?</Text>
                      <View style={styles.choiceRow}>
                        <TouchableOpacity style={[styles.choiceButton, sleepInterrupted === "yes" && styles.choiceButtonActive, { borderColor: sleepInterrupted === "yes" ? theme.accent : "#5C4425" }]} onPress={() => setSleepInterrupted("yes")}>
                          <Text style={styles.choiceText}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.choiceButton, sleepInterrupted === "no" && styles.choiceButtonActive, { borderColor: sleepInterrupted === "no" ? theme.accent : "#5C4425" }]}
                          onPress={() => {
                            setSleepInterrupted("no");
                            setInterruptionWakeInput("");
                            setInterruptionSleepAgainInput("");
                          }}
                        >
                          <Text style={styles.choiceText}>No</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : null}

                  {sleepInterrupted === "yes" ? (
                    <>
                      <Text style={styles.label}>What time did you wake up?</Text>
                      <TextInput style={styles.input} placeholder="Example: 3:00 AM" placeholderTextColor="#64748B" autoCapitalize="characters" value={interruptionWakeInput} onChangeText={setInterruptionWakeInput} />

                      <Text style={styles.label}>What time did you fall asleep again?</Text>
                      <TextInput style={styles.input} placeholder="Example: 3:20 AM" placeholderTextColor="#64748B" autoCapitalize="characters" value={interruptionSleepAgainInput} onChangeText={setInterruptionSleepAgainInput} />
                    </>
                  ) : null}

                  {sleepTimesInvalid ? (
                    <Text style={styles.errorText}>Enter valid times, like 11:30 PM and 7:15 AM.</Text>
                  ) : interruptionBlocksSave ? (
                    <Text style={styles.errorText}>Those interruption times don&apos;t fit within your sleep window — double-check them.</Text>
                  ) : effectiveSleepMinutes !== null ? (
                    <Text style={styles.helperText}>
                      {Math.floor(effectiveSleepMinutes / 60)}h {effectiveSleepMinutes % 60}m of effective sleep.
                    </Text>
                  ) : null}

                  <Text style={styles.label}>Sleep Quality, 1–10</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="Example: 7" placeholderTextColor="#64748B" value={sleepQuality} onChangeText={setSleepQuality} />

                  <Text style={styles.helperText}>Rate how restored your sleep felt, even if the number of hours looked okay.</Text>

                  <Text style={styles.label}>Did you dream tonight?</Text>
                  <View style={styles.choiceRow}>
                    <TouchableOpacity style={[styles.choiceButton, dreamedTonight === "yes" && styles.choiceButtonActive, { borderColor: dreamedTonight === "yes" ? theme.accent : "#5C4425" }]} onPress={() => setDreamedTonight("yes")}>
                      <Text style={styles.choiceText}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.choiceButton, dreamedTonight === "no" && styles.choiceButtonActive, { borderColor: dreamedTonight === "no" ? theme.accent : "#5C4425" }]} onPress={() => setDreamedTonight("no")}>
                      <Text style={styles.choiceText}>No</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.dreamJournalButton} onPress={() => setShowDreamJournalModal(true)}>
                    <Text style={styles.dreamJournalButtonText}>🌙 Open Dream Journal</Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>Evie: What do you want to get done today?</Text>
                  <Text style={styles.helperText}>Evie turns this into your first quest for today.</Text>
                  <TextInput
                    style={[styles.input, styles.multilineInput]}
                    placeholder="Example: finish the reading for class and go for a walk"
                    placeholderTextColor="#64748B"
                    multiline
                    textAlignVertical="top"
                    value={todayIntentText}
                    onChangeText={setTodayIntentText}
                  />
                </>
              )}

              <Text style={styles.label}>{isAfternoon ? "Current mood, 1-10" : "Mood today, 1-10"}</Text>
              <TextInput style={styles.input} keyboardType="numeric" placeholder="Example: 6" placeholderTextColor="#64748B" value={mood} onChangeText={setMood} />

              <Text style={styles.label}>{isAfternoon ? "Current stress, 1-10" : "Stress level, 1-10"}</Text>
              <TextInput style={styles.input} keyboardType="numeric" placeholder="Example: 4" placeholderTextColor="#64748B" value={stress} onChangeText={setStress} />

              {isAfternoon ? (
                <>
                  <Text style={styles.label}>How energized do you feel right now? Optional, 1-10</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="Example: 5" placeholderTextColor="#64748B" value={currentEnergyFeeling} onChangeText={setCurrentEnergyFeeling} />
                </>
              ) : null}
            </View>

            <View style={[styles.resultCard, { borderColor: theme.accent }]}>
              {flameImage ? (
                <Image source={flameImage} style={{ width: flameState.size, height: flameState.size }} resizeMode="contain" />
              ) : (
                <View style={[styles.flameFallback, { width: flameState.size, height: flameState.size }]}>
                  <Text style={styles.flameFallbackText}>{hasAllInputs ? flameState.emoji : "🔥"}</Text>
                </View>
              )}
              <View style={styles.resultCopy}>
                <Text style={styles.resultLabel}>Energy Reserve</Text>
                <Text style={[styles.energy, { color: theme.glow }]}>{hasAllInputs ? `${energy}/100` : "—/100"}</Text>
                <Text style={[styles.flameLabel, { color: theme.soft }]}>{flameLabel}</Text>
              </View>
              <View style={[styles.modeBadge, { borderColor: theme.accent }]}>
                <Text style={[styles.modeBadgeText, { color: theme.glow }]}>{mode}</Text>
              </View>
            </View>

            <SaveButton
              state={saveState}
              onPress={saveCheckIn}
              disabled={!hasAllInputs}
              idleLabel={hasAllInputs ? (alreadySavedToday ? "UPDATE CHECK-IN" : "SAVE CHECK-IN") : "ENTER CHECK-IN VALUES"}
              style={styles.primaryButton}
            />

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
              <Text style={styles.backButtonText}>Back to Today</Text>
            </TouchableOpacity>
          </FormScreen>
          <DreamJournalEntryModal visible={showDreamJournalModal} onClose={() => setShowDreamJournalModal(false)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#140F0A",
  },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#1C1410",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
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
    zIndex: 0,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  worldOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 12, 0.12)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    flexGrow: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  hero: {
    borderWidth: 4,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  heroCopy: {
    flex: 1,
    marginRight: 12,
  },
  modeIcon: {
    fontSize: 26,
    fontFamily: pixelFont,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#F9FAFB",
    fontFamily: pixelFont,
    textTransform: "uppercase",
    lineHeight: 30,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
    fontFamily: pixelFont,
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 19,
    color: "#E2E8F0",
    fontWeight: "700",
    fontFamily: pixelFont,
  },
  guideAvatar: {
    height: 64,
    width: 64,
    borderRadius: 32,
    borderWidth: 3,
    backgroundColor: "rgba(46,32,20, 0.65)",
  },
  dialogueCard: {
    backgroundColor: "rgba(8, 12, 20, 0.94)",
    borderWidth: 3,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  dialogueName: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 5,
    fontFamily: pixelFont,
  },
  dialogueText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#F8F1D7",
    fontWeight: "700",
    fontFamily: pixelFont,
  },
  inputCard: {
    backgroundColor: "rgba(46,32,20, 0.95)",
    borderRadius: 6,
    padding: 13,
    borderWidth: 3,
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 12,
    marginBottom: 8,
    textTransform: "uppercase",
    fontWeight: "900",
    fontFamily: pixelFont,
    letterSpacing: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "900",
    color: "#E2E8F0",
    marginBottom: 7,
    marginTop: 10,
    textTransform: "uppercase",
    fontFamily: pixelFont,
  },
  input: {
    backgroundColor: "#F4E8CE",
    borderRadius: 7,
    padding: 12,
    fontSize: 16,
    fontWeight: "800",
    color: "#4A3620",
    borderWidth: 2,
    borderColor: "#5C4425",
    fontFamily: pixelFont,
  },
  multilineInput: {
    minHeight: 70,
  },
  choiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  choiceButton: {
    width: "48%",
    backgroundColor: "#F4E8CE",
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#5C4425",
    paddingVertical: 12,
    alignItems: "center",
  },
  choiceButtonActive: {
    backgroundColor: "#86EFAC",
    borderColor: "#14532D",
  },
  napDurationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  napDurationButton: {
    width: "48%",
    backgroundColor: "#F4E8CE",
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#5C4425",
    paddingVertical: 10,
    alignItems: "center",
  },
  napDurationText: {
    color: "#4A3620",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  napDurationEnergy: {
    color: "#7C5B2B",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: pixelFont,
    marginTop: 2,
  },
  choiceText: {
    color: "#4A3620",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#94A3B8",
    marginTop: 8,
    fontWeight: "700",
    fontFamily: pixelFont,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#FCA5A5",
    marginTop: 8,
    fontWeight: "800",
    fontFamily: pixelFont,
  },
  dreamJournalButton: {
    marginTop: 10,
    backgroundColor: "#7C3AED",
    borderRadius: 6,
    borderWidth: 3,
    borderColor: "#4C1D95",
    paddingVertical: 10,
    alignItems: "center",
  },
  dreamJournalButtonText: {
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
    color: "#FFFFFF",
  },
  resultCard: {
    backgroundColor: "rgba(6, 10, 18, 0.96)",
    borderWidth: 4,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  flameFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  flameFallbackText: {
    fontSize: 48,
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  resultCopy: {
    flex: 1,
    marginLeft: 10,
  },
  resultLabel: {
    fontSize: 11,
    color: "#CBD5E1",
    textTransform: "uppercase",
    fontWeight: "900",
    letterSpacing: 1,
    fontFamily: pixelFont,
  },
  energy: {
    fontSize: 32,
    fontWeight: "900",
    fontFamily: pixelFont,
    lineHeight: 38,
  },
  flameLabel: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    fontFamily: pixelFont,
  },
  modeBadge: {
    borderWidth: 2,
    backgroundColor: "#3E2A1A",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
  },
  primaryButton: {
    marginBottom: 10,
  },
  disabledButton: {
    backgroundColor: "#1F2937",
    padding: 14,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 3,
    marginBottom: 10,
    opacity: 0.78,
  },
  buttonText: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  backButton: {
    backgroundColor: "rgba(46,32,20, 0.94)",
    padding: 12,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#5C4425",
  },
  backButtonText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});