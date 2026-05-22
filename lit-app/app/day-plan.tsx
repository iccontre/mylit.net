import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

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
      <Text style={styles.title}>Day Plan</Text>
      <Text style={styles.helper}>Set one main role for each day. Keep it simple.</Text>

      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>This Week’s Roles</Text>
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

      <TouchableOpacity style={styles.saveButton} onPress={savePlan}>
        <Text style={styles.saveButtonText}>Save Day Plan</Text>
      </TouchableOpacity>

      <Link href="/" asChild>
        <TouchableOpacity style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to Today</Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFF7ED" },
  container: { padding: 22, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 36, fontWeight: "900", color: "#111827", marginBottom: 6 },
  helper: { color: "#374151", fontWeight: "700", marginBottom: 12 },

  previewCard: {
    backgroundColor: "#FEF3C7",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  previewTitle: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 8 },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 10,
    padding: 8,
    backgroundColor: "#FFFBEB",
    marginBottom: 6,
  },
  previewRowToday: {
    borderColor: "#22C55E",
    backgroundColor: "#DCFCE7",
  },
  previewDay: { color: "#111827", fontWeight: "900" },
  previewDayToday: { color: "#14532D" },
  previewValue: { color: "#374151", fontWeight: "700", flex: 1, textAlign: "right", marginLeft: 8 },
  previewValueToday: { color: "#14532D" },

  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#374151",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "900",
    color: "#374151",
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 12,
    color: "#111827",
    fontWeight: "700",
  },
  saveButton: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  saveButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },
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