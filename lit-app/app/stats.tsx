import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type CheckIn = {
  id?: string;
  hours: string;
  mood: string;
  stress: string;
  energy: number;
  mode: "Recovery" | "Progress";
  createdAt: string;
};

const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const CHECKIN_KEY = "lit_latest_checkin";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

type NavItem = {
  label: string;
  icon: string;
  route: "/" | "/sleep" | "/calendar" | "/mind" | "/path" | "/stats";
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: "🏠", route: "/" },
  { label: "Sleep", icon: "🌙", route: "/sleep" },
  { label: "Calendar", icon: "📅", route: "/calendar" },
  { label: "Mind", icon: "🧠", route: "/mind" },
  { label: "Path", icon: "🧭", route: "/path" },
  { label: "Stats", icon: "📊", route: "/stats" },
];

export default function StatsScreen() {
  const router = useRouter();

  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const savedCompleted = await AsyncStorage.getItem(COMPLETED_QUESTS_KEY);
    const savedCheckIn = await AsyncStorage.getItem(CHECKIN_KEY);

    if (savedCompleted) {
      setCompletedQuests(JSON.parse(savedCompleted));
    }

    if (savedCheckIn) {
      setLatestCheckIn(JSON.parse(savedCheckIn));
    }
  }

  const completedCount = completedQuests.length;
  const latestEnergy = latestCheckIn?.energy ?? null;
  const latestMode = latestCheckIn?.mode ?? "Not set yet";

  const summaryLine = useMemo(() => {
    if (latestCheckIn?.mode === "Recovery") {
      return "You logged Recovery mode. Small steps still count.";
    }

    if (latestCheckIn?.mode === "Progress") {
      return "You logged Progress mode. Use your available energy well.";
    }

    return "No check-in yet. Start with one honest signal.";
  }, [latestCheckIn]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>STATS BOARD</Text>
          <Text style={styles.title}>STATS</Text>
          <Text style={styles.subtitle}>Track what happened. Keep the signal clear.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>TODAY SUMMARY</Text>
          <Text style={styles.summaryText}>{summaryLine}</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <Text style={styles.statNumber}>{completedCount}</Text>
            <Text style={styles.statLabel}>Completed Quests</Text>
          </View>

          <View style={styles.statTile}>
            <Text style={styles.statNumber}>{latestEnergy !== null ? `${latestEnergy}/100` : "—/100"}</Text>
            <Text style={styles.statLabel}>Latest Energy</Text>
          </View>

          <View style={styles.statTile}>
            <Text style={styles.statNumber}>{latestMode}</Text>
            <Text style={styles.statLabel}>Latest Mode</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.weeklyButton} onPress={() => router.push("/weekly-summary")}>
          <Text style={styles.weeklyButtonText}>Weekly Summary</Text>
        </TouchableOpacity>

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            {NAV_ITEMS.map((item) => {
              const isActive = item.route === "/stats";
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.navButton, isActive && styles.navButtonActive]}
                  onPress={() => router.push(item.route)}
                >
                  <Text style={[styles.navText, isActive && styles.navTextActive]}>
                    {item.icon} {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
    borderColor: "#FBBF24",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: "#FDE68A",
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
  summaryText: {
    color: "#E2E8F0",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  statsGrid: {
    marginBottom: 12,
  },
  statTile: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },
  statNumber: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 4,
  },
  statLabel: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "700",
  },
  weeklyButton: {
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 12,
    alignItems: "center",
  },
  weeklyButtonText: {
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
    backgroundColor: "#78350F",
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