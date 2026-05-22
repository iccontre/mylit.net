import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

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

const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";
const DAY_ORDER: Array<keyof DayPlan> = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function getTodayLabel(): keyof DayPlan {
  const map: Array<keyof DayPlan> = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[new Date().getDay()];
}

export default function CalendarHubScreen() {
  const router = useRouter();
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
    const [thoughtsSaved, dayPlanSaved] = await Promise.all([
      AsyncStorage.getItem(TOMORROW_QUEUE_KEY),
      AsyncStorage.getItem(DAY_PLAN_KEY),
    ]);

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
  const todayRole = dayPlan[today] || "No role set";

  function go(path: string) {
    router.push(path as any);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { fontFamily: pixelFont }]}>CALENDAR</Text>
          <Text style={styles.heroSubtitle}>Set what the day is for.</Text>
        </View>

        <View style={styles.panelLight}>
          <Text style={[styles.panelTitleDark, { fontFamily: pixelFont }]}>TODAY’S DAY PLAN</Text>
          <Text style={styles.panelTextDark}>{today}: {todayRole}</Text>
        </View>

        <View style={styles.panelLight}>
          <Text style={[styles.panelTitleDark, { fontFamily: pixelFont }]}>TOMORROW’S QUICK THOUGHTS</Text>
          {thoughts.length === 0 ? (
            <Text style={styles.panelTextDark}>No quick thoughts saved yet.</Text>
          ) : (
            thoughts.slice(0, 6).map((item, idx) => {
              const text = item.text || item.title || item.task || item.note || "";
              return (
                <Text key={idx} style={styles.panelTextDark}>Quick thought: {text}</Text>
              );
            })
          )}
        </View>

        <View style={styles.panelDark}>
          <Text style={[styles.panelTitleLight, { fontFamily: pixelFont }]}>WEEKLY DAY ROLES</Text>
          {DAY_ORDER.map((day) => (
            <Text key={day} style={styles.panelTextLight}>{day}: {dayPlan[day] || "No role set"}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.tile} onPress={() => go("/tomorrow-queue")}>
            <Text style={styles.tileTitle}>Quick Thoughts</Text>
            <Text style={styles.tileText}>Save the thought.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => go("/day-plan")}>
            <Text style={styles.tileTitle}>Day Plan</Text>
            <Text style={styles.tileText}>Edit weekly roles.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => go("/sleep-calendar")}>
            <Text style={styles.tileTitle}>Sleep Calendar</Text>
            <Text style={styles.tileText}>Timing and planning board.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/")}><Text style={styles.navText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/sleep")}><Text style={styles.navText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.navBtn, styles.navBtnActive]} onPress={() => go("/calendar")}><Text style={styles.navTextActive}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/mind")}><Text style={styles.navText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/path")}><Text style={styles.navText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/stats")}><Text style={styles.navText}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#052e16" },
  container: { padding: 14, paddingTop: 34, paddingBottom: 24 },
  shell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  hero: { backgroundColor: "#166534", borderWidth: 3, borderColor: "#22C55E", borderRadius: 18, padding: 12, marginBottom: 10 },
  heroTitle: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  heroSubtitle: { color: "#DCFCE7", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panelLight: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#334155", borderRadius: 12, padding: 10, marginBottom: 10 },
  panelTitleDark: { color: "#111827", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  panelTextDark: { color: "#374151", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panelDark: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#22C55E", borderRadius: 12, padding: 10, marginBottom: 10 },
  panelTitleLight: { color: "#F9FAFB", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  panelTextLight: { color: "#E5E7EB", fontSize: 12, fontWeight: "700", marginTop: 4 },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  tile: { width: "48%", backgroundColor: "#ECFEFF", borderWidth: 2, borderColor: "#22C55E", borderRadius: 10, padding: 10, marginBottom: 8 },
  tileTitle: { color: "#111827", fontSize: 12, fontWeight: "900" },
  tileText: { color: "#4B5563", fontSize: 10, fontWeight: "700", marginTop: 4 },

  navBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  navBtn: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  navBtnActive: { backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#22C55E" },
  navText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  navTextActive: { color: "#111827", fontSize: 10, fontWeight: "900" },
});