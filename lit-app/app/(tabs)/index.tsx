import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Quest = {
  title: string;
  type: string;
  steps: number;
  description?: string;
};

type CheckIn = {
  id: string;
  hours: string;
  mood: string;
  stress: string;
  energy: number;
  mode: "Recovery" | "Progress";
  createdAt: string;
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

type ModeState = "Recovery" | "Progress" | "Neutral";

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

  const hasRouteCheckIn =
    (rawMode === "Recovery" || rawMode === "Progress") &&
    rawEnergy !== undefined &&
    rawEnergy !== null &&
    rawEnergy !== "";

  const routeEnergyNumber = hasRouteCheckIn ? Number(rawEnergy) : NaN;
  const hasRouteEnergy = hasRouteCheckIn && !Number.isNaN(routeEnergyNumber);

  const [savedMode, setSavedMode] = useState<"Recovery" | "Progress">("Recovery");
  const [savedEnergy, setSavedEnergy] = useState(0);
  const [hasSavedCheckIn, setHasSavedCheckIn] = useState(false);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);

  const hasEnergyData = hasRouteEnergy || hasSavedCheckIn;

  const currentMode: ModeState = hasEnergyData
    ? rawMode === "Recovery" || rawMode === "Progress"
      ? rawMode
      : savedMode
    : "Neutral";

  const isRecovery = currentMode === "Recovery";
  const isProgress = currentMode === "Progress";
  const isNeutral = currentMode === "Neutral";

  const energyYield = hasRouteEnergy ? routeEnergyNumber : savedEnergy;

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

  useEffect(() => {
    if (hasRouteEnergy && (rawMode === "Recovery" || rawMode === "Progress")) {
      setSavedMode(rawMode);
      setSavedEnergy(routeEnergyNumber);
      setHasSavedCheckIn(true);
    }
  }, [hasRouteEnergy, rawMode, routeEnergyNumber]);

  async function lightHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }

  async function mediumHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
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

    if (!saved) {
      setHasSavedCheckIn(false);
      setLatestCheckIn(null);
      return;
    }

    const checkIn = JSON.parse(saved);
    const validMode = checkIn.mode === "Recovery" || checkIn.mode === "Progress";
    const validEnergy = typeof checkIn.energy === "number";

    if (validMode && validEnergy) {
      setSavedMode(checkIn.mode);
      setSavedEnergy(checkIn.energy);
      setHasSavedCheckIn(true);
      setLatestCheckIn(checkIn as CheckIn);
    } else {
      setHasSavedCheckIn(false);
      setLatestCheckIn(null);
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

  const topGoal = profile?.goalOne?.trim() || "your top goal";
  const secondGoal = profile?.goalTwo?.trim() || "your next goal";
  const thirdGoal = profile?.goalThree?.trim() || "your future";
  const longTermDream = profile?.longTermDream?.trim();
  const dreamCategory = profile?.dreamCategory?.trim();

  const hoursSlept = latestCheckIn ? Number(latestCheckIn.hours) : null;
  const shouldSuggestNap =
    hasEnergyData &&
    hoursSlept !== null &&
    !Number.isNaN(hoursSlept) &&
    hoursSlept < 7;

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
    const napQuest: Quest = {
      title: "Take a recovery nap",
      type: "Recovery",
      steps: 1,
      description: "Aim for 30–60 minutes if your schedule allows.",
    };

    if (isNeutral) {
      const baseNeutral: Quest[] = [
        { title: "Complete Morning Check-In", type: "Start", steps: 1 },
        { title: "Review your current path", type: "Direction", steps: 1 },
        { title: "Choose one small action for today", type: "Plan", steps: 1 },
      ];

      if (shouldSuggestNap) {
        return [baseNeutral[0], napQuest, baseNeutral[1], baseNeutral[2]];
      }

      return baseNeutral;
    }

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

    const merged = [...baseQuests, ...goalQuests, resourceQuest, movementQuest, transportQuest];

    if (shouldSuggestNap) {
      return [napQuest, ...merged];
    }

    return merged;
  }

  const quests = generateQuests();

  const completedSteps = quests
    .filter((quest) => completedQuests.includes(quest.title))
    .reduce((total, quest) => total + quest.steps, 0);

  const completedVisibleQuests = quests.filter((quest) =>
    completedQuests.includes(quest.title)
  ).length;

  const flameLabel = useMemo(() => {
    if (!hasEnergyData) return "Check-in needed";
    if (energyYield >= 75) return "Bright Flame";
    if (energyYield >= 45) return "Steady Flame";
    return "Low Flame";
  }, [hasEnergyData, energyYield]);

  const heroStatusLine = useMemo(() => {
    if (isNeutral) return "Morning Check-In needed.";
    if (isRecovery) return "Recovery mode is active.";
    return "Progress mode is active.";
  }, [isNeutral, isRecovery]);

  const heroInstructionLine = useMemo(() => {
    if (isNeutral) return "Complete a Morning Check-In to calculate your Energy Reserve.";
    return "Choose your next move from today’s dashboard.";
  }, [isNeutral]);

  if (!profileChecked) {
    return null;
  }

  return (
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : isProgress ? styles.progressScreen : styles.neutralScreen}
      contentContainerStyle={styles.container}
    >
      <View style={isRecovery ? styles.recoveryHero : isProgress ? styles.progressHero : styles.neutralHero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroLeft}>
            <Text style={styles.logo}>lit</Text>
            <Text style={styles.heroModeTitle}>
              {isNeutral ? "Start Today" : isRecovery ? "Recovery Route" : "Progress Route"}
            </Text>
            <Text style={styles.heroStatusLine}>{heroStatusLine}</Text>
            <Text style={styles.heroInstructionLine}>{heroInstructionLine}</Text>
          </View>

          <View style={isRecovery ? styles.recoveryGuideOrb : isProgress ? styles.progressGuideOrb : styles.neutralGuideOrb}>
            <Text style={styles.guideName}>Luna</Text>
            <Text style={styles.guideRole}>Guide Companion</Text>
          </View>
        </View>
      </View>

      <View style={isRecovery ? styles.recoveryEnergyCard : isProgress ? styles.progressEnergyCard : styles.neutralEnergyCard}>
        <View style={styles.energyLeft}>
          <Text style={styles.energyLabel}>Energy Reserve</Text>
          <Text style={styles.energyValue}>
            {hasEnergyData ? `🔥 ${energyYield}/100` : "🔥 —/100"}
          </Text>
          <Text style={styles.flameLabel}>{flameLabel}</Text>
          <Text style={styles.energyInstruction}>
            {isNeutral
              ? "Complete a Morning Check-In to calculate today’s Energy Reserve."
              : isRecovery
              ? "Use your remaining energy carefully."
              : "Spend your energy on what matters most."}
          </Text>
        </View>

        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>
            {isNeutral ? "Not set" : isRecovery ? "Recovery" : "Progress"}
          </Text>
        </View>
      </View>

      <View style={isRecovery ? styles.recoveryLunaCard : isProgress ? styles.progressLunaCard : styles.neutralLunaCard}>
        <Text style={styles.sectionHeading}>Luna’s Briefing</Text>
        <Text style={styles.instructionText}>
          Luna uses your check-in, goals, and mode to suggest realistic quests.
        </Text>

        <Text style={styles.lunaBodyText}>
          {isNeutral
            ? "Start with a Morning Check-In so today’s quests can match your sleep, mood, and stress."
            : isRecovery
            ? "Recovery is still progress. Today’s job is to protect your energy and keep one promise to yourself."
            : "Progress is personal. Today’s job is to spend your energy on the path that matters to you."}
        </Text>

        <Text style={styles.mainPathText}>Main path: {topGoal}</Text>
      </View>

      {latestIntention ? (
        <View style={styles.nightSignalCard}>
          <Text style={styles.sectionHeading}>Night Signal</Text>
          <Text style={styles.instructionText}>Review the intention you saved before sleep.</Text>
          <Text style={styles.signalText}>{latestIntention.intention}</Text>

          {latestIntention.firstSmallAction ? (
            <Text style={styles.signalActionText}>
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

      <View style={isRecovery ? styles.recoveryPathCard : isProgress ? styles.progressPathCard : styles.neutralPathCard}>
        <Text style={styles.sectionHeading}>Path Map</Text>
        <Text style={styles.instructionText}>Your dream and goals shape today’s quests.</Text>

        {dreamCategory ? (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>Category: {dreamCategory}</Text>
          </View>
        ) : null}

        {longTermDream ? <Text style={styles.pathDreamText}>Long-term dream: {longTermDream}</Text> : null}

        <View style={styles.pathStepRow}>
          <View style={styles.pathStepNumber}><Text style={styles.pathStepNumberText}>1</Text></View>
          <Text style={styles.pathStepText}>{topGoal}</Text>
        </View>

        <View style={styles.pathStepRow}>
          <View style={styles.pathStepNumber}><Text style={styles.pathStepNumberText}>2</Text></View>
          <Text style={styles.pathStepText}>{secondGoal}</Text>
        </View>

        <View style={styles.pathStepRow}>
          <View style={styles.pathStepNumber}><Text style={styles.pathStepNumberText}>3</Text></View>
          <Text style={styles.pathStepText}>{thirdGoal}</Text>
        </View>
      </View>

      <View style={styles.loadoutSectionCard}>
        <Text style={styles.sectionHeading}>Daily Loadout</Text>
        <View style={styles.tileRow}>
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateWithHaptic("/sleep-checkin")}
          >
            <Text style={styles.tileTitle}>Morning Check-In</Text>
            <Text style={styles.tileInstruction}>Enter sleep, mood, and stress to calculate Energy Reserve.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateWithHaptic("/onboarding")}
          >
            <Text style={styles.tileTitle}>Set My Path</Text>
            <Text style={styles.tileInstruction}>Choose your long-term dream and starting goals.</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.planningSectionCard}>
        <Text style={styles.sectionHeading}>Planning</Text>
        <View style={styles.tileRow}>
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateWithHaptic("/tomorrow-queue")}
          >
            <Text style={styles.tileTitle}>Tomorrow Queue</Text>
            <Text style={styles.tileInstruction}>Save tasks or ideas you want to remember later.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateWithHaptic("/weekly-summary")}
          >
            <Text style={styles.tileTitle}>Weekly Summary</Text>
            <Text style={styles.tileInstruction}>Review check-ins, quests, journals, and patterns.</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mindSleepSectionCard}>
        <Text style={styles.sectionHeading}>Mind & Sleep</Text>

        <View style={styles.tileRow}>
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateWithHaptic("/journal")}
          >
            <Text style={styles.tileTitle}>Journal</Text>
            <Text style={styles.tileInstruction}>Write reflections and track thought patterns.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateWithHaptic("/awareness-check")}
          >
            <Text style={styles.tileTitle}>Awareness Check</Text>
            <Text style={styles.tileInstruction}>Notice where your attention went today.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tileRowSecond}>
          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateWithHaptic("/pre-sleep-intention")}
          >
            <Text style={styles.tileTitle}>Pre-Sleep Intention</Text>
            <Text style={styles.tileInstruction}>Set one clear intention before bed.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tileCard}
            onPress={() => navigateWithHaptic("/morning-intention-reflection")}
          >
            <Text style={styles.tileTitle}>Morning Reflection</Text>
            <Text style={styles.tileInstruction}>Reflect on last night’s intention and choose a small action.</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.growthSectionCard}>
        <Text style={styles.sectionHeading}>Growth</Text>
        <TouchableOpacity
          style={styles.tileCardFull}
          onPress={() => navigateWithHaptic("/next-chapter")}
        >
          <Text style={styles.tileTitle}>Next Chapter</Text>
          <Text style={styles.tileInstruction}>Update your goals when your direction changes.</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.questBoardSection}>
        <Text style={styles.questBoardTitle}>Quest Board</Text>
        <Text style={styles.questBoardInstruction}>
          {isNeutral
            ? "Start with check-in, then choose one small move for the day."
            : "Complete quests for steps. If a quest does not happen, reflect instead of judging yourself."}
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
                  : isProgress
                  ? styles.progressQuestCard
                  : styles.neutralQuestCard
              }
            >
              <TouchableOpacity style={styles.questMain} onPress={() => toggleQuest(quest.title)}>
                <View style={styles.questLeft}>
                  <Text style={styles.checkbox}>{isComplete ? "✅" : "⬜"}</Text>
                  <View style={styles.questTextBlock}>
                    <Text style={styles.questTitle}>{quest.title}</Text>
                    {quest.description ? (
                      <Text style={styles.questDescription}>{quest.description}</Text>
                    ) : null}
                    <View style={styles.questTypeBadge}>
                      <Text style={styles.questTypeText}>{quest.type}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.stepRewardPill}>
                  <Text style={styles.stepRewardText}>+{quest.steps} steps</Text>
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
      </View>

      <View style={styles.rankPanelCard}>
        <Text style={styles.sectionHeading}>Rank & Steps</Text>
        <Text style={styles.instructionText}>Steps track completed daily actions, not perfection.</Text>
        <Text style={styles.rankText}>Rank: {completedSteps >= 5 ? "Builder" : "Wanderer"}</Text>
        <Text style={styles.rankMetaText}>Steps earned today: {completedSteps}</Text>
        <Text style={styles.rankMetaText}>
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
    backgroundColor: "#FFF7ED",
  },
  recoveryScreen: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  neutralScreen: {
    flex: 1,
    backgroundColor: "#F0FDF4",
  },
  container: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },

  progressHero: {
    backgroundColor: "#FFF7ED",
    borderColor: "#F59E0B",
    borderWidth: 3,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
  },
  recoveryHero: {
    backgroundColor: "#1E1B4B",
    borderColor: "#8B5CF6",
    borderWidth: 3,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
  },
  neutralHero: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
    borderWidth: 3,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroLeft: {
    flex: 1,
    marginRight: 10,
  },
  logo: {
    fontSize: 42,
    fontWeight: "900",
    color: "#14532D",
    letterSpacing: -1,
    marginBottom: 6,
  },
  heroModeTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#14532D",
    marginBottom: 6,
  },
  heroStatusLine: {
    fontSize: 14,
    fontWeight: "800",
    color: "#14532D",
    lineHeight: 20,
    marginBottom: 4,
  },
  heroInstructionLine: {
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
    lineHeight: 19,
  },

  progressGuideOrb: {
    width: 112,
    backgroundColor: "#EFF6FF",
    borderColor: "#60A5FA",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  recoveryGuideOrb: {
    width: 112,
    backgroundColor: "#312E81",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  neutralGuideOrb: {
    width: 112,
    backgroundColor: "#ECFDF5",
    borderColor: "#22C55E",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  guideName: {
    fontSize: 12,
    color: "#14532D",
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  guideRole: {
    fontSize: 11,
    color: "#166534",
    fontWeight: "700",
    textAlign: "center",
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
  neutralEnergyCard: {
    backgroundColor: "#14532D",
    borderColor: "#22C55E",
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
    color: "#D1D5DB",
    textTransform: "uppercase",
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
    marginBottom: 6,
  },
  energyInstruction: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E5E7EB",
    lineHeight: 19,
  },
  modeBadge: {
    backgroundColor: "#0F172A",
    borderColor: "#FFFFFF",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modeBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  progressLunaCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#60A5FA",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  recoveryLunaCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  neutralLunaCard: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },

  nightSignalCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  signalText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "800",
    lineHeight: 22,
    marginBottom: 8,
  },
  signalActionText: {
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
    backgroundColor: "#FFF7ED",
    borderColor: "#F59E0B",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  recoveryPathCard: {
    backgroundColor: "#E0F2FE",
    borderColor: "#818CF8",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  neutralPathCard: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  categoryBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  pathDreamText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    lineHeight: 20,
  },
  pathStepRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  pathStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  pathStepNumberText: {
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

  loadoutSectionCard: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  planningSectionCard: {
    backgroundColor: "#ECFDF5",
    borderColor: "#22C55E",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  mindSleepSectionCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#60A5FA",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  growthSectionCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
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
  tileCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    minHeight: 110,
  },
  tileCardFull: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
  },
  tileTitle: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "900",
    marginBottom: 4,
  },
  tileInstruction: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "700",
    lineHeight: 18,
  },

  sectionHeading: {
    fontSize: 19,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 6,
  },
  instructionText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 8,
  },
  lunaBodyText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 8,
  },
  mainPathText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "800",
  },

  questBoardSection: {
    backgroundColor: "#FFF7ED",
    borderColor: "#F59E0B",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  questBoardTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 6,
  },
  questBoardInstruction: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 10,
  },
  progressQuestCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5D39A",
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  recoveryQuestCard: {
    backgroundColor: "#EEF2FF",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  neutralQuestCard: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  completedQuestCard: {
    backgroundColor: "#ECFDF5",
    borderColor: "#34D399",
    borderWidth: 2,
    borderRadius: 16,
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
  questTitle: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "900",
    marginBottom: 4,
  },
  questDescription: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 6,
  },
  questTypeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F3F4F6",
    borderColor: "#9CA3AF",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  questTypeText: {
    fontSize: 11,
    color: "#111827",
    fontWeight: "800",
    textTransform: "uppercase",
  },
  stepRewardPill: {
    marginLeft: 10,
    backgroundColor: "#FBBF24",
    borderColor: "#111827",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  stepRewardText: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "900",
  },
  reflectButton: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderColor: "#9CA3AF",
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  reflectButtonText: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "800",
  },

  rankPanelCard: {
    backgroundColor: "#ECFDF5",
    borderColor: "#F59E0B",
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginBottom: 6,
  },
  rankText: {
    fontSize: 20,
    color: "#111827",
    fontWeight: "900",
    marginBottom: 6,
  },
  rankMetaText: {
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
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "900",
  },
});