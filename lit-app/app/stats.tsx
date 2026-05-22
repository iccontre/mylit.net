import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type CheckIn = {
  energy?: number;
  mode?: "Recovery" | "Progress";
};

const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const CHECKIN_KEY = "lit_latest_checkin";

export default function StatsHubScreen() {
  const router = useRouter();
  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });

  const [completedCount, setCompletedCount] = useState(0);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [completedSaved, checkinSaved] = await Promise.all([
      AsyncStorage.getItem(COMPLETED_QUESTS_KEY),
      AsyncStorage.getItem(CHECKIN_KEY),
    ]);

    if (completedSaved) {
      const parsed = JSON.parse(completedSaved);
      setCompletedCount(Array.isArray(parsed) ? parsed.length : 0);
    }

    if (checkinSaved) {
      setLatestCheckIn(JSON.parse(checkinSaved));
    }
  }

  function go(path: string) {
    router.push(path as any);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.contentShell}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontFamily: mono }]}>STATS</Text>
          <Text style={styles.subtitle}>Reflect, don’t judge.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={[styles.hudLabel, { fontFamily: mono }]}>TODAY</Text>
          <Text style={styles.bodyText}>Completed quests: {completedCount}</Text>
          <Text style={styles.bodyText}>
            Latest energy: {typeof latestCheckIn?.energy === "number" ? `${latestCheckIn.energy}/100` : "—/100"}
          </Text>
          <Text style={styles.bodyText}>Latest mode: {latestCheckIn?.mode || "Not set"}</Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => go("/weekly-summary")}>
          <Text style={styles.primaryBtnText}>Open Weekly Summary</Text>
        </TouchableOpacity>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/")}><Text style={styles.bottomText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/sleep")}><Text style={styles.bottomText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/calendar")}><Text style={styles.bottomText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/mind")}><Text style={styles.bottomText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/path")}><Text style={styles.bottomText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.bottomItem, styles.active]} onPress={() => go("/stats")}><Text style={styles.activeText}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 38, paddingBottom: 24 },
  contentShell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  header: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 16, padding: 12, marginBottom: 10 },
  title: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: "#D1D5DB", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panel: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#334155", borderRadius: 12, padding: 10, marginBottom: 10 },
  hudLabel: { color: "#111827", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  bodyText: { color: "#374151", fontSize: 12, fontWeight: "700", marginTop: 4 },

  primaryBtn: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginBottom: 10 },
  primaryBtnText: { color: "#F9FAFB", fontSize: 12, fontWeight: "900" },

  bottomBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  bottomItem: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  active: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  bottomText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  activeText: { color: "#111827", fontSize: 10, fontWeight: "900" },
});