import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function MindHubScreen() {
  const router = useRouter();
  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });

  function go(path: string, quest?: string) {
    if (quest) {
      router.push({ pathname: path as any, params: { quest } });
      return;
    }
    router.push(path as any);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.contentShell}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontFamily: mono }]}>MIND</Text>
          <Text style={styles.subtitle}>Write what happened. Notice what pulled you away.</Text>
        </View>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.tile} onPress={() => go("/journal")}>
            <Text style={styles.tileTitle}>Journal</Text>
            <Text style={styles.tileSub}>Write reflections and thought patterns.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tile} onPress={() => go("/awareness-check")}>
            <Text style={styles.tileTitle}>Meditations</Text>
            <Text style={styles.tileSub}>Notice attention and distractions.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tile} onPress={() => go("/reflection", "Open reflection")}>
            <Text style={styles.tileTitle}>Reflect, Don’t Judge</Text>
            <Text style={styles.tileSub}>Missed goals are data, not defeat.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panel}>
          <Text style={[styles.hudLabel, { fontFamily: mono }]}>MIND BRIEF</Text>
          <Text style={styles.bodyText}>Small steps count.</Text>
          <Text style={styles.bodyText}>Follow the path, then reflect.</Text>
          <Text style={styles.bodyText}>Keep one promise.</Text>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/")}><Text style={styles.bottomText}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/sleep")}><Text style={styles.bottomText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/calendar")}><Text style={styles.bottomText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.bottomItem, styles.active]} onPress={() => go("/mind")}><Text style={styles.activeText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => go("/path")}><Text style={styles.bottomText}>Path</Text></TouchableOpacity>
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

  header: { backgroundColor: "#312E81", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 16, padding: 12, marginBottom: 10 },
  title: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: "#DDD6FE", fontSize: 12, fontWeight: "700", marginTop: 4 },

  grid: { marginBottom: 10 },
  tile: { backgroundColor: "#EEF2FF", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 10, padding: 10, marginBottom: 8 },
  tileTitle: { color: "#111827", fontSize: 13, fontWeight: "900" },
  tileSub: { color: "#374151", fontSize: 11, fontWeight: "700", marginTop: 4 },

  panel: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#334155", borderRadius: 12, padding: 10, marginBottom: 10 },
  hudLabel: { color: "#111827", fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  bodyText: { color: "#374151", fontSize: 12, fontWeight: "700", marginTop: 3 },

  bottomBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  bottomItem: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  active: { backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#A78BFA" },
  bottomText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  activeText: { color: "#111827", fontSize: 10, fontWeight: "900" },
});