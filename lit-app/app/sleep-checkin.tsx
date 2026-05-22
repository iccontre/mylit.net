import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type MealHeaviness = "Light" | "Medium" | "Heavy";

type CheckIn = {
  id: string;
  hours: string;
  mood: string;
  stress: string;
  energy: number;
  mode: "Recovery" | "Progress";
  createdAt: string;
  wakeTime?: string;
  caffeineAmount?: string;
  lastCaffeineTime?: string;
  lastMealTime?: string;
  mealHeaviness?: MealHeaviness;
  windDownGoal?: string;
  estimatedSleepWindow?: string;
  caffeineCutoffSuggestion?: string;
  mealCutoffSuggestion?: string;
};

const CHECKIN_KEY = "lit_latest_checkin";
const CHECKIN_HISTORY_KEY = "lit_checkin_history";

function calculateEnergy(hours: number, mood: number, stress: number) {
  let score = 50;

  if (hours >= 8) score += 25;
  else if (hours >= 7) score += 15;
  else if (hours >= 6) score += 5;
  else score -= 15;

  score += (mood - 5) * 4;
  score -= stress * 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getMode(score: number): "Recovery" | "Progress" {
  return score >= 60 ? "Progress" : "Recovery";
}

function getFlameLabel(score: number) {
  if (score >= 75) return "Bright Flame";
  if (score >= 45) return "Steady Flame";
  return "Low Flame";
}

function parseTimeLabel(input: string): Date | null {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;

  const rawHour = Number(match[1]);
  const rawMinute = match[2] ? Number(match[2]) : 0;
  const meridian = match[3];

  if (Number.isNaN(rawHour) || Number.isNaN(rawMinute)) return null;
  if (rawHour < 0 || rawHour > 23 || rawMinute < 0 || rawMinute > 59) return null;

  let hour24 = rawHour;

  if (meridian) {
    if (rawHour < 1 || rawHour > 12) return null;
    if (meridian === "AM") hour24 = rawHour === 12 ? 0 : rawHour;
    if (meridian === "PM") hour24 = rawHour === 12 ? 12 : rawHour + 12;
  } else if (rawHour > 23) {
    return null;
  }

  const date = new Date();
  date.setHours(hour24, rawMinute, 0, 0);
  return date;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setTime(next.getTime() + hours * 60 * 60 * 1000);
  return next;
}

function subtractHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setTime(next.getTime() - hours * 60 * 60 * 1000);
  return next;
}

