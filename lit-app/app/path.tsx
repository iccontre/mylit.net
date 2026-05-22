import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type UserProfile = {
  longTermDream?: string;
  dreamCategory?: string;
  progressMeaning?: string;
  goalOne?: string;
  goalTwo?: string;
  goalThree?: string;
};

const PROFILE_KEY = "lit_user_profile";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function PathHubScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const saved = await AsyncStorage.getItem(PROFILE_KEY);
    if (saved) setProfile(JSON.parse(saved));
  }

  function go(path: string) {
    router.push(path as any);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { fontFamily: pixelFont }]}>PATH</Text>
          <Text style={styles.heroSubtitle}>Follow the path. Small steps count.</Text>
        </View>

        <View style={styles.panelLight}>
          <Text style={[styles.panelTitleDark, { fontFamily: pixelFont }]}>LONG-TERM DREAM</Text>
          <Text style={styles.panelTextDark}>{profile?.longTermDream || "No dream set yet."}</Text>
        </View>

        <View style={styles.panelLight}>
          <Text style={[styles.panelTitleDark, { fontFamily: pixelFont }]}>CATEGORY</Text>
          <Text style={styles.panelTextDark}>{profile?.dreamCategory || "No category set yet."}</Text>
        </View>

        <View style={styles.panelDark}>
          <Text style={[styles.panelTitleLight, { fontFamily: pixelFont }]}>TOP GOALS</Text>
          <Text style={styles.panelTextLight}>1. {profile?.goalOne || "No goal set"}</Text>
          <Text style={styles.panelTextLight}>2. {profile?.goalTwo || "No goal set"}</Text>
          <Text style={styles.panelTextLight}>3. {profile?.goalThree || "No goal set"}</Text>
        </View>

        <View style={styles.panelLight}>
          <Text style={[styles.panelTitleDark, { fontFamily: pixelFont }]}>PROGRESS MEANING</Text>
          <Text style={styles.panelTextDark}>{profile?.progressMeaning || "Not set yet."}</Text>
        </View>

        <TouchableOpacity style={styles.actionBtn} onPress={() => go("/onboarding")}>
          <Text style={styles.actionText}>Set My Path</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => go("/next-chapter")}>
          <Text style={styles.actionText}>Set Your Next Long-Term Goal</Text>
        </TouchableOpacity>

        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/")}><Text style={styles.navText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/sleep")}><Text style={styles.navText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/calendar")}><Text style={styles.navText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/mind")}><Text style={styles.navText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.navBtn, styles.navBtnActive]} onPress={() => go("/path")}><Text style={styles.navTextActive}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/stats")}><Text style={styles.navText}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 34, paddingBottom: 24 },
  shell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  hero: { backgroundColor: "#14532D", borderWidth: 3, borderColor: "#22C55E", borderRadius: 18, padding: 12, marginBottom: 10 },
  heroTitle: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  heroSubtitle: { color: "#DCFCE7", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panelLight: { backgroundColor: "#FEF3C7", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 12, padding: 10, marginBottom: 10 },
  panelTitleDark: { color: "#111827", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  panelTextDark: { color: "#374151", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panelDark: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#22C55E", borderRadius: 12, padding: 10, marginBottom: 10 },
  panelTitleLight: { color: "#F9FAFB", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  panelTextLight: { color: "#E5E7EB", fontSize: 12, fontWeight: "700", marginTop: 4 },

  actionBtn: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 10, alignItems: "center", paddingVertical: 10, marginBottom: 8 },
  actionText: { color: "#F9FAFB", fontSize: 12, fontWeight: "900" },

  navBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  navBtn: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  navBtnActive: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  navText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  navTextActive: { color: "#111827", fontSize: 10, fontWeight: "900" },
});