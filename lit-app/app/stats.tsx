import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type CheckIn = {
  energy?: number;
  mode?: "Recovery" | "Progress";
};

type UserProfile = {
  dreamCategory?: string;
};

const CHECKIN_KEY = "lit_latest_checkin";
const CHECKIN_HISTORY_KEY = "lit_checkin_history";
const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const JOURNAL_KEY = "lit_journal_entries";
const MEDITATIONS_KEY = "lit_awareness_checks";
const PRE_SLEEP_INTENTIONS_KEY = "lit_pre_sleep_intentions";
const MORNING_REFLECTIONS_KEY = "lit_morning_reflections";
const QUICK_THOUGHTS_KEY = "lit_tomorrow_queue";
const PROFILE_KEY = "lit_user_profile";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function safeParseArray(value: string | null): any[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseObject<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return parsed as T;
    }
    return null;
  } catch {
    return null;
  }
}

export default function InventoryScreen() {
  const router = useRouter();

  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [checkInCount, setCheckInCount] = useState(0);
  const [completedQuestCount, setCompletedQuestCount] = useState(0);
  const [journalCount, setJournalCount] = useState(0);
  const [meditationCount, setMeditationCount] = useState(0);
  const [preSleepIntentionCount, setPreSleepIntentionCount] = useState(0);
  const [morningReflectionCount, setMorningReflectionCount] = useState(0);
  const [quickThoughtCount, setQuickThoughtCount] = useState(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadInventoryData();
  }, []);

  async function loadInventoryData() {
    const [
      latestCheckInRaw,
      checkInHistoryRaw,
      completedQuestsRaw,
      journalRaw,
      meditationsRaw,
      preSleepRaw,
      morningReflectionsRaw,
      quickThoughtsRaw,
      profileRaw,
    ] = await Promise.all([
      AsyncStorage.getItem(CHECKIN_KEY),
      AsyncStorage.getItem(CHECKIN_HISTORY_KEY),
      AsyncStorage.getItem(COMPLETED_QUESTS_KEY),
      AsyncStorage.getItem(JOURNAL_KEY),
      AsyncStorage.getItem(MEDITATIONS_KEY),
      AsyncStorage.getItem(PRE_SLEEP_INTENTIONS_KEY),
      AsyncStorage.getItem(MORNING_REFLECTIONS_KEY),
      AsyncStorage.getItem(QUICK_THOUGHTS_KEY),
      AsyncStorage.getItem(PROFILE_KEY),
    ]);

    setLatestCheckIn(safeParseObject<CheckIn>(latestCheckInRaw));
    setCheckInCount(safeParseArray(checkInHistoryRaw).length);
    setCompletedQuestCount(safeParseArray(completedQuestsRaw).length);
    setJournalCount(safeParseArray(journalRaw).length);
    setMeditationCount(safeParseArray(meditationsRaw).length);
    setPreSleepIntentionCount(safeParseArray(preSleepRaw).length);
    setMorningReflectionCount(safeParseArray(morningReflectionsRaw).length);
    setQuickThoughtCount(safeParseArray(quickThoughtsRaw).length);
    setProfile(safeParseObject<UserProfile>(profileRaw));
  }

  const rank = completedQuestCount >= 5 ? "Consistent" : "Beginner";
  const latestEnergy =
    typeof latestCheckIn?.energy === "number" ? `${latestCheckIn.energy}/100` : "Not logged yet";
  const latestMode = latestCheckIn?.mode ?? "Not logged yet";

  const totalSignals =
    checkInCount +
    completedQuestCount +
    journalCount +
    meditationCount +
    preSleepIntentionCount +
    morningReflectionCount +
    quickThoughtCount;

  const resumeBullets = useMemo(() => {
    const bullets: string[] = [
      `Completed ${completedQuestCount} self-directed quests through MYLIT.`,
      `Logged ${checkInCount} check-ins to track energy, mood, stress, and sleep.`,
      `Maintained ${journalCount} journal reflections.`,
      `Practiced ${meditationCount} meditation/attention checks.`,
    ];

    const category = profile?.dreamCategory?.trim();

    if (category === "Health" && checkInCount > 0) {
      bullets.push("Tracked wellness habits through repeated check-ins.");
      bullets.push("Built consistency around movement, sleep, and recovery.");
    }

    if (category === "School / Work" && completedQuestCount > 0) {
      bullets.push("Built consistency around focus blocks and weekly goals.");
    }

    if (category === "Mind" && (journalCount > 0 || meditationCount > 0)) {
      bullets.push("Built reflection habits through journaling and meditation logs.");
    }

    return bullets;
  }, [completedQuestCount, checkInCount, journalCount, meditationCount, profile?.dreamCategory]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>INVENTORY</Text>
          <Text style={styles.heroSubtitle}>Track what your actions are building.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>PLAYER CARD</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Rank</Text>
            <Text style={styles.statValue}>{rank}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Latest Energy</Text>
            <Text style={styles.statValue}>{latestEnergy}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Latest Mode</Text>
            <Text style={styles.statValue}>{latestMode}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Completed Quests</Text>
            <Text style={styles.statValue}>{completedQuestCount}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>SKILL INVENTORY</Text>
          <Text style={styles.inventoryLine}>• Check-ins logged: {checkInCount}</Text>
          <Text style={styles.inventoryLine}>• Journal entries: {journalCount}</Text>
          <Text style={styles.inventoryLine}>• Meditations logged: {meditationCount}</Text>
          <Text style={styles.inventoryLine}>• Pre-sleep intentions: {preSleepIntentionCount}</Text>
          <Text style={styles.inventoryLine}>• Morning reflections: {morningReflectionCount}</Text>
          <Text style={styles.inventoryLine}>• Quick thoughts saved: {quickThoughtCount}</Text>
          <Text style={styles.inventoryLine}>• Completed quests: {completedQuestCount}</Text>
          {profile?.dreamCategory ? (
            <Text style={styles.pipelineText}>Current pipeline: {profile.dreamCategory}</Text>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>ACCOMPLISHMENTS</Text>
          {totalSignals === 0 ? (
            <Text style={styles.emptyText}>
              Your inventory is just starting. Check in and complete quests to build it.
            </Text>
          ) : (
            <>
              <Text style={styles.inventoryLine}>• Checked in {checkInCount} times</Text>
              <Text style={styles.inventoryLine}>• Completed {completedQuestCount} quests</Text>
              <Text style={styles.inventoryLine}>• Wrote {journalCount} journal entries</Text>
              <Text style={styles.inventoryLine}>• Logged {meditationCount} meditations</Text>
              <Text style={styles.inventoryLine}>
                • Set {preSleepIntentionCount} pre-sleep intentions
              </Text>
              <Text style={styles.inventoryLine}>• Saved {quickThoughtCount} quick thoughts</Text>
            </>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>RESUME PREVIEW</Text>
          <Text style={styles.previewSubtitle}>Your progress can become real evidence.</Text>
          {resumeBullets.map((line) => (
            <Text key={line} style={styles.inventoryLine}>
              • {line}
            </Text>
          ))}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/weekly-summary")}
          >
            <Text style={styles.primaryButtonText}>Open Weekly Summary</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}>
              <Text style={styles.navText}>🏠 Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/sleep")}>
              <Text style={styles.navText}>🌙 Sleep</Text>
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
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonActive]}
              onPress={() => router.push("/stats")}
            >
              <Text style={[styles.navText, styles.navTextActive]}>🎒 Inventory</Text>
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
    paddingTop: 24,
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
    borderColor: "#FBBF24",
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  heroTitle: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroSubtitle: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  panel: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  panelTitle: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    paddingVertical: 7,
  },
  statLabel: {
    color: "#CBD5E1",
    fontSize: 13,
    fontFamily: pixelFont,
    fontWeight: "700",
  },
  statValue: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "800",
  },
  inventoryLine: {
    color: "#E2E8F0",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  pipelineText: {
    color: "#86EFAC",
    marginTop: 8,
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
  },
  previewSubtitle: {
    color: "#CBD5E1",
    fontSize: 13,
    marginBottom: 8,
  },
  emptyText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: "#14532D",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  bottomNav: {
    backgroundColor: "#0F172A",
    borderWidth: 3,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 12,
    marginTop: 4,
  },
  bottomTitle: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
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
    backgroundColor: "#78350F",
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
    color: "#FEF3C7",
  },
});