export default function SleepCheckInScreen() {
  const router = useRouter();

  const [hours, setHours] = useState("");
  const [mood, setMood] = useState("");
  const [stress, setStress] = useState("");

  const [wakeTime, setWakeTime] = useState("");
  const [caffeineAmount, setCaffeineAmount] = useState("");
  const [lastCaffeineTime, setLastCaffeineTime] = useState("");
  const [lastMealTime, setLastMealTime] = useState("");
  const [mealHeaviness, setMealHeaviness] = useState<MealHeaviness>("Medium");
  const [windDownGoal, setWindDownGoal] = useState("");

  const hasAllInputs = hours.trim() !== "" && mood.trim() !== "" && stress.trim() !== "";

  const energy = hasAllInputs
    ? calculateEnergy(Number(hours), Number(mood), Number(stress))
    : 0;

  const mode = hasAllInputs ? getMode(energy) : "Recovery";
  const isRecovery = mode === "Recovery";
  const flameLabel = hasAllInputs ? getFlameLabel(energy) : "Not calculated yet";

  const wakeTimeDate = useMemo(() => parseTimeLabel(wakeTime), [wakeTime]);
  const windDownDate = useMemo(() => parseTimeLabel(windDownGoal), [windDownGoal]);
  const hoursNumber = useMemo(() => Number(hours), [hours]);

  const estimatedPreviousSleepTime = useMemo(() => {
    if (!wakeTimeDate || Number.isNaN(hoursNumber) || hoursNumber <= 0) return "";
    return formatTime(subtractHours(wakeTimeDate, hoursNumber));
  }, [wakeTimeDate, hoursNumber]);

  const estimatedSleepWindow = useMemo(() => {
    if (!windDownDate) return "Start wind-down 30–60 minutes before your target bedtime.";
    const end = addHours(windDownDate, 1);
    return `${formatTime(windDownDate)} - ${formatTime(end)}`;
  }, [windDownDate]);

  const caffeineCutoffSuggestion = useMemo(() => {
    if (windDownDate) {
      return `Suggested caffeine cutoff: around ${formatTime(subtractHours(windDownDate, 8))}`;
    }
    if (lastCaffeineTime.trim()) {
      return "A simple rule: avoid caffeine late in the day, especially within 6–8 hours of sleep.";
    }
    return "";
  }, [windDownDate, lastCaffeineTime]);

  const mealCutoffSuggestion = useMemo(() => {
    if (!windDownDate) return "";
    const offset = mealHeaviness === "Heavy" ? 4 : mealHeaviness === "Medium" ? 3 : 2;
    return `Suggested meal cutoff: around ${formatTime(subtractHours(windDownDate, offset))}`;
  }, [windDownDate, mealHeaviness]);

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
      hours,
      mood,
      stress,
      energy,
      mode,
      createdAt: new Date().toISOString(),
      wakeTime: wakeTime.trim() || undefined,
      caffeineAmount: caffeineAmount.trim() || undefined,
      lastCaffeineTime: lastCaffeineTime.trim() || undefined,
      lastMealTime: lastMealTime.trim() || undefined,
      mealHeaviness,
      windDownGoal: windDownGoal.trim() || undefined,
      estimatedSleepWindow: estimatedSleepWindow || undefined,
      caffeineCutoffSuggestion: caffeineCutoffSuggestion || undefined,
      mealCutoffSuggestion: mealCutoffSuggestion || undefined,
    };

    await AsyncStorage.setItem(CHECKIN_KEY, JSON.stringify(checkIn));

    const savedHistory = await AsyncStorage.getItem(CHECKIN_HISTORY_KEY);
    const history: CheckIn[] = savedHistory ? JSON.parse(savedHistory) : [];
    const nextHistory = [checkIn, ...history];
    await AsyncStorage.setItem(CHECKIN_HISTORY_KEY, JSON.stringify(nextHistory));

    await successHaptic();

    router.push({
      pathname: "/",
      params: { energy: String(energy), mode },
    });
  }

  return (
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : styles.progressScreen}
      contentContainerStyle={styles.container}
    >
      <View style={isRecovery ? styles.recoveryHero : styles.progressHero}>
        <Text style={styles.heroTitle}>Morning Check-In</Text>
        <Text style={styles.heroSubtitle}>
          {!hasAllInputs
            ? "Start with an honest snapshot."
            : isRecovery
            ? "Protect your flame."
            : "Spend your flame wisely."}
        </Text>
      </View>

      <View style={styles.inputCard}>
        <Text style={styles.cardLabel}>Energy Inputs</Text>

        <Text style={styles.label}>Hours slept</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={hours} onChangeText={setHours} />

        <Text style={styles.label}>Mood today, 1-10</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={mood} onChangeText={setMood} />

        <Text style={styles.label}>Stress level, 1-10</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={stress} onChangeText={setStress} />

        <Text style={styles.cardLabel}>Sleep Timing Inputs (Optional)</Text>

        <Text style={styles.label}>Approximate wake-up time</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: 7:30 AM"
          placeholderTextColor="#9CA3AF"
          value={wakeTime}
          onChangeText={setWakeTime}
        />

        <Text style={styles.label}>Caffeine amount today</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: 1 coffee, 150mg, or none"
          placeholderTextColor="#9CA3AF"
          value={caffeineAmount}
          onChangeText={setCaffeineAmount}
        />

        <Text style={styles.label}>Last caffeine time</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: 2:00 PM"
          placeholderTextColor="#9CA3AF"
          value={lastCaffeineTime}
          onChangeText={setLastCaffeineTime}
        />

        <Text style={styles.label}>Last meal time</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: 8:00 PM"
          placeholderTextColor="#9CA3AF"
          value={lastMealTime}
          onChangeText={setLastMealTime}
        />

        <Text style={styles.label}>Meal heaviness</Text>
        <View style={styles.row}>
          {(["Light", "Medium", "Heavy"] as MealHeaviness[]).map((item) => {
            const active = mealHeaviness === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.choice, active && styles.choiceActive]}
                onPress={() => setMealHeaviness(item)}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Wind-down goal time</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: 10:30 PM"
          placeholderTextColor="#9CA3AF"
          value={windDownGoal}
          onChangeText={setWindDownGoal}
        />
      </View>

      <View style={styles.resultCard}>
        <Text style={styles.resultLabel}>Energy Reserve</Text>
        <Text style={styles.energy}>{hasAllInputs ? `🔥 ${energy}/100` : "🔥 —/100"}</Text>
        <Text style={styles.flameLabel}>{flameLabel}</Text>
        <Text style={styles.modeText}>{mode}</Text>
      </View>

      <View style={styles.timingCard}>
        <Text style={styles.resultLabel}>Sleep Timing Guide</Text>
        {estimatedPreviousSleepTime ? (
          <Text style={styles.helper}>
            You may have fallen asleep around {estimatedPreviousSleepTime}, based on your wake time and hours slept.
          </Text>
        ) : null}
        <Text style={styles.helper}>Estimated sleep window: {estimatedSleepWindow}</Text>
        {caffeineCutoffSuggestion ? <Text style={styles.helper}>{caffeineCutoffSuggestion}</Text> : null}
        {mealCutoffSuggestion ? <Text style={styles.helper}>{mealCutoffSuggestion}</Text> : null}
        {lastCaffeineTime.trim() ? (
          <Text style={styles.helper}>For better sleep, consider avoiding caffeine 6–8 hours before bed.</Text>
        ) : null}
        <Text style={styles.helper}>Use this as a guide, not a rule.</Text>
      </View>

      <TouchableOpacity
        style={!hasAllInputs ? styles.disabledButton : styles.saveButton}
        onPress={saveCheckIn}
      >
        <Text style={styles.buttonText}>{hasAllInputs ? "Save Check-In" : "Enter Check-In Values"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
        <Text style={styles.backButtonText}>Back to Today</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  progressScreen: { flex: 1, backgroundColor: "#FFF7ED" },
  recoveryScreen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  progressHero: {
    backgroundColor: "#FEF3C7",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  recoveryHero: {
    backgroundColor: "#1E1B4B",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  heroTitle: { fontSize: 30, fontWeight: "900", color: "#111827" },
  heroSubtitle: { fontSize: 14, fontWeight: "800", color: "#374151", marginTop: 4 },
  inputCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#374151",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "#374151",
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 6,
  },
  label: { fontSize: 14, fontWeight: "800", color: "#111827", marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 12,
    color: "#111827",
    fontWeight: "700",
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  choice: {
    width: "32%",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  choiceActive: { backgroundColor: "#111827", borderColor: "#FBBF24" },
  choiceText: { color: "#111827", fontWeight: "800" },
  choiceTextActive: { color: "#FFFFFF" },
  resultCard: {
    backgroundColor: "#111827",
    borderWidth: 3,
    borderColor: "#374151",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  timingCard: {
    backgroundColor: "#EEF2FF",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  resultLabel: { color: "#D1D5DB", fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  energy: { color: "#FBBF24", fontSize: 36, fontWeight: "900", marginTop: 4 },
  flameLabel: { color: "#F9FAFB", fontWeight: "800", marginTop: 2 },
  modeText: { color: "#F9FAFB", fontWeight: "800", marginTop: 6 },
  helper: { color: "#111827", fontWeight: "700", lineHeight: 20, marginTop: 6 },
  saveButton: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  disabledButton: {
    backgroundColor: "#6B7280",
    borderColor: "#9CA3AF",
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  buttonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },
  backButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  backButtonText: { color: "#111827", fontWeight: "900", fontSize: 15 },
});