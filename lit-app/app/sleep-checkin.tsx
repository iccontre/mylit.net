import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type CheckIn = {
  id: string;
  hours: string;
  mood: string;
  stress: string;
  energy: number;
  mode: "Recovery" | "Progress";
  createdAt: string;
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

export default function SleepCheckInScreen() {
  const router = useRouter();

  const [hours, setHours] = useState("7");
  const [mood, setMood] = useState("6");
  const [stress, setStress] = useState("3");

  const energy = calculateEnergy(Number(hours), Number(mood), Number(stress));
  const mode = getMode(energy);
  const isRecovery = mode === "Recovery";
  const flameLabel = getFlameLabel(energy);

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function saveCheckIn() {
    const checkIn: CheckIn = {
      id: String(Date.now()),
      hours,
      mood,
      stress,
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
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : styles.progressScreen}
      contentContainerStyle={styles.container}
    >
      <View style={isRecovery ? styles.recoveryHero : styles.progressHero}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.modeIcon}>{isRecovery ? "🌙" : "☀️"}</Text>
            <Text style={styles.heroTitle}>Morning Check-In</Text>
            <Text style={styles.heroSubtitle}>
              {isRecovery ? "Listen before you push." : "Start with intention."}
            </Text>
          </View>

          <View style={isRecovery ? styles.recoveryLunaOrb : styles.progressLunaOrb}>
            <Text style={styles.lunaFace}>{isRecovery ? "😴" : "🙂"}</Text>
          </View>
        </View>

        <Text style={styles.heroBody}>
          Luna uses your sleep, mood, and stress to estimate your Energy Yield for today.
        </Text>
      </View>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>🌙 Luna</Text>
        <Text style={styles.lunaText}>
          This check-in is not a test. It helps lit decide whether today should be
          Recovery or Progress, so your plan fits your real energy.
        </Text>
      </View>

      <View style={styles.inputCard}>
        <Text style={styles.cardLabel}>Today’s Inputs</Text>

        <Text style={styles.label}>Hours slept</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={hours}
          onChangeText={setHours}
        />

        <Text style={styles.helperText}>
          Be honest. Even low sleep helps Luna build a better plan.
        </Text>

        <Text style={styles.label}>Mood today, 1-10</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={mood}
          onChangeText={setMood}
        />

        <Text style={styles.label}>Stress level, 1-10</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={stress}
          onChangeText={setStress}
        />
      </View>

      <View style={isRecovery ? styles.recoveryResultCard : styles.progressResultCard}>
        <View>
          <Text style={styles.resultLabel}>Energy Yield</Text>
          <Text style={styles.energy}>🔥 {energy}/100</Text>
          <Text style={styles.flameLabel}>{flameLabel}</Text>
        </View>

        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>{mode}</Text>
        </View>
      </View>

      <View style={isRecovery ? styles.recoveryMeaningCard : styles.progressMeaningCard}>
        <Text style={styles.meaningTitle}>
          {isRecovery ? "What Recovery means" : "What Progress means"}
        </Text>
        <Text style={styles.meaningText}>
          {isRecovery
            ? "Recovery means your best step today is to protect your energy, reduce shame, and still do one honest thing."
            : "Progress means your energy is available for stronger action toward something that matters to you."}
        </Text>
      </View>

      <TouchableOpacity style={isRecovery ? styles.recoveryButton : styles.progressButton} onPress={saveCheckIn}>
        <Text style={styles.buttonText}>Save Check-In</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
        <Text style={styles.backButtonText}>Back to Today</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  progressScreen: {
    flex: 1,
    backgroundColor: "#F7EBC8",
  },
  recoveryScreen: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  container: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  progressHero: {
    backgroundColor: "#FDE68A",
    borderColor: "#F59E0B",
    borderWidth: 3,
    borderRadius: 34,
    padding: 22,
    marginBottom: 18,
  },
  recoveryHero: {
    backgroundColor: "#1E1B4B",
    borderColor: "#8B5CF6",
    borderWidth: 3,
    borderRadius: 34,
    padding: 22,
    marginBottom: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  modeIcon: {
    fontSize: 40,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroSubtitle: {
    fontSize: 15,
    color: "#F9FAFB",
    fontWeight: "800",
    marginTop: 4,
  },
  heroBody: {
    fontSize: 16,
    lineHeight: 24,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  progressLunaOrb: {
    height: 82,
    width: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    backgroundColor: "#FEF3C7",
    borderColor: "#FBBF24",
  },
  recoveryLunaOrb: {
    height: 82,
    width: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    backgroundColor: "#312E81",
    borderColor: "#C4B5FD",
  },
  lunaFace: {
    fontSize: 40,
  },
  lunaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  lunaName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  lunaText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
    fontWeight: "600",
  },
  inputCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: "#E5D39A",
    marginBottom: 18,
  },
  cardLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 8,
    textTransform: "uppercase",
    fontWeight: "900",
  },
  label: {
    fontSize: 15,
    fontWeight: "900",
    color: "#374151",
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  helperText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#6B7280",
    marginTop: 8,
    fontWeight: "700",
  },
  progressResultCard: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
    borderWidth: 3,
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recoveryResultCard: {
    backgroundColor: "#312E81",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultLabel: {
    color: "#D1D5DB",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  energy: {
    fontSize: 40,
    fontWeight: "900",
    color: "#FBBF24",
  },
  flameLabel: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  modeBadge: {
    backgroundColor: "#374151",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  modeBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  progressMeaningCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#F59E0B",
  },
  recoveryMeaningCard: {
    backgroundColor: "#EEF2FF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  meaningTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  meaningText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
    fontWeight: "600",
  },
  progressButton: {
    backgroundColor: "#111827",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FBBF24",
    marginBottom: 12,
  },
  recoveryButton: {
    backgroundColor: "#312E81",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#A78BFA",
    marginBottom: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  backButton: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  backButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
  },
});