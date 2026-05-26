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

export default function MindScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>MIND HUB</Text>
          <Text style={styles.title}>MIND</Text>
          <Text style={styles.subtitle}>Write what happened. Notice what pulled you away.</Text>
        </View>

        <View style={styles.mindBriefCard}>
          <Text style={styles.briefTitle}>MIND BRIEF</Text>
          <Text style={styles.briefText}>
            Keep it simple. One honest note can change how the day feels.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Journal</Text>
          <Text style={styles.cardText}>Capture the day, mood, and thought patterns.</Text>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/journal")}>
            <Text style={styles.actionText}>Open Journal</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meditations</Text>
          <Text style={styles.cardText}>Track attention, distractions, and what brought you back.</Text>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/awareness-check")}>
            <Text style={styles.actionText}>Open Meditations</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reflect, Don’t Judge</Text>
          <Text style={styles.cardText}>Use reflection to learn from missed quests.</Text>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/reflection")}>
            <Text style={styles.actionText}>Open Reflection</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            {NAV_ITEMS.map((item) => {
              const isActive = item.route === "/mind";
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.navButton, isActive && styles.navButtonActive]}
                  onPress={() => router.push(item.route)}
                >
                  <Text style={[styles.navText, isActive && styles.navTextActive]}>
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
  mindBriefCard: {
    backgroundColor: "#2E1065",
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  briefTitle: {
    color: "#F5F3FF",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  briefText: {
    color: "#E9D5FF",
    fontSize: 14,
    lineHeight: 20,
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
    borderColor: "#A78BFA",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  actionText: {
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
    borderColor: "#A78BFA",
  },
  navText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  navTextActive: {
    color: "#EDE9FE",
  },
});