import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

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

  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });

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
      <View style={styles.contentShell}>
        <View style={styles.headerCard}>
          <Text style={[styles.title, { fontFamily: mono }]}>SLEEP CALENDAR</Text>
          <Text style={styles.subtitle}>
            Use this to plan when to eat, stop caffeine, wind down, and carry tomorrow’s thoughts forward.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={[styles.panelTitle, { fontFamily: mono }]}>TODAY’S SLEEP GUIDE</Text>
          {!latestCheckIn ? (
            <Text style={styles.itemText}>Complete a Morning Check-In to generate today’s sleep guide.</Text>
          ) : (
            <>
              <Text style={styles.itemText}>Caffeine cutoff guide: {latestCheckIn.caffeineCutoffSuggestion || "No guide yet"}</Text>
              <Text style={styles.itemText}>Meal cutoff guide: {latestCheckIn.mealCutoffSuggestion || "No guide yet"}</Text>
              <Text style={styles.itemText}>Wind-down goal: {latestCheckIn.windDownGoal || "No goal set yet"}</Text>
              <Text style={styles.itemText}>Estimated sleep window: {latestCheckIn.estimatedSleepWindow || "No window yet"}</Text>
            </>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={[styles.panelTitle, { fontFamily: mono }]}>TOMORROW’S QUICK THOUGHTS</Text>
          <Text style={styles.smallInfo}>These are already saved for your next planning session.</Text>
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
          <Text style={[styles.panelTitle, { fontFamily: mono }]}>TODAY’S DAY PLAN</Text>
          {todayRole ? (
            <Text style={styles.itemText}>Today is: {todayRole}</Text>
          ) : (
            <Text style={styles.itemText}>No role set for today yet.</Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={[styles.panelTitle, { fontFamily: mono }]}>WEEKLY DAY ROLES</Text>
          {DAY_ORDER.map((day) => (
            <Text key={day} style={styles.itemText}>
              {day}: {dayPlan[day] || "No role set"}
            </Text>
          ))}
        </View>

        <Link href="/day-plan" asChild>
          <TouchableOpacity style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Edit Day Plan</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/" asChild>
          <TouchableOpacity style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Back to Today</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020617" },
  container: { padding: 14, paddingTop: 42, paddingBottom: 28 },
  contentShell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  headerCard: { backgroundColor: "#1E1B4B", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 16, padding: 12, marginBottom: 10 },
  title: { color: "#F9FAFB", fontSize: 30, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: "#DDD6FE", fontSize: 12, fontWeight: "700", marginTop: 4, lineHeight: 18 },

  panel: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#334155", borderRadius: 14, padding: 12, marginBottom: 10 },
  panelTitle: { color: "#111827", fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  itemText: { color: "#111827", fontSize: 12, fontWeight: "700", marginTop: 4, lineHeight: 18 },
  smallInfo: { color: "#4B5563", fontSize: 11, fontWeight: "700", marginBottom: 4 },

  primaryBtn: { backgroundColor: "#312E81", borderColor: "#A78BFA", borderWidth: 2, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginBottom: 8 },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },

  secondaryBtn: { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", borderWidth: 2, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  secondaryBtnText: { color: "#111827", fontWeight: "900", fontSize: 13 },
});