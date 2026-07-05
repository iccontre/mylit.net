import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
import { uiAssets } from "../constants/uiAssets";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { persistProgressKeys } from "../lib/progressStore";
import { CHECKIN_HISTORY_KEY, LATEST_CHECKIN_KEY } from "../lib/storageKeys";
import { syncDailySnapshot } from "../lib/progressSync";
import { computeSleepSession, sleepInterruptionPenalty } from "../lib/scheduling";

type CheckInMode = "Recovery" | "Progress";
type CheckInType = "morning" | "afternoon";
type ModeState = CheckInMode | "Neutral";

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
  tookNap?: boolean;
  napDurationMinutes?: number;
  napEnergyRestored?: number;
  energy: number;
  mode: CheckInMode;
  createdAt: string;
};

/** Nap is a special Recovery subtype — its own energy tiers, distinct from generic Recovery quest/checklist values. */
const NAP_ENERGY_BY_DURATION: Record<number, number> = { 15: 3, 30: 6, 45: 9, 60: 12 };
const NAP_DURATION_OPTIONS = [15, 30, 45, 60] as const;

function getTodayKeyLocal(): string {
  return new Date().toLocaleDateString("en-CA");
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

function calculateMorningEnergy(hours: number, sleepQuality: number, mood: number, stress: number) {
  const hoursScore = clampEnergy((hours / 8) * 100);
  const sleepQualityScore = sleepQuality * 10;
  const moodScore = mood * 10;
  const stressScore = (10 - stress) * 10;

  return clampEnergy(
    Math.round(
      hoursScore * 0.35 +
        sleepQualityScore * 0.30 +
        moodScore * 0.20 +
        stressScore * 0.15
    )
  );
}

function calculateAfternoonEnergy(baseEnergy: number, eaten: boolean, mood: number, stress: number, currentEnergyFeeling?: number) {
  const foodBonus = eaten ? 12 : 0;
  const moodAdjustment = (mood - 5) * 2;
  const stressAdjustment = (5 - stress) * 2;
  let updatedEnergy = baseEnergy + foodBonus + moodAdjustment + stressAdjustment;

  if (currentEnergyFeeling !== undefined) {
    const energyFeelingScore = currentEnergyFeeling * 10;
    updatedEnergy = Math.round(updatedEnergy * 0.75 + energyFeelingScore * 0.25);
  }

  return clampEnergy(updatedEnergy);
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
  const [currentEnergyFeeling, setCurrentEnergyFeeling] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [sleepInterrupted, setSleepInterrupted] = useState<"yes" | "no" | "">("");
  const [interruptionWakeInput, setInterruptionWakeInput] = useState("");
  const [interruptionSleepAgainInput, setInterruptionSleepAgainInput] = useState("");
  const [dreamedTonight, setDreamedTonight] = useState<"yes" | "no" | "">("");
  const [tookNap, setTookNap] = useState<"yes" | "no" | "">("");
  const [napDuration, setNapDuration] = useState<number | null>(null);

  useEffect(() => {
    loadLatestCheckIn();
  }, []);

  async function loadLatestCheckIn() {
    const saved = await AsyncStorage.getItem(LATEST_CHECKIN_KEY);

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as CheckIn;
      setLatestCheckIn(parsed);
      // Prefill today's nap answer if this check-in already recorded one, so reopening
      // the screen shows what was saved instead of resetting the question.
      const isTodayAfternoon =
        parsed.checkInType === "afternoon" && new Date(parsed.createdAt).toLocaleDateString("en-CA") === getTodayKeyLocal();
      if (isTodayAfternoon && typeof parsed.tookNap === "boolean") {
        setTookNap(parsed.tookNap ? "yes" : "no");
        if (parsed.napDurationMinutes) setNapDuration(parsed.napDurationMinutes);
      }
    } catch {
      setLatestCheckIn(null);
    }
  }

  const isAfternoon = checkInType === "afternoon";

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
    new Date(latestCheckIn.createdAt).toLocaleDateString("en-CA") === todayKeyForCheckIn &&
    Boolean(latestCheckIn?.napEnergyRestored);
  const napEnergyToApply =
    showNapSection && tookNap === "yes" && napDuration && !napAlreadyAppliedToday ? NAP_ENERGY_BY_DURATION[napDuration] ?? 0 : 0;

  const energy = useMemo(() => {
    if (!hasAllInputs) return 0;

    if (isAfternoon) {
      const base = calculateAfternoonEnergy(
        latestCheckIn?.energy ?? 50,
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
    currentEnergyFeeling,
    eatenSinceMorning,
    effectiveSleepMinutes,
    hasAllInputs,
    interruptionDurationMinutes,
    isAfternoon,
    latestCheckIn?.energy,
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

  async function saveCheckIn() {
    if (!hasAllInputs) return;

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
      tookNap: isAfternoon && showNapSection ? tookNap === "yes" : latestCheckIn?.tookNap,
      napDurationMinutes: isAfternoon && showNapSection && tookNap === "yes" ? napDuration ?? undefined : latestCheckIn?.napDurationMinutes,
      // Keep whatever was already restored today if the bonus was already applied —
      // otherwise record this save's nap energy (0 if no nap was taken).
      napEnergyRestored: isAfternoon
        ? napAlreadyAppliedToday
          ? latestCheckIn?.napEnergyRestored
          : napEnergyToApply
        : latestCheckIn?.napEnergyRestored,
      energy,
      mode,
      createdAt: new Date().toISOString(),
    };

    const savedHistory = await AsyncStorage.getItem(CHECKIN_HISTORY_KEY);
    const history: CheckIn[] = savedHistory ? JSON.parse(savedHistory) : [];
    const nextHistory = [checkIn, ...history];

    await persistProgressKeys({
      [LATEST_CHECKIN_KEY]: JSON.stringify(checkIn),
      [CHECKIN_HISTORY_KEY]: JSON.stringify(nextHistory),
    });

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

    router.push({
      pathname: "/",
      params: {
        energy: String(energy),
        mode,
      },
    });
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
                    <TouchableOpacity style={[styles.choiceButton, eatenSinceMorning === "yes" && styles.choiceButtonActive, { borderColor: eatenSinceMorning === "yes" ? theme.accent : "#334155" }]} onPress={() => setEatenSinceMorning("yes")}>
                      <Text style={styles.choiceText}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.choiceButton, eatenSinceMorning === "no" && styles.choiceButtonActive, { borderColor: eatenSinceMorning === "no" ? theme.accent : "#334155" }]} onPress={() => setEatenSinceMorning("no")}>
                      <Text style={styles.choiceText}>No</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.label}>What did you eat? Optional</Text>
                  <TextInput style={styles.input} placeholder="Example: sandwich, fruit, water" placeholderTextColor="#64748B" value={foodSinceMorning} onChangeText={setFoodSinceMorning} />

                  {showNapSection ? (
                    <>
                      <Text style={styles.label}>Did you take a nap?</Text>
                      <Text style={styles.helperText}>If you napped, MYLIT can restore your energy based on how long you rested.</Text>
                      <View style={styles.choiceRow}>
                        <TouchableOpacity
                          style={[styles.choiceButton, tookNap === "yes" && styles.choiceButtonActive, { borderColor: tookNap === "yes" ? theme.accent : "#334155" }]}
                          onPress={() => setTookNap("yes")}
                        >
                          <Text style={styles.choiceText}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.choiceButton, tookNap === "no" && styles.choiceButtonActive, { borderColor: tookNap === "no" ? theme.accent : "#334155" }]}
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
                              style={[styles.napDurationButton, napDuration === minutes && styles.choiceButtonActive, { borderColor: napDuration === minutes ? theme.accent : "#334155" }]}
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
                        <TouchableOpacity style={[styles.choiceButton, sleepInterrupted === "yes" && styles.choiceButtonActive, { borderColor: sleepInterrupted === "yes" ? theme.accent : "#334155" }]} onPress={() => setSleepInterrupted("yes")}>
                          <Text style={styles.choiceText}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.choiceButton, sleepInterrupted === "no" && styles.choiceButtonActive, { borderColor: sleepInterrupted === "no" ? theme.accent : "#334155" }]}
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
                    <TouchableOpacity style={[styles.choiceButton, dreamedTonight === "yes" && styles.choiceButtonActive, { borderColor: dreamedTonight === "yes" ? theme.accent : "#334155" }]} onPress={() => setDreamedTonight("yes")}>
                      <Text style={styles.choiceText}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.choiceButton, dreamedTonight === "no" && styles.choiceButtonActive, { borderColor: dreamedTonight === "no" ? theme.accent : "#334155" }]} onPress={() => setDreamedTonight("no")}>
                      <Text style={styles.choiceText}>No</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={[styles.dreamJournalButton, { borderColor: theme.accent }]} onPress={() => router.push("/dream-journal")}>
                    <Text style={[styles.dreamJournalButtonText, { color: theme.accent }]}>🌙 Open Dream Journal</Text>
                  </TouchableOpacity>
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

            <TouchableOpacity style={[!hasAllInputs ? styles.disabledButton : styles.primaryButton, { borderColor: hasAllInputs ? theme.accent : "#475569" }]} onPress={saveCheckIn}>
              <Text style={styles.buttonText}>{hasAllInputs ? "Save Check-In" : "Enter Check-In Values"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
              <Text style={styles.backButtonText}>Back to Today</Text>
            </TouchableOpacity>
          </FormScreen>
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
    backgroundColor: "rgba(8, 13, 24, 0.65)",
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
    backgroundColor: "rgba(8, 13, 24, 0.95)",
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
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    fontWeight: "800",
    color: "#F9FAFB",
    borderWidth: 2,
    borderColor: "#334155",
    fontFamily: pixelFont,
  },
  choiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  choiceButton: {
    width: "48%",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    borderWidth: 2,
    paddingVertical: 12,
    alignItems: "center",
  },
  choiceButtonActive: {
    backgroundColor: "rgba(24, 75, 49, 0.9)",
  },
  napDurationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  napDurationButton: {
    width: "48%",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    borderWidth: 2,
    paddingVertical: 10,
    alignItems: "center",
  },
  napDurationText: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  napDurationEnergy: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: pixelFont,
    marginTop: 2,
  },
  choiceText: {
    color: "#F9FAFB",
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
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    borderWidth: 2,
    paddingVertical: 10,
    alignItems: "center",
  },
  dreamJournalButtonText: {
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
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
    backgroundColor: "#111827",
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
    backgroundColor: "#111827",
    padding: 14,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 3,
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
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    padding: 12,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#334155",
  },
  backButtonText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});