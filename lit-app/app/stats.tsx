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

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function StatsHubScreen() {
  const router = useRouter();
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
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { fontFamily: pixelFont }]}>STATS</Text>
          <Text style={styles.heroSubtitle}>Reflect, don’t judge.</Text>
        </View>

        <View style={styles.panelDark}>
          <Text style={[styles.panelTitleLight, { fontFamily: pixelFont }]}>TODAY SUMMARY</Text>
          <Text style={styles.panelTextLight}>Completed quests: {completedCount}</Text>
          <Text style={styles.panelTextLight}>Latest energy: {typeof latestCheckIn?.energy === "number" ? `${latestCheckIn.energy}/100` : "—/100"}</Text>
          <Text style={styles.panelTextLight}>Latest mode: {latestCheckIn?.mode || "Not set"}</Text>
        </View>

        <TouchableOpacity style={styles.actionBtn} onPress={() => go("/weekly-summary")}>
          <Text style={styles.actionText}>Open Weekly Summary</Text>
        </TouchableOpacity>

        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/")}><Text style={styles.navText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/sleep")}><Text style={styles.navText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/calendar")}><Text style={styles.navText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/mind")}><Text style={styles.navText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/path")}><Text style={styles.navText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.navBtn, styles.navBtnActive]} onPress={() => go("/stats")}><Text style={styles.navTextActive}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 34, paddingBottom: 24 },
  shell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  hero: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 18, padding: 12, marginBottom: 10 },
  heroTitle: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  heroSubtitle: { color: "#E5E7EB", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panelDark: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 10, marginBottom: 10 },
  panelTitleLight: { color: "#F9FAFB", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  panelTextLight: { color: "#E5E7EB", fontSize: 12, fontWeight: "700", marginTop: 4 },

  actionBtn: { backgroundColor: "#FBBF24", borderWidth: 2, borderColor: "#92400E", borderRadius: 10, alignItems: "center", paddingVertical: 10, marginBottom: 10 },
  actionText: { color: "#111827", fontSize: 12, fontWeight: "900" },

  navBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  navBtn: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  navBtnActive: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  navText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  navTextActive: { color: "#111827", fontSize: 10, fontWeight: "900" },
});