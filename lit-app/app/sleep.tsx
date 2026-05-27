import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

type SleepTile = {
  title: string;
  subtitle: string;
  route: string;
};

const sleepTiles: SleepTile[] = [
  {
    title: "Morning Check-In",
    subtitle: "Review sleep, mood, stress, and daily energy mode.",
    route: "/sleep-checkin",
  },
  {
    title: "Pre-Sleep Intention",
    subtitle: "Set one clear signal for tomorrow before bed.",
    route: "/pre-sleep-intention",
  },
  {
    title: "Morning Reflection",
    subtitle: "Check what carried from night into today.",
    route: "/morning-intention-reflection",
  },
  {
    title: "Sleep Calendar",
    subtitle: "View sleep planning with day plan and thought context.",
    route: "/sleep-calendar",
  },
  {
    title: "Dream Journal",
    subtitle: "Track dreams, symbols, and intention links.",
    route: "/dream-journal",
  },
];

export default function SleepScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>SLEEP HUB</Text>
          <Text style={styles.title}>SLEEP</Text>
          <Text style={styles.subtitle}>Intentions, timing, and sleep tools.</Text>
        </View>

        {sleepTiles.map((tile) => (
          <TouchableOpacity
            key={tile.title}
            style={styles.tile}
            onPress={() => router.push(tile.route as any)}
          >
            <Text style={styles.tileTitle}>{tile.title}</Text>
            <Text style={styles.tileSubtitle}>{tile.subtitle}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}>
              <Text style={styles.navText}>🏠 Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonActive]}
              onPress={() => router.push("/sleep")}
            >
              <Text style={[styles.navText, styles.navTextActive]}>🌙 Sleep</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/calendar")}>
              <Text style={styles.navText}>📅 Calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/mind")}>
              <Text style={styles.navText}>🧠 Mind</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/path")}>
              <Text style={styles.navText}>🧭 Path</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/stats")}>
              <Text style={styles.navText}>🎒 Inventory</Text>
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
    backgroundColor: "#020B24",
  },
  container: {
    paddingTop: 28,
    paddingBottom: 44,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  hero: {
    backgroundColor: "#27235C",
    borderWidth: 4,
    borderColor: "#9F88FF",
    borderRadius: 28,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "800",
    marginBottom: 8,
  },
  title: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  subtitle: {
    color: "#E2E8F0",
    fontSize: 18,
    lineHeight: 26,
    fontFamily: pixelFont,
  },
  tile: {
    backgroundColor: "#0D1938",
    borderWidth: 2,
    borderColor: "#35517B",
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  tileTitle: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 31 / 2,
    fontWeight: "900",
    marginBottom: 7,
    letterSpacing: 0.6,
  },
  tileSubtitle: {
    color: "#E2E8F0",
    fontSize: 31 / 2,
    lineHeight: 22,
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
    backgroundColor: "#312E81",
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