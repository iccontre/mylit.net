import { useRouter } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

type NavItem = {
  label: string;
  icon: string;
  route: "/" | "/sleep" | "/calendar" | "/mind" | "/path" | "/stats";
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: "🏠", route: "/" },
  { label: "Sleep", icon: "🌙", route: "/sleep" },
  { label: "Calendar", icon: "📅", route: "/calendar" },
  { label: "Mind", icon: "🧠", route: "/mind" },
  { label: "Path", icon: "🧭", route: "/path" },
  { label: "Stats", icon: "📊", route: "/stats" },
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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Morning Check-In</Text>
          <Text style={styles.cardText}>Check your sleep and energy to set today’s mode.</Text>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/sleep-checkin")}>
            <Text style={styles.actionButtonText}>Open Morning Check-In</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Night & Reflection</Text>
          <Text style={styles.cardText}>Set a pre-sleep signal and review it in the morning.</Text>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/pre-sleep-intention")}>
            <Text style={styles.actionButtonText}>Pre-Sleep Intention</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryAction]}
            onPress={() => router.push("/morning-intention-reflection")}
          >
            <Text style={styles.actionButtonText}>Morning Reflection</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Planning Tools</Text>
          <Text style={styles.cardText}>Use the sleep calendar and day planning tools.</Text>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/sleep-calendar")}>
            <Text style={styles.actionButtonText}>Sleep Calendar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            {NAV_ITEMS.map((item) => {
              const active = item.route === "/sleep";
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.navButton, active && styles.navButtonActive]}
                  onPress={() => router.push(item.route)}
                >
                  <Text style={[styles.navText, active && styles.navTextActive]}>
                    {item.icon} {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  container: {
    paddingTop: 28,
    paddingBottom: 42,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  hero: {
    backgroundColor: "#111827",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "800",
    marginBottom: 8,
  },
  title: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  cardText: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  actionButton: {
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  secondaryAction: {
    borderColor: "#22C55E",
  },
  actionButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
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