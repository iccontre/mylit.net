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
  longTermDream?: string;
  dreamCategory?: string;
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
  const [profileChecked, setProfileChecked] = useState(false);
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

    if (!saved) {
      setProfileChecked(true);
      router.replace("/onboarding");
      return;
    }

    const parsed = JSON.parse(saved) as UserProfile;
    setProfile(parsed);
    setProfileChecked(true);
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
  const longTermDream = profile?.longTermDream?.trim();
  const dreamCategory = profile?.dreamCategory?.trim();

  function getCategoryQuests(category: string, modeType: "Recovery" | "Progress"): Quest[] {
    const normalized = category || "Purpose";

    const map: Record<string, { Recovery: string[]; Progress: string[] }> = {
      Health: {
        Progress: ["Do 15 minutes of movement", "Choose one better nutrition action", "Protect your sleep window tonight"],
        Recovery: ["Stretch for 5 calm minutes", "Choose one easy healthy meal", "Rest and protect sleep tonight"],
      },
      Money: {
        Progress: ["Research one income opportunity", "Spend 15 minutes building a useful skill", "Track one spending or saving decision"],
        Recovery: ["Write one small money step for tomorrow", "Review your goal without pressure", "Protect sleep so you can act with more energy"],
      },
      Mind: {
        Progress: ["Journal one honest page", "Notice one thought pattern today", "Pause before one reaction"],
        Recovery: ["Write a gentle brain-dump", "Name one feeling without judging it", "Take 3 deep breaths before your next task"],
      },
      "Friends / Connection": {
        Progress: ["Send one message to someone", "Start one small conversation", "Plan one social step"],
        Recovery: ["Reflect on one person you want to reconnect with", "Send a low-pressure message if it feels realistic", "Journal about what makes connection hard"],
      },
      "School / Work": {
        Progress: ["Complete one focus block", "Plan your top assignment early", "Clear one unfinished task"],
        Recovery: ["Pick one simple work/school priority", "Set up materials for tomorrow", "Rest so your focus can recover"],
      },
      Confidence: {
        Progress: ["Keep one promise to yourself", "Do one uncomfortable but safe action", "Write down one small win"],
        Recovery: ["Choose one tiny promise you can keep", "Speak kindly to yourself once today", "Reflect on a moment you handled well"],
      },
      Creativity: {
        Progress: ["Work on one creative project", "Capture and save one idea", "Make 20 minutes for creative practice"],
        Recovery: ["Open your project for 5 minutes", "Collect one inspiration", "Rest so your creativity can recharge"],
      },
      Sleep: {
        Progress: ["Keep a consistent sleep target", "Reduce phone use before bed", "Plan a calm wind-down tonight"],
        Recovery: ["Take one short rest break", "Use a low-stimulation wind-down", "Protect your bedtime tonight"],
      },
      "Phone Use": {
        Progress: ["Notice one screen-time trigger", "Replace one scroll with a useful action", "Create one phone-free focus block"],
        Recovery: ["Use one short phone break", "Move distracting apps out of reach", "Journal what pulls you into scrolling"],
      },
      Purpose: {
        Progress: ["Define what progress means today", "Take one honest step daily", "Reflect on what feels meaningful"],
        Recovery: ["Write one reason your path matters", "Choose one tiny step for tomorrow", "Rest and reconnect with your why"],
      },
    };

    const categorySet = map[normalized] ?? map.Purpose;
    return categorySet[modeType].map((title) => ({ title, type: normalized, steps: 1 }));
  }

  function generateQuests(): Quest[] {
    const category = profile?.dreamCategory?.trim() || "Purpose";
    const questMode: "Recovery" | "Progress" = isRecovery ? "Recovery" : "Progress";
    const baseQuests = getCategoryQuests(category, questMode);

    const goalQuests: Quest[] = [
      { title: `Goal step: ${topGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${secondGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${thirdGoal}`, type: "Goal", steps: 1 },
    ];

    const resourceQuest: Quest = profile?.hasQuietSpace
      ? { title: "Use your quiet space for one focus block", type: "Focus", steps: 1 }
      : { title: "Create a simple focus corner for 10 minutes", type: "Focus", steps: 1 };

    const movementQuest: Quest = profile?.hasGymAccess
      ? { title: "Movement option: gym or structured workout", type: "Body", steps: 1 }
      : { title: "Movement option: walk, stretch, or home workout", type: "Body", steps: 1 };

    const transportQuest: Quest = profile?.hasTransportation
      ? { title: "Plan one out-of-home step you can reach", type: "Logistics", steps: 1 }
      : { title: "Plan one step you can do from home", type: "Logistics", steps: 1 };

    return [...baseQuests, ...goalQuests, resourceQuest, movementQuest, transportQuest];
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

  if (!profileChecked) {
    return null;
  }

  return (
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : styles.progressScreen}
      contentContainerStyle={styles.container}
    >
      <View style={isRecovery ? styles.recoveryHero : styles.progressHero}>
        <Text style={styles.realmLabel}>Today’s Realm</Text>

        <View style={styles.heroTopRow}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroTitle}>{isRecovery ? "Recovery Route" : "Progress Route"}</Text>
            <Text style={styles.heroLine}>
              {isRecovery
                ? "Moonlit route. Protect your flame."
                : "Sunlit route. Spend your flame wisely."}
            </Text>
          </View>

          <View style={isRecovery ? styles.recoveryGuideOrb : styles.progressGuideOrb}>
            <Text style={styles.guideOrbName}>Luna</Text>
            <Text style={styles.guideOrbRole}>{isRecovery ? "Calm Guide" : "Path Guide"}</Text>
          </View>
        </View>

        <View style={styles.heroFooterRow}>
          <Text style={styles.logo}>lit</Text>
          <View style={styles.realmPill}>
            <Text style={styles.realmPillText}>{isRecovery ? "Recovery Route active" : "Progress Route active"}</Text>
          </View>
        </View>
      </View>

      <View style={isRecovery ? styles.recoveryEnergyCard : styles.progressEnergyCard}>
        <View style={styles.energyLeft}>
          <Text style={styles.energyLabel}>Energy Reserve</Text>
          <Text style={styles.energyValue}>🔥 {energyYield}/100</Text>
          <Text style={styles.flameLabel}>{flameLabel}</Text>
          <Text style={styles.energyHint}>
            {isRecovery
              ? "Use your remaining energy carefully."
              : "Spend your energy on what matters most."}
          </Text>
        </View>

        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>{mode}</Text>
        </View>
      </View>

      <View style={isRecovery ? styles.recoveryBriefingCard : styles.progressBriefingCard}>
        <Text style={styles.briefingTitle}>Luna’s Briefing</Text>
        <Text style={styles.briefingText}>
          {isRecovery
            ? "Recovery is still progress. Today’s job is to protect your energy and keep one promise to yourself."
            : "Progress is personal. Today’s job is to spend your energy on the path that matters to you."}
        </Text>
        <Text style={styles.briefingGoal}>Main path: {topGoal}</Text>
      </View>

      {latestIntention ? (
        <View style={styles.signalCard}>
          <Text style={styles.signalTitle}>Night Signal</Text>
          <Text style={styles.signalHint}>
            Last night’s note is still here. Check what carried into the morning.
          </Text>
          <Text style={styles.signalText}>{latestIntention.intention}</Text>

          {latestIntention.firstSmallAction ? (
            <Text style={styles.signalAction}>
              First small action: {latestIntention.firstSmallAction}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.signalButton}
            onPress={() => navigateWithHaptic("/morning-intention-reflection")}
          >
            <Text style={styles.signalButtonText}>Reflect This Morning</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={isRecovery ? styles.recoveryPathCard : styles.progressPathCard}>
        <Text style={styles.pathTitle}>Path Map</Text>

        {dreamCategory ? (
          <View style={styles.pathBadge}>
            <Text style={styles.pathBadgeText}>Category: {dreamCategory}</Text>
          </View>
        ) : null}

        {longTermDream ? <Text style={styles.pathDream}>Long-term dream: {longTermDream}</Text> : null}

        <View style={styles.pathStepRow}>
          <View style={styles.pathNumber}><Text style={styles.pathNumberText}>1</Text></View>
          <Text style={styles.pathStepText}>{topGoal}</Text>
        </View>
        <View style={styles.pathStepRow}>
          <View style={styles.pathNumber}><Text style={styles.pathNumberText}>2</Text></View>
          <Text style={styles.pathStepText}>{secondGoal}</Text>
        </View>
        <View style={styles.pathStepRow}>
          <View style={styles.pathNumber}><Text style={styles.pathNumberText}>3</Text></View>
          <Text style={styles.pathStepText}>{thirdGoal}</Text>
        </View>
      </View>

      {progressMeaning ? (
        <View style={styles.meaningCard}>
          <Text style={styles.meaningLabel}>Path Note</Text>
          <Text style={styles.meaningText}>{progressMeaning}</Text>
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Daily Loadout</Text>
        <View style={styles.tileRow}>
          <TouchableOpacity
            style={[styles.tileHalf, isRecovery ? styles.tileRecoveryAccent : styles.tileProgressAccent]}
            onPress={() => navigateWithHaptic("/sleep-checkin")}
          >
            <Text style={styles.tileTitle}>Morning Check-In</Text>
            <Text style={styles.tileSubtitle}>Set today’s energy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tileHalf, isRecovery ? styles.tileRecoveryAccent : styles.tileProgressAccent]}
            onPress={() => navigateWithHaptic("/onboarding")}
          >
            <Text style={styles.tileTitle}>Set My Path</Text>
            <Text style={styles.tileSubtitle}>Choose your dream</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Planning</Text>
        <View style={styles.tileRow}>
          <TouchableOpacity
            style={[styles.tileHalf, styles.tileGold]}
            onPress={() => navigateWithHaptic("/tomorrow-queue")}
          >
            <Text style={styles.tileTitle}>Tomorrow Queue</Text>
            <Text style={styles.tileSubtitle}>Save a future move</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tileHalf, styles.tileGreen]}
            onPress={() => navigateWithHaptic("/weekly-summary")}
          >
            <Text style={styles.tileTitle}>Weekly Summary</Text>
            <Text style={styles.tileSubtitle}>Read the pattern</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Mind & Sleep</Text>
        <View style={styles.tileRow}>
          <TouchableOpacity
            style={[styles.tileHalf, styles.tilePurple]}
            onPress={() => navigateWithHaptic("/journal")}
          >
            <Text style={styles.tileTitle}>Journal</Text>
            <Text style={styles.tileSubtitle}>Log the truth</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tileHalf, styles.tilePurple]}
            onPress={() => navigateWithHaptic("/awareness-check")}
          >
            <Text style={styles.tileTitle}>Awareness Check</Text>
            <Text style={styles.tileSubtitle}>Notice attention</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tileRowSecond}>
          <TouchableOpacity
            style={[styles.tileHalf, styles.tileNight]}
            onPress={() => navigateWithHaptic("/pre-sleep-intention")}
          >
            <Text style={styles.tileTitle}>Pre-Sleep Intention</Text>
            <Text style={styles.tileSubtitle}>Set tomorrow’s signal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tileHalf, styles.tileNight]}
            onPress={() => navigateWithHaptic("/morning-intention-reflection")}
          >
            <Text style={styles.tileTitle}>Morning Reflection</Text>
            <Text style={styles.tileSubtitle}>Check the signal</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Growth</Text>
        <TouchableOpacity
          style={[styles.tileFull, styles.tileGrowth]}
          onPress={() => navigateWithHaptic("/next-chapter")}
        >
          <Text style={styles.tileTitle}>Next Chapter</Text>
          <Text style={styles.tileSubtitle}>Change the path</Text>
        </TouchableOpacity>
      </View>

      <Text style={isRecovery ? styles.questTitleRecovery : styles.questTitleProgress}>
        Quest Board
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
                  <Text style={isComplete ? styles.completedQuestText : styles.questText}>
                    {quest.title}
                  </Text>
                  <View style={styles.questTypeBadge}>
                    <Text style={styles.questTypeText}>{quest.type}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.rewardPill}>
                <Text style={styles.rewardText}>+{quest.steps} steps</Text>
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
                  <Text style={styles.reflectButtonText}>Missed? Reflect</Text>
                </TouchableOpacity>
              </Link>
            )}
          </View>
        );
      })}

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Rank & Steps</Text>
        <Text style={styles.rank}>Rank: {completedSteps >= 5 ? "Builder" : "Wanderer"}</Text>
        <Text style={styles.summaryText}>Steps earned today: {completedSteps}</Text>
        <Text style={styles.summaryText}>
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
    paddingTop: 56,
    paddingBottom: 40,
  },

  progressHero: {
    backgroundColor: "#FDE68A",
    borderColor: "#F59E0B",
    borderWidth: 3,
    borderRadius: 28,
    padding: 18,
    marginBottom: 14,
  },
  recoveryHero: {
    backgroundColor: "#1E1B4B",
    borderColor: "#8B5CF6",
    borderWidth: 3,
    borderRadius: 28,
    padding: 18,
    marginBottom: 14,
  },
  realmLabel: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    color: "#F9FAFB",
    marginBottom: 10,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  heroLeft: {
    flex: 1,
    marginRight: 10,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  heroLine: {
    fontSize: 14,
    color: "#E5E7EB",
    fontWeight: "700",
    lineHeight: 20,
  },
  progressGuideOrb: {
    width: 108,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  recoveryGuideOrb: {
    width: 108,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#A78BFA",
    backgroundColor: "#312E81",
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  guideOrbName: {
    fontSize: 12,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  guideOrbRole: {
    fontSize: 11,
    fontWeight: "800",
    color: "#E5E7EB",
    textAlign: "center",
  },
  heroFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    fontSize: 46,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -2,
  },
  realmPill: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  realmPillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },

  progressEnergyCard: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
    borderWidth: 3,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recoveryEnergyCard: {
    backgroundColor: "#312E81",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  energyLeft: {
    flex: 1,
    marginRight: 12,
  },
  energyLabel: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    color: "#D1D5DB",
    marginBottom: 6,
  },
  energyValue: {
    fontSize: 34,
    fontWeight: "900",
    color: "#FBBF24",
  },
  flameLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#F9FAFB",
    marginTop: 2,
    marginBottom: 4,
  },
  energyHint: {
    fontSize: 13,
    color: "#E5E7EB",
    fontWeight: "700",
  },
  modeBadge: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modeBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  progressBriefingCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  recoveryBriefingCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  briefingTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  briefingText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 8,
  },
  briefingGoal: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "800",
  },

  signalCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#818CF8",
    borderWidth: 2,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  signalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  signalHint: {
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "700",
    marginBottom: 8,
    lineHeight: 19,
  },
  signalText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "800",
    lineHeight: 23,
    marginBottom: 8,
  },
  signalAction: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 12,
  },
  signalButton: {
    backgroundColor: "#312E81",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  signalButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  progressPathCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F59E0B",
    borderWidth: 2,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  recoveryPathCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#8B5CF6",
    borderWidth: 2,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  pathTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  pathBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  pathBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  pathDream: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 8,
    lineHeight: 20,
  },
  pathStepRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  pathNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  pathNumberText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  pathStepText: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    fontWeight: "800",
  },

  meaningCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5D39A",
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  meaningLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  meaningText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#374151",
    fontWeight: "700",
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5D39A",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 10,
  },
  tileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tileRowSecond: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  tileHalf: {
    width: "48%",
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    minHeight: 94,
  },
  tileFull: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
  },
  tileRecoveryAccent: {
    backgroundColor: "#EEF2FF",
    borderColor: "#8B5CF6",
  },
  tileProgressAccent: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FBBF24",
  },
  tileGold: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FBBF24",
  },
  tileGreen: {
    backgroundColor: "#F0FDF4",
    borderColor: "#22C55E",
  },
  tilePurple: {
    backgroundColor: "#F9FAFB",
    borderColor: "#A78BFA",
  },
  tileNight: {
    backgroundColor: "#EEF2FF",
    borderColor: "#818CF8",
  },
  tileGrowth: {
    backgroundColor: "#F9FAFB",
    borderColor: "#A78BFA",
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  tileSubtitle: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "700",
    lineHeight: 18,
  },

  questTitleProgress: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 10,
    marginTop: 2,
  },
  questTitleRecovery: {
    fontSize: 24,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 10,
    marginTop: 2,
  },
  progressQuestCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5D39A",
    borderWidth: 2,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
  },
  recoveryQuestCard: {
    backgroundColor: "#1E1B4B",
    borderColor: "#8B5CF6",
    borderWidth: 2,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
  },
  completedQuestCard: {
    backgroundColor: "#ECFDF5",
    borderColor: "#34D399",
    borderWidth: 2,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
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
    marginRight: 10,
  },
  questTextBlock: {
    flex: 1,
  },
  questText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 6,
  },
  completedQuestText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#065F46",
    marginBottom: 6,
    textDecorationLine: "line-through",
  },
  questTypeBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: "#FFFFFF",
  },
  questTypeText: {
    fontSize: 11,
    color: "#374151",
    fontWeight: "800",
    textTransform: "uppercase",
  },
  rewardPill: {
    marginLeft: 10,
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: "#FBBF24",
  },
  rewardText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#111827",
  },
  reflectButton: {
    marginTop: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  reflectButtonText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "800",
  },

  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5D39A",
    borderWidth: 2,
    borderRadius: 20,
    padding: 16,
    marginTop: 6,
  },
  summaryTitle: {
    fontSize: 20,
    color: "#111827",
    fontWeight: "900",
    marginBottom: 8,
  },
  rank: {
    fontSize: 20,
    color: "#111827",
    fontWeight: "900",
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 3,
  },
  resetButton: {
    marginTop: 12,
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  resetButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});