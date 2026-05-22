import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMemo, useState } from "react";

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
  if (score >= 75) return "BRIGHT FLAME";
  if (score >= 45) return "STEADY FLAME";
  return "LOW FLAME";
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
  if (rawMinute < 0 || rawMinute > 59) return null;

  let hour24 = rawHour;

  if (meridian) {
    if (rawHour < 1 || rawHour > 12) return null;
    if (meridian === "AM") hour24 = rawHour === 12 ? 0 : rawHour;
    if (meridian === "PM") hour24 = rawHour === 12 ? 12 : rawHour + 12;
  } else {
    if (rawHour < 0 || rawHour > 23) return null;
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
  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });

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
  const flameLabel = hasAllInputs ? getFlameLabel(energy) : "NOT CALCULATED YET";

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
    } catch {}
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.contentShell}>
        <View style={[styles.hero, isRecovery ? styles.heroRecovery : styles.heroProgress]}>
          <Text style={[styles.heroTitle, { fontFamily: mono }]}>MORNING CHECK-IN</Text>
          <Text style={styles.heroSub}>
            {hasAllInputs ? (isRecovery ? "Protect your flame." : "Spend your flame wisely.") : "Start with an honest snapshot."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={[styles.sectionTitle, { fontFamily: mono }]}>ENERGY INPUTS</Text>

          <Text style={styles.label}>Hours slept</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={hours} onChangeText={setHours} />

          <Text style={styles.label}>Mood today, 1-10</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={mood} onChangeText={setMood} />

          <Text style={styles.label}>Stress level, 1-10</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={stress} onChangeText={setStress} />

          <Text style={[styles.sectionTitle, { fontFamily: mono }]}>SLEEP TIMING (OPTIONAL)</Text>

          <Text style={styles.label}>Approximate wake-up time</Text>
          <TextInput style={styles.input} placeholder="Example: 7:30 AM" placeholderTextColor="#9CA3AF" value={wakeTime} onChangeText={setWakeTime} />

          <Text style={styles.label}>Caffeine amount today</Text>
          <TextInput style={styles.input} placeholder="Example: 1 coffee, 150mg, or none" placeholderTextColor="#9CA3AF" value={caffeineAmount} onChangeText={setCaffeineAmount} />

          <Text style={styles.label}>Last caffeine time</Text>
          <TextInput style={styles.input} placeholder="Example: 2:00 PM" placeholderTextColor="#9CA3AF" value={lastCaffeineTime} onChangeText={setLastCaffeineTime} />

          <Text style={styles.label}>Last meal time</Text>
          <TextInput style={styles.input} placeholder="Example: 8:00 PM" placeholderTextColor="#9CA3AF" value={lastMealTime} onChangeText={setLastMealTime} />

          <Text style={styles.label}>Meal heaviness</Text>
          <View style={styles.choicesRow}>
            {(["Light", "Medium", "Heavy"] as MealHeaviness[]).map((item) => {
              const active = mealHeaviness === item;
              return (
                <TouchableOpacity key={item} style={[styles.choice, active && styles.choiceActive]} onPress={() => setMealHeaviness(item)}>
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Wind-down goal time</Text>
          <TextInput style={styles.input} placeholder="Example: 10:30 PM" placeholderTextColor="#9CA3AF" value={windDownGoal} onChangeText={setWindDownGoal} />
        </View>

        <View style={styles.energyCard}>
          <Text style={[styles.sectionTitleLight, { fontFamily: mono }]}>ENERGY RESERVE</Text>
          <Text style={[styles.energyValue, { fontFamily: mono }]}>{hasAllInputs ? `${energy}/100` : "—/100"}</Text>
          <Text style={styles.energyMeta}>{flameLabel}</Text>
          <Text style={styles.energyMeta}>{mode}</Text>
        </View>

        <View style={styles.card}>
          <Text style={[styles.sectionTitle, { fontFamily: mono }]}>SLEEP TIMING GUIDE</Text>
          {estimatedPreviousSleepTime ? (
            <Text style={styles.helper}>
              You may have fallen asleep around {estimatedPreviousSleepTime}, based on what you entered.
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

        <TouchableOpacity style={[styles.primaryBtn, !hasAllInputs && styles.disabledBtn]} onPress={saveCheckIn}>
          <Text style={styles.primaryBtnText}>{hasAllInputs ? "Save Check-In" : "Enter Check-In Values"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push("/")}>
          <Text style={styles.secondaryBtnText}>Back to Today</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 42, paddingBottom: 28 },
  contentShell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  hero: { borderWidth: 3, borderRadius: 16, padding: 12, marginBottom: 10 },
  heroProgress: { backgroundColor: "#FEF3C7", borderColor: "#FBBF24" },
  heroRecovery: { backgroundColor: "#1E1B4B", borderColor: "#A78BFA" },
  heroTitle: { fontSize: 24, color: "#111827", fontWeight: "900", letterSpacing: 1 },
  heroSub: { marginTop: 4, fontSize: 12, fontWeight: "700", color: "#374151" },

  card: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#374151", borderRadius: 14, padding: 12, marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 1, color: "#111827", marginTop: 6, marginBottom: 6 },
  sectionTitleLight: { fontSize: 12, fontWeight: "900", letterSpacing: 1, color: "#F9FAFB", marginBottom: 6 },
  label: { fontSize: 12, color: "#374151", fontWeight: "800", marginTop: 6, marginBottom: 4 },
  input: { borderWidth: 2, borderColor: "#D1D5DB", borderRadius: 10, backgroundColor: "#F3F4F6", padding: 10, color: "#111827", fontWeight: "700" },

  choicesRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 4 },
  choice: { width: "32%", borderWidth: 2, borderColor: "#D1D5DB", borderRadius: 9, paddingVertical: 8, alignItems: "center", backgroundColor: "#F9FAFB" },
  choiceActive: { backgroundColor: "#111827", borderColor: "#FBBF24" },
  choiceText: { color: "#111827", fontWeight: "800", fontSize: 12 },
  choiceTextActive: { color: "#F9FAFB" },

  energyCard: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 14, padding: 12, marginBottom: 10 },
  energyValue: { fontSize: 34, fontWeight: "900", color: "#FBBF24", letterSpacing: 1 },
  energyMeta: { color: "#F9FAFB", fontSize: 11, fontWeight: "800", marginTop: 2 },

  helper: { color: "#111827", fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 4 },

  primaryBtn: { backgroundColor: "#111827", borderColor: "#FBBF24", borderWidth: 2, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginBottom: 8 },
  disabledBtn: { backgroundColor: "#6B7280", borderColor: "#9CA3AF" },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },

  secondaryBtn: { backgroundColor: "#FFFFFF", borderColor: "#D1D5DB", borderWidth: 2, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  secondaryBtnText: { color: "#111827", fontWeight: "900", fontSize: 14 },
});