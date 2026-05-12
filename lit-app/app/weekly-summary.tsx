import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type JournalEntry = {
  id: string;
  type: "Morning" | "Evening";
  mood: string;
  content: string;
  gratitude: string;
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

const JOURNAL_KEY = "lit_journal_entries";
const QUEUE_KEY = "lit_tomorrow_queue";
const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const PROFILE_KEY = "lit_user_profile";

export default function WeeklySummaryScreen() {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadWeeklyData();
  }, []);

  async function loadWeeklyData() {
    const savedJournal = await AsyncStorage.getItem(JOURNAL_KEY);
    const savedQueue = await AsyncStorage.getItem(QUEUE_KEY);
    const savedCompleted = await AsyncStorage.getItem(COMPLETED_QUESTS_KEY);
    const savedProfile = await AsyncStorage.getItem(PROFILE_KEY);

    if (savedJournal) setJournalEntries(JSON.parse(savedJournal));
    if (savedQueue) setQueueItems(JSON.parse(savedQueue));
    if (savedCompleted) setCompletedQuests(JSON.parse(savedCompleted));
    if (savedProfile) setProfile(JSON.parse(savedProfile));
  }

  const displayName = profile?.name?.trim() || "there";
  const topGoal = profile?.goalOne?.trim() || "your current path";
  const progressMeaning = profile?.progressMeaning?.trim() || "small honest progress";

  const completedCount = completedQuests.length;
  const journalCount = journalEntries.length;
  const queueCount = queueItems.length;

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
      ? "You saved intentions for tomorrow instead of letting them disappear."
      : "You are still here, and that counts as a starting point.";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Weekly Summary</Text>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>🌙 Luna</Text>
        <Text style={styles.lunaText}>
          Hey {displayName}, this is not about judging your week. It is about noticing
          where you showed up, what felt heavy, and what next step still feels true.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Your Current Path</Text>
        <Text style={styles.mainText}>{topGoal}</Text>
        <Text style={styles.subText}>Progress means: {progressMeaning}</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Quests Completed</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{journalCount}</Text>
          <Text style={styles.statLabel}>Journal Entries</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{queueCount}</Text>
          <Text style={styles.statLabel}>Tomorrow Items</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{averageMood ?? "—"}</Text>
          <Text style={styles.statLabel}>Avg Mood</Text>
        </View>
      </View>

      <View style={styles.highlightCard}>
        <Text style={styles.highlightLabel}>Small Win</Text>
        <Text style={styles.highlightText}>{smallWin}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Recovery / Progress Reflection</Text>
        <Text style={styles.bodyText}>
          This week, your goal is not to prove that you were perfect. Your goal is to
          understand whether you needed Recovery, Progress, or a better balance of both.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Luna’s Next Step</Text>
        <Text style={styles.bodyText}>
          Next week, choose one goal that feels honest and small enough to repeat. If
          your energy is low, make it a Recovery goal. If your energy is strong, make
          it a Progress goal.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Recent Journal Moments</Text>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7EBC8",
  },
  container: {
    padding: 24,
    paddingTop: 70,
    paddingBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 18,
  },
  lunaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  lunaName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  lunaText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  mainText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  subText: {
    fontSize: 16,
    lineHeight: 23,
    color: "#374151",
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  statNumber: {
    fontSize: 34,
    fontWeight: "900",
    color: "#111827",
  },
  statLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#6B7280",
    marginTop: 4,
  },
  highlightCard: {
    backgroundColor: "#111827",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  highlightLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FBBF24",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  highlightText: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 14,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 23,
    color: "#6B7280",
  },
  entryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  entryTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  entryDate: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 8,
  },
  entryText: {
    fontSize: 16,
    lineHeight: 23,
    color: "#374151",
  },
  homeButton: {
    backgroundColor: "#FBBF24",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 12,
  },
  homeButtonText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },
});
