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

function getTodayLabel(): keyof DayPlan {
  const map: Array<keyof DayPlan> = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[new Date().getDay()];
}

export default function CalendarHubScreen() {
  const router = useRouter();
  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });

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
      <View style={styles.contentShell}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontFamily: mono }]}>CALENDAR</Text>
          <Text style={styles.subtitle}>Set what the day is for.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={[styles.hudLabel, { fontFamily: mono }]}>TODAY’S DAY PLAN</Text>
          <Text style={styles.bodyText}>{today}: {todayRole}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={[styles.hudLabel, { fontFamily: mono }]}>TOMORROW’S SAVED THOUGHTS</Text>
          {thoughts.length === 0 ? (
            <Text style={styles.bodyText}>No quick thoughts saved yet.</Text>
          ) : (
            thoughts.slice(0, 6).map((item, idx) => {
              const text = item.text || item.title || item.task || item.note || "";
              return (
                <Text key={idx} style={styles.bodyText}>Quick thought: {text}</Text>
              );
            })
          )}
        </View>

        <View style={styles.panel}>
          <Text style={[styles.hudLabel, { fontFamily: mono }]}>WEEKLY DAY ROLES</Text>
          {DAY_ORDER.map((day) => (
            <Text key={day} style={styles.bodyText}>{day}: {dayPlan[day] || "No role set"}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.tile} onPress={() => go("/tomorrow-queue")}>
            <Text style={styles.tileTitle}>Quick Thoughts</Text>
            <Text style={styles.tileSub}>Save the thought.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => go("/day-plan")}>
            <Text style={styles.tileTitle}>Day Plan</Text>
            <Text style={styles.tileSub}>Edit weekly roles.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => go("/sleep-calendar")}>
            <Text style={styles.tileTitle}>Sleep Calendar</Text>
            <Text style={styles.tileSub}>Timing and planning.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/")}><Text style={styles.bottomText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/sleep")}><Text style={styles.bottomText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.bottomItem, styles.active]} onPress={() => go("/calendar")}><Text style={styles.activeText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/mind")}><Text style={styles.bottomText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/path")}><Text style={styles.bottomText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/stats")}><Text style={styles.bottomText}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#052e16" },
  container: { padding: 14, paddingTop: 38, paddingBottom: 24 },
  contentShell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  header: { backgroundColor: "#166534", borderWidth: 3, borderColor: "#22C55E", borderRadius: 16, padding: 12, marginBottom: 10 },
  title: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: "#DCFCE7", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panel: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#334155", borderRadius: 12, padding: 10, marginBottom: 10 },
  hudLabel: { color: "#111827", fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  bodyText: { color: "#374151", fontSize: 12, fontWeight: "700", marginTop: 3 },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  tile: { width: "48%", backgroundColor: "#ECFEFF", borderWidth: 2, borderColor: "#22C55E", borderRadius: 10, padding: 10, marginBottom: 8 },
  tileTitle: { color: "#111827", fontSize: 12, fontWeight: "900" },
  tileSub: { color: "#4B5563", fontSize: 10, fontWeight: "700", marginTop: 4 },

  bottomBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  bottomItem: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  active: { backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#22C55E" },
  bottomText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  activeText: { color: "#111827", fontSize: 10, fontWeight: "900" },
});