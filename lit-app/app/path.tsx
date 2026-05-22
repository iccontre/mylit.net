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

export default function PathHubScreen() {
  const router = useRouter();
  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });
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
      <View style={styles.contentShell}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontFamily: mono }]}>PATH</Text>
          <Text style={styles.subtitle}>Follow the path. Small steps count.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={[styles.hudLabel, { fontFamily: mono }]}>LONG-TERM DREAM</Text>
          <Text style={styles.bodyText}>{profile?.longTermDream || "No dream set yet."}</Text>
          <Text style={[styles.hudLabel, { fontFamily: mono, marginTop: 8 }]}>CATEGORY</Text>
          <Text style={styles.bodyText}>{profile?.dreamCategory || "No category set yet."}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={[styles.hudLabel, { fontFamily: mono }]}>TOP GOALS</Text>
          <Text style={styles.bodyText}>1. {profile?.goalOne || "No goal set"}</Text>
          <Text style={styles.bodyText}>2. {profile?.goalTwo || "No goal set"}</Text>
          <Text style={styles.bodyText}>3. {profile?.goalThree || "No goal set"}</Text>
          <Text style={[styles.hudLabel, { fontFamily: mono, marginTop: 8 }]}>PROGRESS MEANING</Text>
          <Text style={styles.bodyText}>{profile?.progressMeaning || "Not set yet."}</Text>
        </View>

        <View style={styles.row}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => go("/onboarding")}>
            <Text style={styles.actionText}>Set My Path</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => go("/next-chapter")}>
            <Text style={styles.actionText}>Set Your Next Long-Term Goal</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/")}><Text style={styles.bottomText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/sleep")}><Text style={styles.bottomText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/calendar")}><Text style={styles.bottomText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/mind")}><Text style={styles.bottomText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.bottomItem, styles.active]} onPress={() => go("/path")}><Text style={styles.activeText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/stats")}><Text style={styles.bottomText}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 38, paddingBottom: 24 },
  contentShell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  header: { backgroundColor: "#14532D", borderWidth: 3, borderColor: "#22C55E", borderRadius: 16, padding: 12, marginBottom: 10 },
  title: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: "#DCFCE7", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panel: { backgroundColor: "#FEF3C7", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 12, padding: 10, marginBottom: 10 },
  hudLabel: { color: "#111827", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  bodyText: { color: "#374151", fontSize: 12, fontWeight: "700", marginTop: 3, lineHeight: 18 },

  row: { marginBottom: 10 },
  actionBtn: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginBottom: 8 },
  actionText: { color: "#F9FAFB", fontSize: 12, fontWeight: "900" },

  bottomBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  bottomItem: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  active: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  bottomText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  activeText: { color: "#111827", fontSize: 10, fontWeight: "900" },
});