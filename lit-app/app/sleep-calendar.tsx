import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type CheckIn = {
  wakeTime?: string;
  estimatedSleepWindow?: string;
  caffeineCutoffSuggestion?: string;
  mealCutoffSuggestion?: string;
  windDownGoal?: string;
};

type QueueItem = {
  text?: string;
  title?: string;
  task?: string;
  note?: string;
};

type DayPlan = {
  Monday: string;
  Tuesday: string;
  Wednesday: string;
  Thursday: string;
  Friday: string;
  Saturday: string;
  Sunday: string;
};

const CHECKIN_KEY = "lit_latest_checkin";
const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";

const DAY_ORDER: Array<keyof DayPlan> = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function getTodayLabel(): keyof DayPlan {
  const map: Array<keyof DayPlan> = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[new Date().getDay()];
}

export default function SleepCalendarScreen() {
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [thoughts, setThoughts] = useState<QueueItem[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan>({
    Monday: "",
    Tuesday: "",
    Wednesday: "",
    Thursday: "",
    Friday: "",
    Saturday: "",
    Sunday: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [checkinSaved, thoughtsSaved, dayPlanSaved] = await Promise.all([
      AsyncStorage.getItem(CHECKIN_KEY),
      AsyncStorage.getItem(TOMORROW_QUEUE_KEY),
      AsyncStorage.getItem(DAY_PLAN_KEY),
    ]);

    if (checkinSaved) setLatestCheckIn(JSON.parse(checkinSaved));

    if (thoughtsSaved) {
      const parsed = JSON.parse(thoughtsSaved);
      setThoughts(Array.isArray(parsed) ? parsed : []);
    }

    if (dayPlanSaved) {
      const parsed = JSON.parse(dayPlanSaved);
      setDayPlan({
        Monday: parsed.Monday || "",
        Tuesday: parsed.Tuesday || "",
        Wednesday: parsed.Wednesday || "",
        Thursday: parsed.Thursday || "",
        Friday: parsed.Friday || "",
        Saturday: parsed.Saturday || "",
        Sunday: parsed.Sunday || "",
      });
    }
  }

  const today = useMemo(() => getTodayLabel(), []);
  const todayRole = dayPlan[today];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Sleep Calendar</Text>
      <Text style={styles.helper}>
        Use this to plan when to eat, stop caffeine, wind down, and carry tomorrow’s thoughts forward.
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Today’s Sleep Guide</Text>
        {!latestCheckIn ? (
          <Text style={styles.itemText}>Complete a Morning Check-In to generate today’s sleep guide.</Text>
        ) : (
          <>
            <Text style={styles.itemText}>
              Caffeine cutoff guide: {latestCheckIn.caffeineCutoffSuggestion || "No guide yet"}
            </Text>
            <Text style={styles.itemText}>
              Meal cutoff guide: {latestCheckIn.mealCutoffSuggestion || "No guide yet"}
            </Text>
            <Text style={styles.itemText}>
              Wind-down goal: {latestCheckIn.windDownGoal || "No goal set yet"}
            </Text>
            <Text style={styles.itemText}>
              Estimated sleep window: {latestCheckIn.estimatedSleepWindow || "No window yet"}
            </Text>
          </>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Tomorrow’s Quick Thoughts</Text>
        <Text style={styles.helper}>These are already saved for your next planning session.</Text>
        {thoughts.length === 0 ? (
          <Text style={styles.itemText}>No Quick Thoughts saved yet.</Text>
        ) : (
          thoughts.map((item, index) => {
            const text = item.text || item.title || item.task || item.note || "";
            return (
              <Text key={index} style={styles.itemText}>
                Quick thought: {text}
              </Text>
            );
          })
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Today’s Day Plan</Text>
        {todayRole ? (
          <Text style={styles.itemText}>Today is: {todayRole}</Text>
        ) : (
          <Text style={styles.itemText}>No role set for today yet.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Weekly Day Roles</Text>
        {DAY_ORDER.map((day) => (
          <Text key={day} style={styles.itemText}>
            {day}: {dayPlan[day] || "No role set"}
          </Text>
        ))}
      </View>

      <Link href="/day-plan" asChild>
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Edit Day Plan</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/" asChild>
        <TouchableOpacity style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to Today</Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#EEF2FF" },
  container: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 36, fontWeight: "900", color: "#111827", marginBottom: 6 },
  helper: { color: "#374151", fontSize: 13, fontWeight: "700", lineHeight: 18, marginBottom: 8 },

  panel: {
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  panelTitle: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 8 },
  itemText: { color: "#111827", fontWeight: "700", marginTop: 4, lineHeight: 20 },

  primaryButton: {
    backgroundColor: "#312E81",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },

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