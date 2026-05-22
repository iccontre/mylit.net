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

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function SleepHubScreen() {
  const router = useRouter();
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
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { fontFamily: pixelFont }]}>SLEEP</Text>
          <Text style={styles.heroSubtitle}>Review the signal. Keep one promise.</Text>
        </View>

        <View style={styles.panelDark}>
          <Text style={[styles.panelTitleLight, { fontFamily: pixelFont }]}>LATEST CHECK-IN</Text>
          <Text style={styles.panelTextLight}>Energy: {typeof latestCheckIn?.energy === "number" ? `${latestCheckIn.energy}/100` : "—/100"}</Text>
          <Text style={styles.panelTextLight}>Mode: {latestCheckIn?.mode || "Not set"}</Text>
          <Text style={styles.panelTextLight}>Wake: {latestCheckIn?.wakeTime || "Not set"}</Text>
        </View>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.tile} onPress={() => go("/sleep-checkin")}>
            <Text style={styles.tileTitle}>Morning Check-In</Text>
            <Text style={styles.tileText}>Check sleep, mood, and stress.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => go("/pre-sleep-intention")}>
            <Text style={styles.tileTitle}>Pre-Sleep Intention</Text>
            <Text style={styles.tileText}>Set tonight’s signal.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => go("/morning-intention-reflection")}>
            <Text style={styles.tileTitle}>Morning Reflection</Text>
            <Text style={styles.tileText}>Review last night’s signal.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => go("/sleep-calendar")}>
            <Text style={styles.tileTitle}>Sleep Calendar</Text>
            <Text style={styles.tileText}>Plan timing and tomorrow’s thoughts.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panelLight}>
          <Text style={[styles.panelTitleDark, { fontFamily: pixelFont }]}>SLEEP TIMING</Text>
          <Text style={styles.panelTextDark}>Estimated window: {latestCheckIn?.estimatedSleepWindow || "Not set"}</Text>
          <Text style={styles.panelTextDark}>Caffeine guide: {latestCheckIn?.caffeineCutoffSuggestion || "Not set"}</Text>
          <Text style={styles.panelTextDark}>Meal guide: {latestCheckIn?.mealCutoffSuggestion || "Not set"}</Text>
        </View>

        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/")}><Text style={styles.navText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.navBtn, styles.navBtnActive]} onPress={() => go("/sleep")}><Text style={styles.navTextActive}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/calendar")}><Text style={styles.navText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/mind")}><Text style={styles.navText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/path")}><Text style={styles.navText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/stats")}><Text style={styles.navText}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1024" },
  container: { padding: 14, paddingTop: 34, paddingBottom: 24 },
  shell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  hero: { backgroundColor: "#1E1B4B", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 18, padding: 12, marginBottom: 10 },
  heroTitle: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  heroSubtitle: { color: "#DDD6FE", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panelDark: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 10, marginBottom: 10 },
  panelTitleLight: { color: "#F9FAFB", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  panelTextLight: { color: "#E5E7EB", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panelLight: { backgroundColor: "#EEF2FF", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 12, padding: 10, marginBottom: 10 },
  panelTitleDark: { color: "#111827", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  panelTextDark: { color: "#374151", fontSize: 12, fontWeight: "700", marginTop: 4 },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  tile: { width: "48%", backgroundColor: "#312E81", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 10, padding: 10, marginBottom: 8 },
  tileTitle: { color: "#F9FAFB", fontSize: 12, fontWeight: "900" },
  tileText: { color: "#DDD6FE", fontSize: 10, fontWeight: "700", marginTop: 4 },

  navBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  navBtn: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  navBtnActive: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  navText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  navTextActive: { color: "#111827", fontSize: 10, fontWeight: "900" },
});