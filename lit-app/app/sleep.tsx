import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type CheckIn = {
  energy?: number;
  mode?: "Recovery" | "Progress";
  wakeTime?: string;
  estimatedSleepWindow?: string;
  caffeineCutoffSuggestion?: string;
  mealCutoffSuggestion?: string;
};

const CHECKIN_KEY = "lit_latest_checkin";

export default function SleepHubScreen() {
  const router = useRouter();
  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);

  useEffect(() => {
    loadCheckIn();
  }, []);

  async function loadCheckIn() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);
    if (saved) setLatestCheckIn(JSON.parse(saved));
  }

  function go(path: string) {
    router.push(path as any);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.contentShell}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontFamily: mono }]}>SLEEP</Text>
          <Text style={styles.subtitle}>Check your energy. Keep one promise.</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={[styles.hudLabel, { fontFamily: mono }]}>LATEST CHECK-IN</Text>
          <Text style={styles.summaryText}>Energy: {typeof latestCheckIn?.energy === "number" ? `${latestCheckIn.energy}/100` : "—/100"}</Text>
          <Text style={styles.summaryText}>Mode: {latestCheckIn?.mode || "Not set"}</Text>
          <Text style={styles.summaryText}>Sleep window: {latestCheckIn?.estimatedSleepWindow || "Not set"}</Text>
        </View>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.tile} onPress={() => go("/sleep-checkin")}>
            <Text style={styles.tileTitle}>Morning Check-In</Text>
            <Text style={styles.tileSub}>Check sleep, mood, and stress.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tile} onPress={() => go("/pre-sleep-intention")}>
            <Text style={styles.tileTitle}>Pre-Sleep Intention</Text>
            <Text style={styles.tileSub}>Set tonight’s signal.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tile} onPress={() => go("/morning-intention-reflection")}>
            <Text style={styles.tileTitle}>Morning Reflection</Text>
            <Text style={styles.tileSub}>Review last night’s intention.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tile} onPress={() => go("/sleep-calendar")}>
            <Text style={styles.tileTitle}>Sleep Calendar</Text>
            <Text style={styles.tileSub}>Plan caffeine, meals, and wind-down.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.timingCard}>
          <Text style={[styles.hudLabel, { fontFamily: mono }]}>SLEEP TIMING</Text>
          <Text style={styles.summaryText}>Wake: {latestCheckIn?.wakeTime || "Not set"}</Text>
          <Text style={styles.summaryText}>Caffeine guide: {latestCheckIn?.caffeineCutoffSuggestion || "Not set"}</Text>
          <Text style={styles.summaryText}>Meal guide: {latestCheckIn?.mealCutoffSuggestion || "Not set"}</Text>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/")}><Text style={styles.bottomText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.bottomItem, styles.active]} onPress={() => go("/sleep")}><Text style={styles.activeText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/calendar")}><Text style={styles.bottomText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/mind")}><Text style={styles.bottomText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/path")}><Text style={styles.bottomText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/stats")}><Text style={styles.bottomText}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1024" },
  container: { padding: 14, paddingTop: 38, paddingBottom: 24 },
  contentShell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  header: { backgroundColor: "#1E1B4B", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 16, padding: 12, marginBottom: 10 },
  title: { fontSize: 34, fontWeight: "900", letterSpacing: 1, color: "#F9FAFB" },
  subtitle: { color: "#DDD6FE", fontSize: 12, fontWeight: "700", marginTop: 4 },

  summaryCard: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 10, marginBottom: 10 },
  hudLabel: { color: "#F9FAFB", fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  summaryText: { color: "#E5E7EB", fontSize: 12, fontWeight: "700", marginTop: 3 },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  tile: { width: "48%", backgroundColor: "#EEF2FF", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 10, padding: 10, marginBottom: 8 },
  tileTitle: { color: "#111827", fontSize: 12, fontWeight: "900" },
  tileSub: { color: "#374151", fontSize: 10, fontWeight: "700", marginTop: 4 },

  timingCard: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 10, marginBottom: 10 },

  bottomBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  bottomItem: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  active: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  bottomText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  activeText: { color: "#111827", fontSize: 10, fontWeight: "900" },
});