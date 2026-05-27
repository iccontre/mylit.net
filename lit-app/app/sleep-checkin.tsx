import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMemo, useState } from "react";

type CheckIn = {
  id: string;
  hours: string;
  mood: string;
  stress: string;
  sleepQuality: string;
  energy: number;
  mode: "Recovery" | "Progress";
  wakeTime?: string;
  caffeineAmount?: string;
  lastCaffeineTime?: string;
  lastMealTime?: string;
  mealHeaviness?: string;
  windDownGoal?: string;
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

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getHoursScore(hours: number) {
  if (hours >= 8) return 95;
  if (hours >= 7) return 85;
  if (hours >= 6) return 70;
  if (hours >= 5) return 55;
  return 35;
}

function calculateEnergy(hours: number, mood: number, stress: number, sleepQuality: number) {
  const hoursScore = getHoursScore(hours);
  const moodScore = clamp(mood * 10);
  const stressScore = clamp((10 - stress) * 10);
  const sleepQualityScore = clamp(sleepQuality * 10);

  const raw =
    hoursScore * 0.35 +
    sleepQualityScore * 0.3 +
    moodScore * 0.2 +
    stressScore * 0.15;

  return clamp(Math.round(raw));
}

function getMode(score: number): "Recovery" | "Progress" {
  return score >= 60 ? "Progress" : "Recovery";
}

function getFlameLabel(mode: "Recovery" | "Progress" | "Neutral") {
  if (mode === "Neutral") return "No reading yet";
  if (mode === "Recovery") return "Steady Flame";
  return "Active Flame";
}

export default function SleepCheckInScreen() {
  const router = useRouter();

  const [hours, setHours] = useState("");
  const [mood, setMood] = useState("");
  const [stress, setStress] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");

  const [wakeTime, setWakeTime] = useState("");
  const [caffeineAmount, setCaffeineAmount] = useState("");
  const [lastCaffeineTime, setLastCaffeineTime] = useState("");
  const [lastMealTime, setLastMealTime] = useState("");
  const [mealHeaviness, setMealHeaviness] = useState("");
  const [windDownGoal, setWindDownGoal] = useState("");

  const parsed = useMemo(
    () => ({
      h: Number(hours),
      m: Number(mood),
      s: Number(stress),
      q: Number(sleepQuality),
    }),
    [hours, mood, stress, sleepQuality]
  );

  const hasRequired =
    hours.trim() !== "" &&
    mood.trim() !== "" &&
    stress.trim() !== "" &&
    sleepQuality.trim() !== "" &&
    !Number.isNaN(parsed.h) &&
    !Number.isNaN(parsed.m) &&
    !Number.isNaN(parsed.s) &&
    !Number.isNaN(parsed.q);

  const energy = hasRequired ? calculateEnergy(parsed.h, parsed.m, parsed.s, parsed.q) : 0;
  const mode = hasRequired ? getMode(energy) : "Recovery";
  const isRecovery = mode === "Recovery";

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }

  async function saveCheckIn() {
    if (!hasRequired) return;

    const checkIn: CheckIn = {
      id: String(Date.now()),
      hours: hours.trim(),
      mood: mood.trim(),
      stress: stress.trim(),
      sleepQuality: sleepQuality.trim(),
      energy,
      mode,
      wakeTime: wakeTime.trim(),
      caffeineAmount: caffeineAmount.trim(),
      lastCaffeineTime: lastCaffeineTime.trim(),
      lastMealTime: lastMealTime.trim(),
      mealHeaviness: mealHeaviness.trim(),
      windDownGoal: windDownGoal.trim(),
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
      params: { energy: String(energy), mode },
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={[styles.hero, isRecovery ? styles.heroRecovery : styles.heroProgress]}>
          <Text style={styles.heroLabel}>MORNING SCAN</Text>
          <Text style={styles.title}>MORNING CHECK-IN</Text>
          <Text style={styles.subtitle}>
            {hasRequired
              ? isRecovery
                ? "Recovery day. Keep it steady."
                : "Progress day. Move with intention."
              : "Enter sleep, mood, stress, and quality."}
          </Text>
        </View>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaTitle}>Luna</Text>
          <Text style={styles.lunaText}>
            Check your signal honestly. This helps shape a fair plan for today.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Hours slept</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Example: 7.5"
            placeholderTextColor="#94A3B8"
            value={hours}
            onChangeText={setHours}
          />

          <Text style={styles.label}>Mood today, 1–10</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Example: 6"
            placeholderTextColor="#94A3B8"
            value={mood}
            onChangeText={setMood}
          />

          <Text style={styles.label}>Stress level, 1–10</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Example: 4"
            placeholderTextColor="#94A3B8"
            value={stress}
            onChangeText={setStress}
          />

          <Text style={styles.label}>Sleep Quality, 1–10</Text>
          <Text style={styles.helper}>
            Rate how restored your sleep felt, even if the number of hours looked okay.
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Example: 7"
            placeholderTextColor="#94A3B8"
            value={sleepQuality}
            onChangeText={setSleepQuality}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHead}>Optional sleep details</Text>

          <Text style={styles.label}>Wake time</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: 7:30 AM"
            placeholderTextColor="#94A3B8"
            value={wakeTime}
            onChangeText={setWakeTime}
          />

          <Text style={styles.label}>Caffeine amount</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: 1 coffee"
            placeholderTextColor="#94A3B8"
            value={caffeineAmount}
            onChangeText={setCaffeineAmount}
          />

          <Text style={styles.label}>Last caffeine time</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: 2:00 PM"
            placeholderTextColor="#94A3B8"
            value={lastCaffeineTime}
            onChangeText={setLastCaffeineTime}
          />

          <Text style={styles.label}>Last meal time</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: 8:30 PM"
            placeholderTextColor="#94A3B8"
            value={lastMealTime}
            onChangeText={setLastMealTime}
          />

          <Text style={styles.label}>Meal heaviness</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: light / medium / heavy"
            placeholderTextColor="#94A3B8"
            value={mealHeaviness}
            onChangeText={setMealHeaviness}
          />

          <Text style={styles.label}>Wind-down goal</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: no phone after 11"
            placeholderTextColor="#94A3B8"
            value={windDownGoal}
            onChangeText={setWindDownGoal}
          />
        </View>

        <View style={[styles.energyCard, isRecovery ? styles.energyRecovery : styles.energyProgress]}>
          <Text style={styles.energyTitle}>ENERGY RESERVE</Text>
          <Text style={styles.energyScore}>{hasRequired ? `${energy}/100` : "—/100"}</Text>
          <Text style={styles.energyMode}>{hasRequired ? mode : "CHECK-IN NEEDED"}</Text>
          <Text style={styles.energyFlame}>{getFlameLabel(hasRequired ? mode : "Neutral")}</Text>
          <Text style={styles.energySummary}>
            Sleep: {hours || "—"}h • Quality: {sleepQuality || "—"}/10 • Mood: {mood || "—"}/10 • Stress: {stress || "—"}/10
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, !hasRequired && styles.disabledButton]}
          onPress={saveCheckIn}
        >
          <Text style={styles.saveButtonText}>
            {hasRequired ? "Save Check-In" : "Enter Required Values"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/sleep")}>
          <Text style={styles.backButtonText}>Back to Sleep</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },
  container: { paddingTop: 30, paddingBottom: 40 },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },

  hero: {
    borderWidth: 3,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  heroProgress: {
    backgroundColor: "#2A1F0F",
    borderColor: "#FBBF24",
  },
  heroRecovery: {
    backgroundColor: "#1E1B4B",
    borderColor: "#A78BFA",
  },
  heroLabel: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  title: {
    color: "#F9FAFB",
    fontSize: 28,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  subtitle: {
    color: "#E2E8F0",
    fontSize: 13,
    lineHeight: 19,
    fontFamily: pixelFont,
  },

  lunaCard: {
    backgroundColor: "#111827",
    borderColor: "#334155",
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  lunaTitle: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  lunaText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
  },

  card: {
    backgroundColor: "#111827",
    borderColor: "#334155",
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardHead: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  label: {
    color: "#F9FAFB",
    fontSize: 12,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  helper: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#020617",
    color: "#F9FAFB",
    borderColor: "#475569",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: pixelFont,
  },

  energyCard: {
    borderWidth: 3,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  energyProgress: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
  },
  energyRecovery: {
    backgroundColor: "#1E1B4B",
    borderColor: "#A78BFA",
  },
  energyTitle: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  energyScore: {
    color: "#F9FAFB",
    fontSize: 34,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  energyMode: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginTop: 4,
  },
  energyFlame: {
    color: "#CBD5E1",
    fontSize: 12,
    fontFamily: pixelFont,
    marginTop: 2,
    marginBottom: 8,
  },
  energySummary: {
    color: "#E2E8F0",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: pixelFont,
  },

  saveButton: {
    backgroundColor: "#166534",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  disabledButton: {
    backgroundColor: "#334155",
    borderColor: "#64748B",
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
    letterSpacing: 0.5,
  },

  backButton: {
    backgroundColor: "#111827",
    borderColor: "#64748B",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});