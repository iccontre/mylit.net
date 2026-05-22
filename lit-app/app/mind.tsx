import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function MindHubScreen() {
  const router = useRouter();

  function go(path: string, quest?: string) {
    if (quest) {
      router.push({ pathname: path as any, params: { quest } });
      return;
    }
    router.push(path as any);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { fontFamily: pixelFont }]}>MIND</Text>
          <Text style={styles.heroSubtitle}>Write what happened. Notice what pulled you away.</Text>
        </View>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.tile} onPress={() => go("/journal")}>
            <Text style={styles.tileTitle}>Journal</Text>
            <Text style={styles.tileText}>Write reflections and thought patterns.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => go("/awareness-check")}>
            <Text style={styles.tileTitle}>Meditations</Text>
            <Text style={styles.tileText}>Notice attention and distractions.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => go("/reflection", "Open reflection")}>
            <Text style={styles.tileTitle}>Reflect, Don’t Judge</Text>
            <Text style={styles.tileText}>Missed goals are data, not defeat.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panel}>
          <Text style={[styles.panelTitle, { fontFamily: pixelFont }]}>MIND BRIEF</Text>
          <Text style={styles.panelText}>Choose your next move.</Text>
          <Text style={styles.panelText}>Save the thought.</Text>
          <Text style={styles.panelText}>Reflect, don’t judge.</Text>
        </View>

        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/")}><Text style={styles.navText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/sleep")}><Text style={styles.navText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/calendar")}><Text style={styles.navText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.navBtn, styles.navBtnActive]} onPress={() => go("/mind")}><Text style={styles.navTextActive}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => go("/path")}><Text style={styles.navText}>Path</Text></TouchableOpacity>
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

  hero: { backgroundColor: "#312E81", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 18, padding: 12, marginBottom: 10 },
  heroTitle: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  heroSubtitle: { color: "#DDD6FE", fontSize: 12, fontWeight: "700", marginTop: 4 },

  grid: { marginBottom: 10 },
  tile: { backgroundColor: "#EEF2FF", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 10, padding: 10, marginBottom: 8 },
  tileTitle: { color: "#111827", fontSize: 13, fontWeight: "900" },
  tileText: { color: "#374151", fontSize: 11, fontWeight: "700", marginTop: 4 },

  panel: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 12, padding: 10, marginBottom: 10 },
  panelTitle: { color: "#F9FAFB", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  panelText: { color: "#E5E7EB", fontSize: 12, fontWeight: "700", marginTop: 4 },

  navBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  navBtn: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  navBtnActive: { backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#A78BFA" },
  navText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  navTextActive: { color: "#111827", fontSize: 10, fontWeight: "900" },
});