import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Quest = {
  title: string;
  type: string;
  steps: number;
};

const COMPLETED_QUESTS_KEY = "lit_completed_quests";

export default function HomeScreen() {
  const params = useLocalSearchParams();

  const mode = params.mode === "Recovery" ? "Recovery" : "Progress";
  const energyYield = params.energy ? Number(params.energy) : 78;

  const isRecovery = mode === "Recovery";

  const startingQuests: Quest[] = isRecovery
    ? [
        { title: "Recovery request", type: "Recovery", steps: 1 },
        { title: "Take one honest small step", type: "Truth", steps: 1 },
        { title: "Prepare for better sleep tonight", type: "Rest", steps: 1 },
      ]
    : [
        { title: "Morning journal", type: "Mind", steps: 1 },
        { title: "Complete 1 focus block", type: "Focus", steps: 2 },
        { title: "Take one step toward your top goal", type: "Future", steps: 2 },
      ];

  const [completedQuests, setCompletedQuests] = useState<string[]>([]);

  useEffect(() => {
    loadCompletedQuests();
  }, []);

  async function loadCompletedQuests() {
    const saved = await AsyncStorage.getItem(COMPLETED_QUESTS_KEY);

    if (saved) {
      setCompletedQuests(JSON.parse(saved));
    }
  }

  async function saveCompletedQuests(nextCompleted: string[]) {
    setCompletedQuests(nextCompleted);
    await AsyncStorage.setItem(COMPLETED_QUESTS_KEY, JSON.stringify(nextCompleted));
  }

  async function toggleQuest(title: string) {
    let nextCompleted: string[];

    if (completedQuests.includes(title)) {
      nextCompleted = completedQuests.filter((item) => item !== title);
    } else {
      nextCompleted = [...completedQuests, title];
    }

    await saveCompletedQuests(nextCompleted);
  }

  async function resetTodayProgress() {
    await saveCompletedQuests([]);
  }

  const completedSteps = startingQuests
    .filter((quest) => completedQuests.includes(quest.title))
    .reduce((total, quest) => total + quest.steps, 0);

  const completedVisibleQuests = startingQuests.filter((quest) =>
    completedQuests.includes(quest.title)
  ).length;

  return (
    <ScrollView
      style={[styles.screen, isRecovery ? styles.recoveryScreen : styles.progressScreen]}
      contentContainerStyle={styles.container}
    >
      <View style={styles.header}>
        <Text style={[styles.logo, isRecovery ? styles.recoveryLogo : styles.progressLogo]}>
          lit
        </Text>
        <Text style={[styles.subtitle, isRecovery ? styles.recoverySubtitle : styles.progressSubtitle]}>
          Living in Truth
        </Text>
      </View>

      <Link href="/sleep-checkin" asChild>
        <TouchableOpacity style={styles.checkInButton}>
          <Text style={styles.checkInButtonText}>Start Morning Check-In</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/tomorrow-queue" asChild>
        <TouchableOpacity style={styles.queueButton}>
          <Text style={styles.queueButtonText}>Open Tomorrow Queue</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/journal" asChild>
        <TouchableOpacity style={styles.journalButton}>
          <Text style={styles.journalButtonText}>Open Journal</Text>
        </TouchableOpacity>
      </Link>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>{isRecovery ? "🌙 Luna" : "☀️ Luna"}</Text>
        <Text style={styles.lunaText}>
          {isRecovery
            ? "You’re in Recovery today. That does not mean you stopped progressing. Let’s protect your energy and take one honest step."
            : "You’re in Progress today. Let’s choose steps that fit your real life, not someone else’s version of success."}
        </Text>
      </View>

      <View style={[styles.energyCard, isRecovery ? styles.recoveryEnergyCard : styles.progressEnergyCard]}>
        <Text style={styles.cardLabel}>Energy Yield</Text>
        <Text style={styles.energy}>🔥 {energyYield}/100</Text>
        <Text style={styles.mode}>Mode: {mode}</Text>
      </View>

      <Text style={[styles.sectionTitle, isRecovery ? styles.recoveryText : styles.progressText]}>
        Today’s Quests
      </Text>

      {startingQuests.map((quest, index) => {
        const isComplete = completedQuests.includes(quest.title);

        return (
          <View key={index} style={[styles.questCard, isComplete && styles.completedQuestCard]}>
            <TouchableOpacity style={styles.questMain} onPress={() => toggleQuest(quest.title)}>
              <View style={styles.questLeft}>
                <Text style={styles.checkbox}>{isComplete ? "✅" : "⬜"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.questTitle, isComplete && styles.completedQuestText]}>
                    {quest.title}
                  </Text>
                  <Text style={styles.questType}>{quest.type}</Text>
                </View>
              </View>

              <Text style={styles.steps}>+{quest.steps}</Text>
            </TouchableOpacity>

            {!isComplete && (
              <Link
                href={{
                  pathname: "/reflection",
                  params: { quest: quest.title },
                }}
                asChild
              >
                <TouchableOpacity style={styles.reflectButton}>
                  <Text style={styles.reflectButtonText}>Reflect if missed</Text>
                </TouchableOpacity>
              </Link>
            )}
          </View>
        );
      })}

      <View style={styles.summaryCard}>
        <Text style={styles.cardLabel}>Progress</Text>
        <Text style={styles.rank}>Rank: {completedSteps >= 5 ? "Builder" : "Wanderer"}</Text>
        <Text style={styles.smallText}>Steps earned today: {completedSteps}</Text>
        <Text style={styles.smallText}>
          Completed quests: {completedVisibleQuests}/{startingQuests.length}
        </Text>

        <TouchableOpacity style={styles.resetButton} onPress={resetTodayProgress}>
          <Text style={styles.resetButtonText}>Reset Today’s Quest Progress</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  progressScreen: {
    backgroundColor: "#F7EBC8",
  },
  recoveryScreen: {
    backgroundColor: "#111827",
  },
  container: {
    padding: 24,
    paddingTop: 70,
  },
  header: {
    marginBottom: 24,
  },
  logo: {
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: -2,
  },
  progressLogo: {
    color: "#1F2937",
  },
  recoveryLogo: {
    color: "#F9FAFB",
  },
  subtitle: {
    fontSize: 16,
    marginTop: -4,
  },
  progressSubtitle: {
    color: "#6B7280",
  },
  recoverySubtitle: {
    color: "#D1D5DB",
  },
  checkInButton: {
    backgroundColor: "#111827",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  checkInButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  queueButton: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  queueButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
  },
  journalButton: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  journalButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
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
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 8,
  },
  lunaText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
  },
  energyCard: {
    borderRadius: 24,
    padding: 22,
    marginBottom: 26,
  },
  progressEnergyCard: {
    backgroundColor: "#1F2937",
  },
  recoveryEnergyCard: {
    backgroundColor: "#312E81",
  },
  cardLabel: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 8,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  energy: {
    fontSize: 38,
    fontWeight: "900",
    color: "#FBBF24",
  },
  mode: {
    fontSize: 16,
    color: "#F9FAFB",
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 14,
  },
  progressText: {
    color: "#1F2937",
  },
  recoveryText: {
    color: "#F9FAFB",
  },
  questCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  completedQuestCard: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
  },
  questMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  questLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  checkbox: {
    fontSize: 22,
  },
  questTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  completedQuestText: {
    textDecorationLine: "line-through",
    color: "#166534",
  },
  questType: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  steps: {
    fontSize: 18,
    fontWeight: "900",
    color: "#16A34A",
  },
  reflectButton: {
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 14,
  },
  reflectButtonText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "900",
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginTop: 14,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  rank: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },
  smallText: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 6,
  },
  resetButton: {
    backgroundColor: "#FEE2E2",
    padding: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 16,
  },
  resetButtonText: {
    color: "#991B1B",
    fontSize: 14,
    fontWeight: "900",
  },
});