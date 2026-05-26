import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type JournalEntry = {
  id: string;
  type: "Morning" | "Evening";
  mood: string;
  content: string;
  gratitude: string;
  thoughtPattern?: string;
  thoughtImpact?: "Helpful" | "Harmful" | "Neutral";
  honestReframe?: string;
  mindLesson?: string;
  createdAt: string;
};

type QueueItem = {
  text: string;
  type: string;
};

type UserProfile = {
  name: string;
  progressMeaning: string;
  goalOne: string;
  goalTwo: string;
  goalThree: string;
  biggestObstacle: string;
};

type CheckIn = {
  id?: string;
  hours: string;
  mood: string;
  stress: string;
  energy: number;
  mode: "Recovery" | "Progress";
  createdAt: string;
};

type PreSleepIntention = {
  id: string;
  date: string;
  intention: string;
  whyItMatters: string;
  firstSmallAction: string;
  dreamSymbol: string;
  createdAt: string;
};

type MorningIntentionReflection = {
  id: string;
  intentionId: string;
  date: string;
  recallType: string;
  reflectionText: string;
  todayAction: string;
  createdAt: string;
};

type AwarenessCheck = {
  id: string;
  attentionFocus: string;
  automaticOrIntentional: "Mostly automatic" | "Mixed" | "Mostly intentional";
  pulledAway: string;
  broughtBack: string;
  presentMoment: string;
  createdAt: string;
};

