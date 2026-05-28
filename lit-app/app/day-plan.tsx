import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type DayPlan = {
  todayGoal?: string;
  Monday?: string;
  Tuesday?: string;
  Wednesday?: string;
  Thursday?: string;
  Friday?: string;
  Saturday?: string;
  Sunday?: string;
};

const DAY_PLAN_KEY = "lit_day_plan";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const weekdays: Array<keyof Omit<DayPlan, "todayGoal">> = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function getWeekdayName(): keyof Omit<DayPlan, "todayGoal"> {
  const days: Array<keyof Omit<DayPlan, "todayGoal">> = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return days[new Date().getDay()];
}

export default function DayPlanScreen() {
  const router = useRouter();
  const todayName = getWeekdayName();

  const [dayPlan, setDayPlan] = useState<DayPlan>({
    todayGoal: "",
    Monday: "",
    Tuesday: "",
    Wednesday: "",
    Thursday: "",
    Friday: "",
    Saturday: "",
    Sunday: "",
  });
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    loadDayPlan();
  }, []);

  async function loadDayPlan() {
    const saved = await AsyncStorage.getItem(DAY_PLAN_KEY);

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);

      setDayPlan({
        todayGoal: parsed.todayGoal || "",
        Monday: parsed.Monday || "",
        Tuesday: parsed.Tuesday || "",
        Wednesday: parsed.Wednesday || "",
        Thursday: parsed.Thursday || "",
        Friday: parsed.Friday || "",
        Saturday: parsed.Saturday || "",
        Sunday: parsed.Sunday || "",
      });
    } catch {
      // Keep defaults if saved data cannot be parsed.
    }
  }

  function updateDayPlan(key: keyof DayPlan, value: string) {
    setSavedMessage("");
    setDayPlan((current) => ({ ...current, [key]: value }));
  }

  async function saveDayPlan() {
    await AsyncStorage.setItem(DAY_PLAN_KEY, JSON.stringify(dayPlan));
    setSavedMessage("Saved. Home and Calendar can use this as quest context.");
  }

  const todayGoal = dayPlan.todayGoal?.trim() || "";
  const todayRole = dayPlan[todayName]?.trim() || "";
  const todayQuest = todayGoal || todayRole;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>DAY BOARD</Text>
          <Text style={styles.title}>DAY PLAN</Text>
          <Text style={styles.subtitle}>Set today’s role or task. Today’s entry becomes a +2 quest.</Text>
        </View>

        <View style={styles.cardGold}>
          <Text style={styles.sectionTitle}>TODAY’S FOCUS</Text>
          <Text style={styles.label}>What do you want to get done today?</Text>
          <TextInput
            style={styles.input}
            value={dayPlan.todayGoal || ""}
            onChangeText={(value) => updateDayPlan("todayGoal", value)}
            placeholder="Example: finish my coding task, catch up on homework, clean my room…"
            placeholderTextColor="#94A3B8"
          />
          <Text style={styles.helperText}>This can become today’s personal quest.</Text>

          <View style={styles.todayQuestBox}>
            <Text style={styles.todayQuestLabel}>Today’s Quest</Text>
            <Text style={styles.todayQuestText}>{todayQuest || "Not set yet"}</Text>
            <Text style={styles.todayQuestSteps}>+2 steps</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>WEEKDAY ROLES</Text>
          <Text style={styles.helperText}>Keep Monday–Sunday roles here. Today’s role is used if Today’s Focus is blank.</Text>

          {weekdays.map((day) => (
            <View key={day} style={styles.dayRow}>
              <Text style={styles.label}>{day}</Text>
              <TextInput
                style={[styles.input, day === todayName && styles.inputActive]}
                value={dayPlan[day] || ""}
                onChangeText={(value) => updateDayPlan(day, value)}
                placeholder={day === todayName ? "Example: Coding day" : "Example: gym day, study day…"}
                placeholderTextColor="#94A3B8"
              />
            </View>
          ))}
        </View>

        {savedMessage ? <Text style={styles.savedMessage}>{savedMessage}</Text> : null}

        <TouchableOpacity style={styles.saveButton} onPress={saveDayPlan}>
          <Text style={styles.saveButtonText}>Save Day Plan</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/calendar")}>
          <Text style={styles.backButtonText}>Back to Calendar</Text>
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
    paddingBottom: 42,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  hero: {
    backgroundColor: "#111827",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  cardGold: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  label: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  helperText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#020617",
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 14,
    color: "#F9FAFB",
    fontSize: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  inputActive: {
    borderColor: "#FBBF24",
  },
  todayQuestBox: {
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
  },
  todayQuestLabel: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  todayQuestText: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  todayQuestSteps: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 5,
  },
  dayRow: {
    marginBottom: 8,
  },
  savedMessage: {
    color: "#86EFAC",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
  },
  saveButton: {
    backgroundColor: "#14532D",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 10,
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  backButton: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#64748B",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
});