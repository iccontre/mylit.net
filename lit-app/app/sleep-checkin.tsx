import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type CheckInMode = "Recovery" | "Progress";
type CheckInType = "morning" | "afternoon";

type CheckIn = {
  id: string;
  checkInType?: CheckInType;
  hours?: string;
  mood: string;
  stress: string;
  currentEnergyFeeling?: string;
  eatenSinceMorning?: boolean;
  foodSinceMorning?: string;
  energy: number;
  mode: CheckInMode;
  createdAt: string;
};

const CHECKIN_KEY = "lit_latest_checkin";
const CHECKIN_HISTORY_KEY = "lit_checkin_history";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function clampEnergy(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function calculateMorningEnergy(hours: number, mood: number, stress: number) {
  let score = 50;

  if (hours >= 8) score += 25;
  else if (hours >= 7) score += 15;
  else if (hours >= 6) score += 5;
  else score -= 15;

  score += (mood - 5) * 4;
  score -= stress * 3;

  return clampEnergy(score);
}

function calculateAfternoonEnergy(baseEnergy: number, eaten: boolean, mood: number, stress: number, currentEnergyFeeling?: number) {
  const foodBonus = eaten ? 12 : 0;
  const moodShift = (mood - 5) * 2;
  const stressShift = stress * -2;
  const feltEnergyShift = currentEnergyFeeling ? (currentEnergyFeeling - 5) * 2 : 0;

  return clampEnergy(baseEnergy + foodBonus + moodShift + stressShift + feltEnergyShift);
}

function getMode(score: number): CheckInMode {
  return score >= 60 ? "Progress" : "Recovery";
}

function getFlameLabel(score: number) {
  if (score >= 80) return "Blazing Flame";
  if (score >= 60) return "Bright Flame";
  if (score >= 40) return "Steady Flame";
  if (score >= 25) return "Low Flame";
  return "Ember";
}

export default function SleepCheckInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const legacyType = Array.isArray(params.checkInType) ? params.checkInType[0] : params.checkInType;
  const type = rawType || legacyType;
  const checkInType: CheckInType = type === "afternoon" ? "afternoon" : "morning";

  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [hours, setHours] = useState("");
  const [mood, setMood] = useState("");
  const [stress, setStress] = useState("");
  const [eatenSinceMorning, setEatenSinceMorning] = useState<"yes" | "no" | "">("");
  const [foodSinceMorning, setFoodSinceMorning] = useState("");
  const [currentEnergyFeeling, setCurrentEnergyFeeling] = useState("");

  useEffect(() => {
    loadLatestCheckIn();
  }, []);

  async function loadLatestCheckIn() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);

    if (!saved) return;

    try {
      setLatestCheckIn(JSON.parse(saved));
    } catch {
      setLatestCheckIn(null);
    }
  }

  const isAfternoon = checkInType === "afternoon";
  const hasMorningInputs = hours.trim() !== "" && mood.trim() !== "" && stress.trim() !== "";
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

    return calculateMorningEnergy(Number(hours), Number(mood), Number(stress));
  }, [currentEnergyFeeling, eatenSinceMorning, hasAllInputs, hours, isAfternoon, latestCheckIn?.energy, mood, stress]);

  const mode = hasAllInputs ? getMode(energy) : "Recovery";
  const isRecovery = mode === "Recovery";
  const flameLabel = hasAllInputs ? getFlameLabel(energy) : "Not calculated yet";

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
      id: String(Date.now()),
      checkInType,
      hours: isAfternoon ? latestCheckIn?.hours : hours,
      mood,
      stress,
      currentEnergyFeeling: currentEnergyFeeling.trim() || undefined,
      eatenSinceMorning: isAfternoon ? eatenSinceMorning === "yes" : false,
      foodSinceMorning: isAfternoon ? foodSinceMorning.trim() : undefined,
      energy,
      mode,
      createdAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(CHECKIN_KEY, JSON.stringify(checkIn));

    const savedHistory = await AsyncStorage.getItem(CHECKIN_HISTORY_KEY);
    const history: CheckIn[] = savedHistory ? JSON.parse(savedHistory) : [];
    const nextHistory = [checkIn, ...history];

    await AsyncStorage.setItem(CHECKIN_HISTORY_KEY, JSON.stringify(nextHistory));

    await successHaptic();

    router.push({
      pathname: "/",
      params: {
        energy: String(energy),
        mode,
      },
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={isRecovery ? styles.recoveryHero : styles.progressHero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.modeIcon}>{isAfternoon ? "🌤️" : isRecovery ? "🌙" : "☀️"}</Text>
              <Text style={styles.heroTitle}>{isAfternoon ? "AFTERNOON CHECK-IN" : "MORNING CHECK-IN"}</Text>
              <Text style={styles.heroSubtitle}>
                {!hasAllInputs ? "Update the flame honestly." : isRecovery ? "Protect your flame." : "Spend your flame wisely."}
              </Text>
            </View>

            <View style={isRecovery ? styles.recoveryLunaOrb : styles.progressLunaOrb}>
              <Text style={styles.lunaFace}>{isRecovery ? "😴" : "🙂"}</Text>
            </View>
          </View>

          <Text style={styles.heroBody}>
            {isAfternoon
              ? "Tell Luna what changed since morning so your Energy Reserve can update."
              : "This morning ritual helps MYLIT choose quests that fit your real energy."}
          </Text>
        </View>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaName}>🌙 Luna</Text>
          <Text style={styles.lunaText}>
            {isAfternoon
              ? "Food, stress, mood, and effort can shift your flame. This updates the dashboard without judging you."
              : "This check-in is not a test. It helps MYLIT decide whether today should be Recovery or Progress."}
          </Text>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.cardLabel}>{isAfternoon ? "Afternoon Inputs" : "Morning Inputs"}</Text>

          {isAfternoon ? (
            <>
              <Text style={styles.label}>Have you eaten since morning?</Text>
              <View style={styles.choiceRow}>
                <TouchableOpacity
                  style={[styles.choiceButton, eatenSinceMorning === "yes" && styles.choiceButtonActive]}
                  onPress={() => setEatenSinceMorning("yes")}
                >
                  <Text style={styles.choiceText}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.choiceButton, eatenSinceMorning === "no" && styles.choiceButtonActive]}
                  onPress={() => setEatenSinceMorning("no")}
                >
                  <Text style={styles.choiceText}>No</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>What did you eat? Optional</Text>
              <TextInput
                style={styles.input}
                placeholder="Example: sandwich, fruit, water"
                placeholderTextColor="#64748B"
                value={foodSinceMorning}
                onChangeText={setFoodSinceMorning}
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Hours slept</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Example: 7"
                placeholderTextColor="#64748B"
                value={hours}
                onChangeText={setHours}
              />

              <Text style={styles.helperText}>Be honest. Even low sleep helps Luna build a better plan.</Text>
            </>
          )}

          <Text style={styles.label}>{isAfternoon ? "Current mood, 1-10" : "Mood today, 1-10"}</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Example: 6"
            placeholderTextColor="#64748B"
            value={mood}
            onChangeText={setMood}
          />

          <Text style={styles.label}>{isAfternoon ? "Current stress, 1-10" : "Stress level, 1-10"}</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Example: 4"
            placeholderTextColor="#64748B"
            value={stress}
            onChangeText={setStress}
          />

          {isAfternoon ? (
            <>
              <Text style={styles.label}>How energized do you feel right now? Optional, 1-10</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Example: 5"
                placeholderTextColor="#64748B"
                value={currentEnergyFeeling}
                onChangeText={setCurrentEnergyFeeling}
              />
            </>
          ) : null}
        </View>

        <View style={isRecovery ? styles.recoveryResultCard : styles.progressResultCard}>
          <View>
            <Text style={styles.resultLabel}>Energy Reserve</Text>
            <Text style={styles.energy}>{hasAllInputs ? `🔥 ${energy}/100` : "🔥 —/100"}</Text>
            <Text style={styles.flameLabel}>{flameLabel}</Text>
          </View>

          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{mode}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={!hasAllInputs ? styles.disabledButton : isRecovery ? styles.recoveryButton : styles.progressButton}
          onPress={saveCheckIn}
        >
          <Text style={styles.buttonText}>{hasAllInputs ? "Save Check-In" : "Enter Check-In Values"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
          <Text style={styles.backButtonText}>Back to Today</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  container: {
    paddingTop: 28,
    paddingBottom: 36,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  progressHero: {
    backgroundColor: "#251F11",
    borderColor: "#FBBF24",
    borderWidth: 3,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
  },
  recoveryHero: {
    backgroundColor: "#1B1940",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  heroCopy: {
    flex: 1,
    marginRight: 12,
  },
  modeIcon: {
    fontSize: 28,
    fontFamily: pixelFont,
  },
  heroTitle: {
    fontSize: 25,
    fontWeight: "900",
    color: "#F9FAFB",
    fontFamily: pixelFont,
    textTransform: "uppercase",
  },
  heroSubtitle: {
    fontSize: 13,
    color: "#CBD5E1",
    fontWeight: "800",
    marginTop: 4,
    fontFamily: pixelFont,
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 20,
    color: "#E2E8F0",
    fontWeight: "700",
    fontFamily: pixelFont,
  },
  progressLunaOrb: {
    height: 58,
    width: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    backgroundColor: "#0F172A",
    borderColor: "#FBBF24",
  },
  recoveryLunaOrb: {
    height: 58,
    width: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    backgroundColor: "#0F172A",
    borderColor: "#A78BFA",
  },
  lunaFace: {
    fontSize: 26,
    fontFamily: pixelFont,
  },
  lunaCard: {
    backgroundColor: "#111827",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#334155",
  },
  lunaName: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FDE68A",
    marginBottom: 6,
    fontFamily: pixelFont,
  },
  lunaText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#CBD5E1",
    fontWeight: "600",
    fontFamily: pixelFont,
  },
  inputCard: {
    backgroundColor: "#111827",
    borderRadius: 18,
    padding: 14,
    borderWidth: 2,
    borderColor: "#334155",
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 12,
    color: "#FDE68A",
    marginBottom: 8,
    textTransform: "uppercase",
    fontWeight: "900",
    fontFamily: pixelFont,
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
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
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
    backgroundColor: "#0F172A",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#334155",
    paddingVertical: 12,
    alignItems: "center",
  },
  choiceButtonActive: {
    borderColor: "#FBBF24",
    backgroundColor: "#184B31",
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
  progressResultCard: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
    borderWidth: 3,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recoveryResultCard: {
    backgroundColor: "#111827",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultLabel: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 6,
    fontFamily: pixelFont,
  },
  energy: {
    fontSize: 34,
    fontWeight: "900",
    color: "#FBBF24",
    fontFamily: pixelFont,
  },
  flameLabel: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
    fontFamily: pixelFont,
  },
  modeBadge: {
    backgroundColor: "#0F172A",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  modeBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  progressButton: {
    backgroundColor: "#111827",
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FBBF24",
    marginBottom: 10,
  },
  recoveryButton: {
    backgroundColor: "#312E81",
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#A78BFA",
    marginBottom: 10,
  },
  disabledButton: {
    backgroundColor: "#334155",
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#475569",
    marginBottom: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  backButton: {
    backgroundColor: "#0F172A",
    padding: 14,
    borderRadius: 14,
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