const JOURNAL_KEY = "lit_journal_entries";
const QUEUE_KEY = "lit_tomorrow_queue";
const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const PROFILE_KEY = "lit_user_profile";
const CHECKIN_KEY = "lit_latest_checkin";
const CHECKIN_HISTORY_KEY = "lit_checkin_history";
const PRE_SLEEP_INTENTIONS_KEY = "lit_pre_sleep_intentions";
const MORNING_INTENTION_REFLECTIONS_KEY = "lit_morning_intention_reflections";
const AWARENESS_CHECKS_KEY = "lit_awareness_checks";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function WeeklySummaryScreen() {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [checkInHistory, setCheckInHistory] = useState<CheckIn[]>([]);
  const [preSleepIntentions, setPreSleepIntentions] = useState<PreSleepIntention[]>([]);
  const [morningReflections, setMorningReflections] = useState<MorningIntentionReflection[]>([]);
  const [awarenessChecks, setAwarenessChecks] = useState<AwarenessCheck[]>([]);

  useEffect(() => {
    loadWeeklyData();
  }, []);

  async function loadWeeklyData() {
    const savedJournal = await AsyncStorage.getItem(JOURNAL_KEY);
    const savedQueue = await AsyncStorage.getItem(QUEUE_KEY);
    const savedCompleted = await AsyncStorage.getItem(COMPLETED_QUESTS_KEY);
    const savedProfile = await AsyncStorage.getItem(PROFILE_KEY);
    const savedCheckIn = await AsyncStorage.getItem(CHECKIN_KEY);
    const savedHistory = await AsyncStorage.getItem(CHECKIN_HISTORY_KEY);
    const savedIntentions = await AsyncStorage.getItem(PRE_SLEEP_INTENTIONS_KEY);
    const savedMorningReflections = await AsyncStorage.getItem(MORNING_INTENTION_REFLECTIONS_KEY);
    const savedAwarenessChecks = await AsyncStorage.getItem(AWARENESS_CHECKS_KEY);

    if (savedJournal) setJournalEntries(JSON.parse(savedJournal));
    if (savedQueue) setQueueItems(JSON.parse(savedQueue));
    if (savedCompleted) setCompletedQuests(JSON.parse(savedCompleted));
    if (savedProfile) setProfile(JSON.parse(savedProfile));
    if (savedCheckIn) setLatestCheckIn(JSON.parse(savedCheckIn));
    if (savedHistory) setCheckInHistory(JSON.parse(savedHistory));
    if (savedIntentions) setPreSleepIntentions(JSON.parse(savedIntentions));
    if (savedMorningReflections) setMorningReflections(JSON.parse(savedMorningReflections));
    if (savedAwarenessChecks) setAwarenessChecks(JSON.parse(savedAwarenessChecks));
  }

  const displayName = profile?.name?.trim() || "there";
  const topGoal = profile?.goalOne?.trim() || "Not set yet";
  const progressMeaning = profile?.progressMeaning?.trim() || "Not set yet";

  const completedCount = completedQuests.length;
  const journalCount = journalEntries.length;
  const queueCount = queueItems.length;
  const latestMode = latestCheckIn?.mode || "Progress";
  const latestEnergy = latestCheckIn?.energy ?? null;
  const latestHours = latestCheckIn?.hours || "—";
  const latestMood = latestCheckIn?.mood || "—";
  const latestStress = latestCheckIn?.stress || "—";
  const intentionCount = preSleepIntentions.length;
  const morningReflectionCount = morningReflections.length;
  const awarenessCount = awarenessChecks.length;
  const totalCheckIns = checkInHistory.length;

  const recoveryDays = checkInHistory.filter((checkIn) => checkIn.mode === "Recovery").length;
  const progressDays = checkInHistory.filter((checkIn) => checkIn.mode === "Progress").length;

  const metacognitiveEntryCount = journalEntries.filter(
    (entry) => entry.thoughtPattern || entry.honestReframe || entry.mindLesson
  ).length;

  const latestIntention = preSleepIntentions[0];
  const latestMorningReflection = morningReflections[0];
  const latestAwarenessCheck = awarenessChecks[0];

  const cognitiveSmallWin =
    latestMorningReflection?.todayAction
      ? `You turned a night intention into an action: ${latestMorningReflection.todayAction}`
      : latestIntention?.intention
      ? `You gave tomorrow direction with this intention: ${latestIntention.intention}`
      : latestAwarenessCheck?.presentMoment
      ? `You noticed a present moment: ${latestAwarenessCheck.presentMoment}`
      : metacognitiveEntryCount > 0
      ? "You practiced noticing your thought patterns instead of just reacting to them."
      : "Try one intention, meditation check, or metacognitive journal entry this week.";

  const averageEnergy =
    checkInHistory.length > 0
      ? Math.round(
          checkInHistory.reduce((total, checkIn) => total + checkIn.energy, 0) /
            checkInHistory.length
        )
      : null;

  const energyMessage =
    latestMode === "Recovery"
      ? "Recovery mode means lighter goals, more rest, and smaller honest steps."
      : "Progress mode means you may have energy available for stronger action.";

  const moodNumbers = journalEntries
    .map((entry) => Number(entry.mood))
    .filter((mood) => !Number.isNaN(mood));

  const averageMood =
    moodNumbers.length > 0
      ? Math.round(
          moodNumbers.reduce((total, mood) => total + mood, 0) / moodNumbers.length
        )
      : null;

  const smallWin =
    completedCount > 0
      ? `You completed ${completedCount} quest${completedCount === 1 ? "" : "s"}.`
      : journalCount > 0
      ? "You still showed up by journaling honestly."
      : queueCount > 0
      ? "You saved quick thoughts instead of letting them disappear."
      : "You are still here, and that counts as a starting point.";

  const statCards = [
    { label: "Quests Completed", value: completedCount },
    { label: "Journal Entries", value: journalCount },
    { label: "Saved Thoughts", value: queueCount },
    { label: "Avg Mood", value: averageMood ?? "—" },
    { label: "Recovery Days", value: recoveryDays },
    { label: "Progress Days", value: progressDays },
    { label: "Avg Energy", value: averageEnergy ?? "—" },
    { label: "Check-Ins", value: totalCheckIns },
    { label: "Pre-Sleep Intentions", value: intentionCount },
    { label: "Morning Reflections", value: morningReflectionCount },
    { label: "Meta Entries", value: metacognitiveEntryCount },
    { label: "Meditations", value: awarenessCount },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>STATS BOARD</Text>
          <Text style={styles.title}>WEEKLY SUMMARY</Text>
          <Text style={styles.subtitle}>Review the week. Reflect, don’t judge.</Text>
        </View>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaName}>Luna</Text>
          <Text style={styles.lunaText}>
            Hey {displayName}, this is not about judging your week. Notice where you showed
            up, what felt heavy, and what next step still feels true.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>CURRENT PATH</Text>
          <Text style={styles.mainText}>{topGoal}</Text>
          <Text style={styles.subText}>Progress means: {progressMeaning}</Text>
        </View>

        <View style={latestMode === "Recovery" ? styles.recoveryEnergyCard : styles.progressEnergyCard}>
          <Text style={styles.energyCardLabel}>LATEST CHECK-IN</Text>
          <Text style={styles.energyMain}>{latestEnergy !== null ? `${latestEnergy}/100` : "—/100"}</Text>
          <View style={latestMode === "Recovery" ? styles.recoveryBadge : styles.progressBadge}>
            <Text style={styles.modeBadgeText}>{latestMode}</Text>
          </View>
          <Text style={styles.energyDetails}>
            Sleep: {latestHours} hrs • Mood: {latestMood}/10 • Stress: {latestStress}/10
          </Text>
          <Text style={styles.energyMessage}>{energyMessage}</Text>
        </View>

        <View style={styles.grid}>
          {statCards.map((card) => (
            <View key={card.label} style={styles.statCard}>
              <Text style={styles.statNumber}>{card.value}</Text>
              <Text style={styles.statLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.highlightCard}>
          <Text style={styles.highlightLabel}>SMALL WIN</Text>
          <Text style={styles.highlightText}>{smallWin}</Text>
        </View>

        <View style={styles.cognitiveCard}>
          <Text style={styles.cognitiveLabel}>REFLECTION LAYER</Text>
          <Text style={styles.cognitiveTitle}>Night → Morning → Action</Text>
          <Text style={styles.cognitiveText}>{cognitiveSmallWin}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>RECOVERY / PROGRESS PATTERN</Text>
          <Text style={styles.bodyText}>
            You recorded {recoveryDays} Recovery day{recoveryDays === 1 ? "" : "s"} and{" "}
            {progressDays} Progress day{progressDays === 1 ? "" : "s"}. This is about
            learning when you needed restoration and when you had energy to move forward.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>LUNA’S NEXT STEP</Text>
          <Text style={styles.bodyText}>
            Next week, choose one goal that feels honest and small enough to repeat. If
            your energy is low, make it a Recovery goal. If your energy is strong, make
            it a Progress goal.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>RECENT COGNITIVE MOMENTS</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>LATEST INTENTION</Text>
          <Text style={styles.bodyText}>
            {latestIntention?.intention || "No pre-sleep intention saved yet."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>LATEST MEDITATION</Text>
          <Text style={styles.bodyText}>
            {latestAwarenessCheck
              ? `Attention: ${latestAwarenessCheck.attentionFocus || "not specified"}`
              : "No meditation saved yet."}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>RECENT JOURNAL MOMENTS</Text>

        {journalEntries.slice(0, 3).length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No journal entries yet. Start with one honest sentence this week.
            </Text>
          </View>
        ) : (
          journalEntries.slice(0, 3).map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <Text style={styles.entryTitle}>{entry.type} Entry</Text>
              <Text style={styles.entryDate}>{entry.createdAt}</Text>
              <Text style={styles.entryText}>
                {entry.content || entry.gratitude || "Saved reflection"}
              </Text>
            </View>
          ))
        )}

        <Link href="/" asChild>
          <TouchableOpacity style={styles.homeButton}>
            <Text style={styles.homeButtonText}>Back to Today</Text>
          </TouchableOpacity>
        </Link>
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
    backgroundColor: "#0F172A",
    borderColor: "#FBBF24",
    borderWidth: 3,
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "800",
    marginBottom: 8,
  },
  title: {
    fontSize: 31,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    letterSpacing: 1,
    fontFamily: pixelFont,
  },
  subtitle: {
    fontSize: 14,
    color: "#E2E8F0",
    lineHeight: 21,
    fontWeight: "600",
  },
  lunaCard: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  lunaName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  lunaText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#CBD5E1",
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#334155",
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#F8FAFC",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  mainText: {
    fontSize: 21,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
  },
  subText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#CBD5E1",
    fontWeight: "700",
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#CBD5E1",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  statCard: {
    width: "48.5%",
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: "#475569",
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 29,
    fontWeight: "900",
    color: "#F9FAFB",
    fontFamily: pixelFont,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#CBD5E1",
    marginTop: 4,
    lineHeight: 16,
  },
  highlightCard: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  highlightLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FDE68A",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  highlightText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "900",
    color: "#F9FAFB",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 10,
    marginTop: 2,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  emptyCard: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: "#475569",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#94A3B8",
  },
  entryCard: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#475569",
  },
  entryTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#F9FAFB",
    fontFamily: pixelFont,
  },
  entryDate: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
    marginBottom: 8,
    fontFamily: pixelFont,
  },
  entryText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#CBD5E1",
  },
  homeButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  homeButtonText: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
    letterSpacing: 0.8,
  },
  progressEnergyCard: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  recoveryEnergyCard: {
    backgroundColor: "#312E81",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  energyCardLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#D1D5DB",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  energyMain: {
    fontSize: 40,
    fontWeight: "900",
    color: "#FBBF24",
    fontFamily: pixelFont,
  },
  progressBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "#14532D",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: "#22C55E",
  },
  recoveryBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "#4C1D95",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  modeBadgeText: {
    fontSize: 12,
    color: "#F9FAFB",
    fontWeight: "900",
    fontFamily: pixelFont,
    letterSpacing: 0.5,
  },
  energyDetails: {
    fontSize: 14,
    lineHeight: 20,
    color: "#E5E7EB",
    marginTop: 10,
    fontWeight: "700",
  },
  energyMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: "#F9FAFB",
    marginTop: 10,
  },
  cognitiveCard: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  cognitiveLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#C4B5FD",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  cognitiveTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    fontFamily: pixelFont,
  },
  cognitiveText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#CBD5E1",
    fontWeight: "700",
  },
});