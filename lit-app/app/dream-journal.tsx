import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type DreamEntry = {
  id: string;
  title: string;
  summary: string;
  emotions: string;
  symbols: string;
  lucid: "yes" | "no";
  pattern: string;
  tomorrowIntention?: string;
  createdAt: string;
};

const DREAM_JOURNAL_KEY = "lit_dream_journal";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function SleepScreen() {
  const router = useRouter();
  const [latestDream, setLatestDream] = useState<DreamEntry | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadLatestDream();
    }, [])
  );

  async function lightHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function navigate(path: any) {
    await lightHaptic();
    router.push(path);
  }

  async function loadLatestDream() {
    const saved = await AsyncStorage.getItem(DREAM_JOURNAL_KEY);

    if (!saved) {
      setLatestDream(null);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      setLatestDream(Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null);
    } catch {
      setLatestDream(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>SLEEP HUB</Text>
          <Text style={styles.title}>SLEEP</Text>
          <Text style={styles.subtitle}>Intentions, timing, dreams, and sleep tools.</Text>
        </View>

        <TouchableOpacity style={styles.toolCard} onPress={() => navigate("/sleep-checkin")}>
          <Text style={styles.toolTitle}>Morning Check-In</Text>
          <Text style={styles.toolSubtitle}>Review sleep, mood, stress, and daily energy mode.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolCard}
          onPress={() =>
            router.push({
              pathname: "/sleep-checkin",
              params: { checkInType: "afternoon" },
            })
          }
        >
          <Text style={styles.toolTitle}>Afternoon Check-In</Text>
          <Text style={styles.toolSubtitle}>Update food, mood, stress, and current flame.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolCard} onPress={() => navigate("/pre-sleep-intention")}>
          <Text style={styles.toolTitle}>Pre-Sleep Intention</Text>
          <Text style={styles.toolSubtitle}>Set one clear signal for tomorrow before bed.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolCard} onPress={() => navigate("/morning-intention-reflection")}>
          <Text style={styles.toolTitle}>Morning Reflection</Text>
          <Text style={styles.toolSubtitle}>Check what carried from night into today.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolCard} onPress={() => navigate("/calendar")}>
          <Text style={styles.toolTitle}>Sleep Calendar</Text>
          <Text style={styles.toolSubtitle}>View sleep planning with day plan and thought context.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dreamCard} onPress={() => navigate("/dream-journal")}>
          <Text style={styles.toolTitle}>Dream Journal</Text>
          <Text style={styles.toolSubtitle}>Track dreams, lucid moments, symbols, and subconscious intention links.</Text>
          {latestDream ? (
            <View style={styles.latestDreamBox}>
              <Text style={styles.latestLabel}>LATEST DREAM</Text>
              <Text style={styles.latestTitle}>{latestDream.title || "Untitled dream"}</Text>
              <Text style={styles.latestText} numberOfLines={2}>{latestDream.summary}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            <TouchableOpacity style={styles.navButton} onPress={() => navigate("/")}>
              <Text style={styles.navText}>🏠 Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={lightHaptic}>
              <Text style={styles.navTextActive}>🌙 Sleep</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => navigate("/calendar")}>
              <Text style={styles.navText}>📅 Calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => navigate("/mind")}>
              <Text style={styles.navText}>🧠 Mind</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => navigate("/path")}>
              <Text style={styles.navText}>🧭 Path</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => navigate("/stats")}>
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
    backgroundColor: "#0B1220",
  },
  container: {
    paddingTop: 26,
    paddingBottom: 34,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  hero: {
    backgroundColor: "#1B1940",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
  },
  kicker: {
    color: "#C4B5FD",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 12,
    fontFamily: pixelFont,
  },
  title: {
    color: "#F9FAFB",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 2,
    fontFamily: pixelFont,
  },
  subtitle: {
    color: "#E2E8F0",
    fontSize: 14,
    marginTop: 10,
    fontFamily: pixelFont,
  },
  toolCard: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  dreamCard: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  toolTitle: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  toolSubtitle: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontFamily: pixelFont,
  },
  latestDreamBox: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  latestLabel: {
    color: "#FDE68A",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 5,
    fontFamily: pixelFont,
  },
  latestTitle: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  latestText: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    fontFamily: pixelFont,
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
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 8,
    fontFamily: pixelFont,
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
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  navButtonActive: {
    backgroundColor: "#312E81",
    borderColor: "#FBBF24",
  },
  navText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    fontFamily: pixelFont,
  },
  navTextActive: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    fontFamily: pixelFont,
  },
});