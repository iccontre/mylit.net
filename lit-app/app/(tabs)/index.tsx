import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Quest = {
  title: string;
  type: string;
  steps: number;
};

type UserProfile = {
  name: string;
  progressMeaning: string;
  goalOne: string;
  goalTwo: string;
  goalThree: string;
  biggestObstacle: string;
  hasWorkOrSchool: boolean;
  hasTransportation: boolean;
  hasGymAccess: boolean;
  hasQuietSpace: boolean;
  hasFoodControl: boolean;
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

const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const TODAY_PROGRESS_DATE_KEY = "lit_today_progress_date";
const PROFILE_KEY = "lit_user_profile";
const CHECKIN_KEY = "lit_latest_checkin";
const LATEST_PRE_SLEEP_INTENTION_KEY = "lit_latest_pre_sleep_intention";

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const rawEnergy = Array.isArray(params.energy) ? params.energy[0] : params.energy;

  const [savedMode, setSavedMode] = useState<"Recovery" | "Progress">("Progress");
  const [savedEnergy, setSavedEnergy] = useState(78);

  const mode = rawMode === "Recovery" || rawMode === "Progress" ? rawMode : savedMode;
  const energyYield = rawEnergy ? Number(rawEnergy) : savedEnergy;
  const isRecovery = mode === "Recovery";

  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [latestIntention, setLatestIntention] = useState<PreSleepIntention | null>(null);

  useEffect(() => {
    loadCompletedQuests();
    loadProfile();
    loadLatestCheckIn();
    loadLatestIntention();
  }, []);

  async function lightHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function mediumHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function navigateWithHaptic(path: any) {
    await lightHaptic();
    router.push(path);
  }

  async function loadProfile() {
    const saved = await AsyncStorage.getItem(PROFILE_KEY);
    if (saved) setProfile(JSON.parse(saved));
  }

  async function loadCompletedQuests() {
    const today = getTodayKey();

    const savedDate = await AsyncStorage.getItem(TODAY_PROGRESS_DATE_KEY);
    const savedQuests = await AsyncStorage.getItem(COMPLETED_QUESTS_KEY);

    if (savedDate !== today) {
      setCompletedQuests([]);
      await AsyncStorage.setItem(TODAY_PROGRESS_DATE_KEY, today);
      await AsyncStorage.setItem(COMPLETED_QUESTS_KEY, JSON.stringify([]));
      return;
    }

    if (savedQuests) {
      setCompletedQuests(JSON.parse(savedQuests));
    }
  }

  async function loadLatestCheckIn() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);

    if (saved) {
      const checkIn = JSON.parse(saved);

      if (checkIn.mode === "Recovery" || checkIn.mode === "Progress") {
        setSavedMode(checkIn.mode);
      }

      if (typeof checkIn.energy === "number") {
        setSavedEnergy(checkIn.energy);
      }
    }
  }

  async function loadLatestIntention() {
    const saved = await AsyncStorage.getItem(LATEST_PRE_SLEEP_INTENTION_KEY);

    if (saved) {
      setLatestIntention(JSON.parse(saved));
    }
  }

  async function saveCompletedQuests(nextCompleted: string[]) {
    const today = getTodayKey();

    setCompletedQuests(nextCompleted);
    await AsyncStorage.setItem(TODAY_PROGRESS_DATE_KEY, today);
    await AsyncStorage.setItem(COMPLETED_QUESTS_KEY, JSON.stringify(nextCompleted));
  }

  async function toggleQuest(title: string) {
    const isAlreadyComplete = completedQuests.includes(title);

    const nextCompleted = isAlreadyComplete
      ? completedQuests.filter((item) => item !== title)
      : [...completedQuests, title];

    if (isAlreadyComplete) {
      await lightHaptic();
    } else {
      await successHaptic();
    }

    await saveCompletedQuests(nextCompleted);
  }

  async function resetTodayProgress() {
    await mediumHaptic();
    await saveCompletedQuests([]);
  }

  const displayName = profile?.name?.trim() || "there";
  const topGoal = profile?.goalOne?.trim() || "your top goal";
  const secondGoal = profile?.goalTwo?.trim() || "your next goal";
  const thirdGoal = profile?.goalThree?.trim() || "your future";
  const progressMeaning = profile?.progressMeaning?.trim();

  function generateQuests(): Quest[] {
    if (isRecovery) {
      return [
        {
          title: "Recovery request",
          type: "Recovery",
          steps: 1,
        },
        {
          title: `One tiny step toward: ${topGoal}`,
          type: "Truth",
          steps: 1,
        },
        {
          title: "Prepare for better sleep tonight",
          type: "Rest",
          steps: 1,
        },
      ];
    }

    const progressQuests: Quest[] = [
      {
        title: "Morning journal",
        type: "Mind",
        steps: 1,
      },
      {
        title: `Make progress toward: ${topGoal}`,
        type: "Future",
        steps: 2,
      },
      {
        title: `Small step for: ${secondGoal}`,
        type: "Growth",
        steps: 2,
      },
    ];

    if (profile?.hasQuietSpace) {
      progressQuests.push({
        title: "Complete 1 focus block in your quiet space",
        type: "Focus",
        steps: 2,
      });
    } else {
      progressQuests.push({
        title: "Create a simple focus space where you are",
        type: "Focus",
        steps: 2,
      });
    }

    if (profile?.hasGymAccess) {
      progressQuests.push({
        title: "Movement quest: gym or workout",
        type: "Body",
        steps: 2,
      });
    } else {
      progressQuests.push({
        title: "Movement quest: walk, stretch, or home workout",
        type: "Body",
        steps: 2,
      });
    }

    return progressQuests;
  }

  const quests = generateQuests();

  const completedSteps = quests
    .filter((quest) => completedQuests.includes(quest.title))
    .reduce((total, quest) => total + quest.steps, 0);

  const completedVisibleQuests = quests.filter((quest) =>
    completedQuests.includes(quest.title)
  ).length;

  const flameLabel =
    energyYield >= 75 ? "Bright Flame" : energyYield >= 45 ? "Steady Flame" : "Low Flame";

  return (
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : styles.progressScreen}
      contentContainerStyle={styles.container}
    >
      <View style={isRecovery ? styles.recoveryHero : styles.progressHero}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.modeIcon}>{isRecovery ? "🌙" : "☀️"}</Text>
            <Text style={styles.heroTitle}>{mode}</Text>
            <Text style={styles.heroSubtitle}>
              {isRecovery ? "Protect your flame." : "Spend your flame wisely."}
            </Text>
          </View>

          <View style={isRecovery ? styles.recoveryLunaOrb : styles.progressLunaOrb}>
            <Text style={styles.lunaFace}>{isRecovery ? "😴" : "🙂"}</Text>
          </View>
        </View>

        <View style={styles.brandRow}>
          <View>
            <Text style={styles.logo}>lit</Text>
            <Text style={styles.subtitle}>Living in Truth</Text>
          </View>
          <Text style={styles.spark}>🔥</Text>
        </View>
      </View>

      <View style={styles.actionPanel}>
        <Text style={styles.actionPanelTitle}>Start Today</Text>

        <TouchableOpacity
          style={styles.primaryActionButton}
          onPress={() => navigateWithHaptic("/sleep-checkin")}
        >
          <Text style={styles.primaryActionIcon}>🔥</Text>
          <Text style={styles.primaryActionText}>Morning Check-In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.goldActionButton}
          onPress={() => navigateWithHaptic("/onboarding")}
        >
          <Text style={styles.primaryActionIcon}>🧭</Text>
          <Text style={styles.goldActionText}>Set My Path</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionPanel}>
        <Text style={styles.actionPanelTitle}>Today Plan</Text>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.smallActionButton}
            onPress={() => navigateWithHaptic("/tomorrow-queue")}
          >
            <Text style={styles.smallActionIcon}>📌</Text>
            <Text style={styles.smallActionText}>Tomorrow Queue</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.smallActionButtonGreen}
            onPress={() => navigateWithHaptic("/weekly-summary")}
          >
            <Text style={styles.smallActionIcon}>📊</Text>
            <Text style={styles.smallActionText}>Weekly Summary</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actionPanel}>
        <Text style={styles.actionPanelTitle}>Mind & Sleep</Text>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.smallActionButtonPurple}
            onPress={() => navigateWithHaptic("/journal")}
          >
            <Text style={styles.smallActionIcon}>📓</Text>
            <Text style={styles.smallActionText}>Journal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.smallActionButtonPurple}
            onPress={() => navigateWithHaptic("/awareness-check")}
          >
            <Text style={styles.smallActionIcon}>🧠</Text>
            <Text style={styles.smallActionText}>Awareness Check</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionGridSecondRow}>
          <TouchableOpacity
            style={styles.smallActionButtonNight}
            onPress={() => navigateWithHaptic("/pre-sleep-intention")}
          >
            <Text style={styles.smallActionIcon}>🌙</Text>
            <Text style={styles.smallActionText}>Pre-Sleep Intention</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.smallActionButtonNight}
            onPress={() => navigateWithHaptic("/morning-intention-reflection")}
          >
            <Text style={styles.smallActionIcon}>☀️</Text>
            <Text style={styles.smallActionText}>Morning Reflection</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actionPanel}>
        <Text style={styles.actionPanelTitle}>Growth</Text>

        <TouchableOpacity
          style={styles.fullActionButtonPurple}
          onPress={() => navigateWithHaptic("/next-chapter")}
        >
          <Text style={styles.smallActionIcon}>🌱</Text>
          <Text style={styles.fullActionText}>Next Chapter</Text>
        </TouchableOpacity>
      </View>

      {latestIntention ? (
        <View style={styles.intentionPreviewCard}>
          <Text style={styles.intentionPreviewLabel}>Last night’s intention</Text>
          <Text style={styles.intentionPreviewText}>{latestIntention.intention}</Text>

          {latestIntention.firstSmallAction ? (
            <Text style={styles.intentionPreviewAction}>
              First small action: {latestIntention.firstSmallAction}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.intentionReflectButton}
            onPress={() => navigateWithHaptic("/morning-intention-reflection")}
          >
            <Text style={styles.intentionReflectButtonText}>Reflect This Morning</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={isRecovery ? styles.recoveryLunaCard : styles.progressLunaCard}>
        <Text style={styles.lunaName}>
          {isRecovery ? "🌙 Luna is in Recovery" : "☀️ Luna is in Progress"}
        </Text>
        <Text style={styles.lunaText}>
          {isRecovery
            ? `Hey ${displayName}, today is not about proving yourself. Let’s protect your energy and take one honest step toward ${topGoal}.`
            : `Hey ${displayName}, your energy is available today. Let’s use it on ${topGoal} in a way that fits your real life.`}
        </Text>
      </View>

      <View style={isRecovery ? styles.recoveryEnergyCard : styles.progressEnergyCard}>
        <View>
          <Text style={styles.cardLabel}>Energy Yield</Text>
          <Text style={styles.energy}>🔥 {energyYield}/100</Text>
          <Text style={styles.flameLabel}>{flameLabel}</Text>
        </View>

        <View style={styles.energyBadge}>
          <Text style={styles.energyBadgeText}>{mode}</Text>
        </View>
      </View>

      {progressMeaning ? (
        <View style={styles.truthCard}>
          <Text style={styles.truthLabel}>Your definition of progress</Text>
          <Text style={styles.truthText}>{progressMeaning}</Text>
        </View>
      ) : null}

      <View style={styles.goalsCard}>
        <Text style={styles.cardLabel}>Your Current Path</Text>
        <Text style={styles.goalText}>1. {topGoal}</Text>
        <Text style={styles.goalText}>2. {secondGoal}</Text>
        <Text style={styles.goalText}>3. {thirdGoal}</Text>
      </View>

      <Text style={isRecovery ? styles.recoverySectionTitle : styles.progressSectionTitle}>
        Today’s Quests
      </Text>

      {quests.map((quest, index) => {
        const isComplete = completedQuests.includes(quest.title);

        return (
          <View
            key={index}
            style={
              isComplete
                ? styles.completedQuestCard
                : isRecovery
                ? styles.recoveryQuestCard
                : styles.progressQuestCard
            }
          >
            <TouchableOpacity style={styles.questMain} onPress={() => toggleQuest(quest.title)}>
              <View style={styles.questLeft}>
                <Text style={styles.checkbox}>{isComplete ? "✅" : "⬜"}</Text>
                <View style={styles.questTextBlock}>
                  <Text style={isComplete ? styles.completedQuestText : styles.questTitle}>
                    {quest.title}
                  </Text>
                  <Text style={styles.questType}>{quest.type}</Text>
                </View>
              </View>

              <View style={styles.stepPill}>
                <Text style={styles.steps}>+{quest.steps}</Text>
              </View>
            </TouchableOpacity>

            {!isComplete && (
              <Link
                href={{
                  pathname: "/reflection",
                  params: { quest: quest.title },
                }}
                asChild
              >
                <TouchableOpacity style={styles.reflectButton} onPress={lightHaptic}>
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
          Completed quests: {completedVisibleQuests}/{quests.length}
        </Text>

        <TouchableOpacity style={styles.resetButton} onPress={resetTodayProgress}>
          <Text style={styles.resetButtonText}>Reset Today Plan</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  progressScreen: {
    flex: 1,
    backgroundColor: "#F7EBC8",
  },
  recoveryScreen: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  container: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  progressHero: {
    backgroundColor: "#FDE68A",
    borderColor: "#F59E0B",
    borderWidth: 3,
    borderRadius: 34,
    padding: 22,
    marginBottom: 18,
  },
  recoveryHero: {
    backgroundColor: "#1E1B4B",
    borderColor: "#8B5CF6",
    borderWidth: 3,
    borderRadius: 34,
    padding: 22,
    marginBottom: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 26,
  },
  modeIcon: {
    fontSize: 42,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroSubtitle: {
    fontSize: 15,
    color: "#F9FAFB",
    fontWeight: "800",
    marginTop: 3,
  },
  progressLunaOrb: {
    height: 86,
    width: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    backgroundColor: "#FEF3C7",
    borderColor: "#FBBF24",
  },
  recoveryLunaOrb: {
    height: 86,
    width: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    backgroundColor: "#312E81",
    borderColor: "#C4B5FD",
  },
  lunaFace: {
    fontSize: 42,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  logo: {
    fontSize: 58,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -3,
  },
  subtitle: {
    fontSize: 16,
    color: "#F9FAFB",
    fontWeight: "800",
    marginTop: -4,
  },
  spark: {
    fontSize: 38,
  },
  actionPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  actionPanelTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#374151",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  primaryActionButton: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  primaryActionIcon: {
    fontSize: 24,
    marginBottom: 5,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  goldActionButton: {
    backgroundColor: "#FBBF24",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#111827",
  },
  goldActionText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
  },
  actionGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionGridSecondRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  smallActionButton: {
    width: "48%",
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  smallActionButtonGreen: {
    width: "48%",
    backgroundColor: "#F0FDF4",
    padding: 14,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#22C55E",
  },
  smallActionButtonPurple: {
    width: "48%",
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  smallActionButtonNight: {
    width: "48%",
    backgroundColor: "#EEF2FF",
    padding: 14,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  fullActionButtonPurple: {
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  smallActionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  smallActionText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  fullActionText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  intentionPreviewCard: {
    backgroundColor: "#EEF2FF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  intentionPreviewLabel: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
    textTransform: "uppercase",
    fontWeight: "900",
  },
  intentionPreviewText: {
    fontSize: 20,
    lineHeight: 28,
    color: "#111827",
    fontWeight: "900",
    marginBottom: 8,
  },
  intentionPreviewAction: {
    fontSize: 15,
    lineHeight: 22,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 14,
  },
  intentionReflectButton: {
    backgroundColor: "#312E81",
    padding: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  intentionReflectButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  progressLunaCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F59E0B",
    borderWidth: 2,
    borderRadius: 26,
    padding: 20,
    marginBottom: 18,
  },
  recoveryLunaCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 26,
    padding: 20,
    marginBottom: 18,
  },
  lunaName: {
    fontSize: 21,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  lunaText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
    fontWeight: "600",
  },
  progressEnergyCard: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
    borderWidth: 3,
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recoveryEnergyCard: {
    backgroundColor: "#312E81",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLabel: {
    fontSize: 13,
    color: "#9CA3AF",
    marginBottom: 8,
    textTransform: "uppercase",
    fontWeight: "900",
  },
  energy: {
    fontSize: 38,
    fontWeight: "900",
    color: "#FBBF24",
  },
  flameLabel: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  energyBadge: {
    backgroundColor: "#374151",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  energyBadgeText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
  },
  truthCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  truthLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  truthText: {
    fontSize: 16,
    lineHeight: 23,
    color: "#111827",
    fontWeight: "800",
  },
  goalsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  goalText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#111827",
    fontWeight: "800",
    marginBottom: 4,
  },
  progressSectionTitle: {
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 14,
    color: "#1F2937",
  },
  recoverySectionTitle: {
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 14,
    color: "#F9FAFB",
  },
  progressQuestCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 2,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  recoveryQuestCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  completedQuestCard: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
    borderWidth: 2,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
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
  },
  checkbox: {
    fontSize: 22,
    marginRight: 12,
  },
  questTextBlock: {
    flex: 1,
  },
  questTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#111827",
  },
  completedQuestText: {
    fontSize: 17,
    fontWeight: "900",
    textDecorationLine: "line-through",
    color: "#166534",
  },
  questType: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    fontWeight: "700",
  },
  stepPill: {
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#22C55E",
  },
  steps: {
    fontSize: 15,
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
    borderRadius: 26,
    padding: 20,
    marginTop: 14,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  rank: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
  },
  smallText: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 6,
    fontWeight: "700",
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
