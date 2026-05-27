import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

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

        <TouchableOpacity style={styles.card} onPress={() => router.push("/sleep-checkin")}>
          <Text style={styles.cardTitle}>Morning Check-In</Text>
          <Text style={styles.cardText}>Review sleep, mood, stress, and daily energy mode.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push("/pre-sleep-intention")}>
          <Text style={styles.cardTitle}>Pre-Sleep Intention</Text>
          <Text style={styles.cardText}>Set one clear signal for tomorrow before bed.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push("/morning-intention-reflection")}>
          <Text style={styles.cardTitle}>Morning Reflection</Text>
          <Text style={styles.cardText}>Check what carried from night into today.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push("/sleep-calendar")}>
          <Text style={styles.cardTitle}>Sleep Calendar</Text>
          <Text style={styles.cardText}>View sleep planning with day plan and thought context.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push("/dream-journal")}>
          <Text style={styles.cardTitle}>Dream Journal</Text>
          <Text style={styles.cardText}>Track dreams, symbols, and intention links.</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },
  container: { paddingTop: 30, paddingBottom: 40 },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  hero: {
    backgroundColor: "#1E1B4B",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  heroLabel: {
    color: "#C4B5FD",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  title: {
    color: "#F9FAFB",
    fontSize: 30,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  subtitle: {
    color: "#E2E8F0",
    fontSize: 13,
    lineHeight: 19,
    fontFamily: pixelFont,
  },
  card: {
    backgroundColor: "#111827",
    borderColor: "#334155",
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  cardText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
  },
});