import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type DayPlan = {
  Monday: string;
  Tuesday: string;
  Wednesday: string;
  Thursday: string;
  Friday: string;
  Saturday: string;
  Sunday: string;
};

const DAY_PLAN_KEY = "lit_day_plan";

const EMPTY_PLAN: DayPlan = {
  Monday: "",
  Tuesday: "",
  Wednesday: "",
  Thursday: "",
  Friday: "",
  Saturday: "",
  Sunday: "",
};

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

export default function DayPlanScreen() {
  const [plan, setPlan] = useState<DayPlan>(EMPTY_PLAN);
  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });

  useEffect(() => {
    loadPlan();
  }, []);

  async function loadPlan() {
    const saved = await AsyncStorage.getItem(DAY_PLAN_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    setPlan({
      Monday: parsed.Monday || "",
      Tuesday: parsed.Tuesday || "",
      Wednesday: parsed.Wednesday || "",
      Thursday: parsed.Thursday || "",
      Friday: parsed.Friday || "",
      Saturday: parsed.Saturday || "",
      Sunday: parsed.Sunday || "",
    });
  }

  async function savePlan() {
    await AsyncStorage.setItem(DAY_PLAN_KEY, JSON.stringify(plan));
  }

  function update(day: keyof DayPlan, value: string) {
    setPlan((prev) => ({ ...prev, [day]: value }));
  }

  const today = useMemo(() => getTodayLabel(), []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.contentShell}>
        <View style={styles.headerCard}>
          <Text style={[styles.title, { fontFamily: mono }]}>DAY PLAN</Text>
          <Text style={styles.subtitle}>Set one main role for each day. Keep it simple.</Text>
        </View>

        <View style={styles.previewCard}>
          <Text style={[styles.previewTitle, { fontFamily: mono }]}>THIS WEEK’S ROLES</Text>
          {DAY_ORDER.map((day) => {
            const isToday = day === today;
            return (
              <View key={day} style={[styles.previewRow, isToday && styles.previewRowToday]}>
                <Text style={[styles.previewDay, isToday && styles.previewDayToday]}>{day}</Text>
                <Text style={[styles.previewValue, isToday && styles.previewValueToday]}>
                  {plan[day] ? plan[day] : "No role set"}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          {DAY_ORDER.map((day) => (
            <View key={day}>
              <Text style={styles.label}>{day}</Text>
              <TextInput
                style={styles.input}
                placeholder="Example: coding day"
                placeholderTextColor="#9CA3AF"
                value={plan[day]}
                onChangeText={(v) => update(day, v)}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={savePlan}>
          <Text style={styles.primaryBtnText}>Save Day Plan</Text>
        </TouchableOpacity>

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
  screen: { flex: 1, backgroundColor: "#111827" },
  container: { padding: 14, paddingTop: 42, paddingBottom: 28 },
  contentShell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  headerCard: { backgroundColor: "#0F766E", borderWidth: 3, borderColor: "#14B8A6", borderRadius: 16, padding: 12, marginBottom: 10 },
  title: { color: "#F9FAFB", fontSize: 30, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: "#CCFBF1", fontSize: 12, fontWeight: "700", marginTop: 4 },

  previewCard: { backgroundColor: "#ECFEFF", borderWidth: 2, borderColor: "#67E8F9", borderRadius: 14, padding: 12, marginBottom: 10 },
  previewTitle: { color: "#155E75", fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  previewRow: { flexDirection: "row", justifyContent: "space-between", borderWidth: 1, borderColor: "#A5F3FC", borderRadius: 8, padding: 7, backgroundColor: "#FFFFFF", marginBottom: 6 },
  previewRowToday: { borderColor: "#22C55E", backgroundColor: "#DCFCE7" },
  previewDay: { color: "#111827", fontWeight: "900", fontSize: 12 },
  previewDayToday: { color: "#14532D" },
  previewValue: { color: "#374151", fontWeight: "700", fontSize: 12, marginLeft: 8, flex: 1, textAlign: "right" },
  previewValueToday: { color: "#14532D" },

  card: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#334155", borderRadius: 14, padding: 12, marginBottom: 10 },
  label: { color: "#374151", fontSize: 12, fontWeight: "900", marginTop: 8, marginBottom: 4, textTransform: "uppercase" },
  input: { borderWidth: 2, borderColor: "#D1D5DB", borderRadius: 10, backgroundColor: "#F3F4F6", padding: 10, color: "#111827", fontWeight: "700" },

  primaryBtn: { backgroundColor: "#111827", borderColor: "#14B8A6", borderWidth: 2, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginBottom: 8 },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },

  secondaryBtn: { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", borderWidth: 2, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  secondaryBtnText: { color: "#111827", fontWeight: "900", fontSize: 13 },
});