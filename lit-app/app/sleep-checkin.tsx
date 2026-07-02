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

type CheckInMode = "Recovery" | "Progress";
type CheckInType = "morning" | "afternoon";
type ModeState = CheckInMode | "Neutral";

type CheckIn = {
  id: string;
  checkInType?: CheckInType;
  hours?: string;
  sleepQuality?: string;
  wakeTime?: string;
  dreamedTonight?: boolean;
  mood: string;
  stress: string;
  currentEnergyFeeling?: string;
  eatenSinceMorning?: boolean;
  hasEatenToday?: boolean;
  foodSinceMorning?: string;
  afternoonCheckInCompletedToday?: boolean;
  energy: number;
  mode: CheckInMode;
  createdAt: string;
};

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
  const [hours, setHours] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [mood, setMood] = useState("");
  const [stress, setStress] = useState("");
  const [eatenSinceMorning, setEatenSinceMorning] = useState<"yes" | "no" | "">("");
  const [foodSinceMorning, setFoodSinceMorning] = useState("");
  const [currentEnergyFeeling, setCurrentEnergyFeeling] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [dreamedTonight, setDreamedTonight] = useState<"yes" | "no" | "">("");

  useEffect(() => {
    loadLatestCheckIn();
  }, []);

  async function loadLatestCheckIn() {
    const saved = await AsyncStorage.getItem(LATEST_CHECKIN_KEY);

    if (!saved) return;

    try {
      setLatestCheckIn(JSON.parse(saved));
    } catch {
      setLatestCheckIn(null);
    }
  }

  const isAfternoon = checkInType === "afternoon";
  const hasMorningInputs = hours.trim() !== "" && sleepQuality.trim() !== "" && mood.trim() !== "" && stress.trim() !== "";
  const hasAfternoonInputs = eatenSinceMorning !== "" && mood.trim() !== "" && stress.trim() !== "";
  const hasAllInputs = isAfternoon ? hasAfternoonInputs : hasMorningInputs;

  const energy = useMemo(() => {
    if (!hasAllInputs) return 0;

    if (isAfternoon) {
      return calculateAfternoonEnergy(
        latestCheckIn?.energy ?? 50,
        eatenSinceMorning === "yes",
        Number(mood),
        Number(stress),
        currentEnergyFeeling.trim() ? Number(currentEnergyFeeling) : undefined
      );
    }

    return calculateMorningEnergy(Number(hours), Number(sleepQuality), Number(mood), Number(stress));
  }, [currentEnergyFeeling, eatenSinceMorning, hasAllInputs, hours, isAfternoon, latestCheckIn?.energy, mood, sleepQuality, stress]);

  const savedMode: ModeState = latestCheckIn?.mode === "Recovery" || latestCheckIn?.mode === "Progress" ? latestCheckIn.mode : "Neutral";
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
      hours: isAfternoon ? latestCheckIn?.hours : hours,
      sleepQuality: isAfternoon ? latestCheckIn?.sleepQuality : sleepQuality,
      wakeTime: isAfternoon ? latestCheckIn?.wakeTime : wakeTime.trim() || undefined,
      dreamedTonight: isAfternoon ? latestCheckIn?.dreamedTonight : dreamedTonight === "yes",
      mood,
      stress,
      currentEnergyFeeling: currentEnergyFeeling.trim() || undefined,
      eatenSinceMorning: isAfternoon ? eatenSinceMorning === "yes" : false,
      hasEatenToday: isAfternoon ? eatenSinceMorning === "yes" : false,
      foodSinceMorning: isAfternoon ? foodSinceMorning.trim() : undefined,
      afternoonCheckInCompletedToday: isAfternoon,
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
      sleep_hours: isAfternoon ? Number(latestCheckIn?.hours) || null : Number(hours) || null,
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
                </>
              ) : (
                <>
                  <Text style={styles.label}>Hours slept</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="Example: 7" placeholderTextColor="#64748B" value={hours} onChangeText={setHours} />

                  <Text style={styles.label}>Sleep Quality, 1–10</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="Example: 7" placeholderTextColor="#64748B" value={sleepQuality} onChangeText={setSleepQuality} />

                  <Text style={styles.helperText}>Rate how restored your sleep felt, even if the number of hours looked okay.</Text>

                  <Text style={styles.label}>Approximate wake-up time</Text>
                  <TextInput style={styles.input} placeholder="Example: 7:00 AM" placeholderTextColor="#64748B" value={wakeTime} onChangeText={setWakeTime} />

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