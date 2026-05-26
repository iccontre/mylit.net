import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function SleepScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>Sleep</Text>
        <Text style={styles.subtitle}>Intentions, timing, and sleep tools.</Text>
      </View>

      <TouchableOpacity style={styles.card} onPress={() => router.push("/sleep-checkin")}>
        <Text style={styles.cardTitle}>Morning Check-In</Text>
        <Text style={styles.cardText}>Check sleep, mood, and stress.</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push("/pre-sleep-intention")}>
        <Text style={styles.cardTitle}>Pre-Sleep Intention</Text>
        <Text style={styles.cardText}>Set one signal before sleep.</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push("/morning-intention-reflection")}>
        <Text style={styles.cardTitle}>Morning Reflection</Text>
        <Text style={styles.cardText}>Review what carried into morning.</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push("/sleep-calendar")}>
        <Text style={styles.cardTitle}>Sleep Calendar</Text>
        <Text style={styles.cardText}>Plan caffeine, meals, and wind-down.</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 18, paddingTop: 56, paddingBottom: 36, width: "100%", maxWidth: 520, alignSelf: "center" },
  hero: {
    backgroundColor: "#111827",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
  },
  title: { color: "#F9FAFB", fontSize: 28, fontWeight: "900", marginBottom: 4 },
  subtitle: { color: "#CBD5E1", fontSize: 13, fontWeight: "800" },
  card: {
    backgroundColor: "#1E1B4B",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { color: "#F9FAFB", fontSize: 16, fontWeight: "900", marginBottom: 4 },
  cardText: { color: "#E5E7EB", fontSize: 12, fontWeight: "700", lineHeight: 17 },
});