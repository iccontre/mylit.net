import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type QueueItem = {
  text: string;
  type: string;
};

type DayPlan = {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
};

const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const weekdayKeys: Array<keyof DayPlan> = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const weekdayLabels: Record<keyof DayPlan, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export default function CalendarScreen() {
  const router = useRouter();
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);

  useEffect(() => {
    loadCalendarData();
  }, []);

  async function loadCalendarData() {
    const savedQueue = await AsyncStorage.getItem(TOMORROW_QUEUE_KEY);
    const savedPlan = await AsyncStorage.getItem(DAY_PLAN_KEY);

    if (savedQueue) {
      setQueueItems(JSON.parse(savedQueue));
    }

    if (savedPlan) {
      setDayPlan(JSON.parse(savedPlan));
    }
  }

  const todayKey = useMemo(() => weekdayKeys[new Date().getDay()], []);
  const todayRole = dayPlan?.[todayKey]?.trim() || "Not set yet";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>SCHEDULE BOARD</Text>
          <Text style={styles.title}>CALENDAR</Text>
          <Text style={styles.subtitle}>Plan your days. Keep your next move visible.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>TODAY’S DAY PLAN</Text>
          <Text style={styles.cardMain}>{todayRole}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>TOMORROW’S SAVED THOUGHTS</Text>
          {queueItems.length === 0 ? (
            <Text style={styles.cardText}>No quick thoughts saved yet.</Text>
          ) : (
            queueItems.slice(0, 4).map((item, index) => (
              <Text key={`${item.text}-${index}`} style={styles.listItem}>
                • {item.text}
              </Text>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>WEEKLY DAY ROLES</Text>
          {weekdayKeys.map((key) => (
            <View key={key} style={styles.roleRow}>
              <Text style={styles.roleDay}>{weekdayLabels[key]}</Text>
              <Text style={styles.roleValue}>{dayPlan?.[key]?.trim() || "Not set"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/tomorrow-queue")}>
            <Text style={styles.actionText}>Quick Thoughts</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/day-plan")}>
            <Text style={styles.actionText}>Day Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/sleep-calendar")}>
            <Text style={styles.actionText}>Sleep Calendar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}>
              <Text style={styles.navText}>🏠 Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/sleep")}>
              <Text style={styles.navText}>🌙 Sleep</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={() => router.push("/calendar")}>
              <Text style={[styles.navText, styles.navTextActive]}>📅 Calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/mind")}>
              <Text style={styles.navText}>🧠 Mind</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/path")}>
              <Text style={styles.navText}>🧭 Path</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/stats")}>
              <Text style={styles.navText}>📊 Stats</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    borderColor: "#22C55E",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "800",
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
  card: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardLabel: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  cardMain: {
    color: "#F9FAFB",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  cardText: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
  },
  listItem: {
    color: "#E2E8F0",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  roleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  roleDay: {
    color: "#E2E8F0",
    fontSize: 13,
    fontFamily: pixelFont,
    fontWeight: "700",
  },
  roleValue: {
    color: "#CBD5E1",
    fontSize: 13,
    maxWidth: "58%",
    textAlign: "right",
  },
  quickActions: {
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  actionText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  bottomNav: {
    backgroundColor: "#0F172A",
    borderWidth: 3,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 12,
    marginTop: 6,
  },
  bottomTitle: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  navButton: {
    width: "48.5%",
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  navButtonActive: {
    backgroundColor: "#14532D",
    borderColor: "#FBBF24",
  },
  navText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  navTextActive: {
    color: "#FDE68A",
  },
});