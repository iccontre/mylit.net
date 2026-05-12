import AsyncStorage from "@react-native-async-storage/async-storage";
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

export default function SleepCheckInScreen() {
  const router = useRouter();

  const [hours, setHours] = useState("7");
  const [mood, setMood] = useState("6");
  const [stress, setStress] = useState("3");

  const energy = calculateEnergy(Number(hours), Number(mood), Number(stress));
  const mode = getMode(energy);

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
      <Text style={styles.title}>Morning Check-In</Text>
      <Text style={styles.subtitle}>
        Tell Luna how you’re starting today. This helps lit decide between Recovery and Progress.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Hours slept</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={hours}
          onChangeText={setHours}
        />

        <Text style={styles.label}>Mood today (1-10)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={mood}
          onChangeText={setMood}
        />

        <Text style={styles.label}>Stress level (1-10)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={stress}
          onChangeText={setStress}
        />
      </View>

      <View style={mode === "Recovery" ? styles.recoveryResultCard : styles.progressResultCard}>
        <Text style={styles.resultLabel}>Energy Yield</Text>
        <Text style={styles.energy}>🔥 {energy}/100</Text>
        <Text style={styles.mode}>{mode}</Text>
        <Text style={styles.message}>
          {mode === "Recovery"
            ? "Today is for restoring energy and taking one honest step."
            : "Today is a good day to move toward something that matters."}
        </Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={saveCheckIn}>
        <Text style={styles.buttonText}>Save Check-In</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7EBC8",
  },
  container: {
    padding: 24,
    paddingTop: 70,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: "#6B7280",
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: "#E5D39A",
    marginBottom: 18,
  },
  label: {
    fontSize: 15,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    fontSize: 18,
    fontWeight: "700",
  },
  progressResultCard: {
    borderRadius: 24,
    padding: 22,
    marginBottom: 20,
    backgroundColor: "#1F2937",
  },
  recoveryResultCard: {
    borderRadius: 24,
    padding: 22,
    marginBottom: 20,
    backgroundColor: "#312E81",
  },
  resultLabel: {
    color: "#D1D5DB",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  energy: {
    fontSize: 40,
    fontWeight: "900",
    color: "#FBBF24",
  },
  mode: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    marginTop: 4,
  },
  message: {
    fontSize: 16,
    lineHeight: 23,
    color: "#E5E7EB",
    marginTop: 10,
  },
  button: {
    backgroundColor: "#111827",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
});