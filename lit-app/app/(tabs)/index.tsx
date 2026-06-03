import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { generateProgressQuests } from "../../lib/questGeneration";

type Quest = {
  title: string;
  type: string;
  steps: number;
  description?: string;
  mandatory?: boolean;
  restoreEnergy?: number;
};

type QueueItem = {
  id?: string;
  text?: string;
  title?: string;
  task?: string;
  note?: string;
  type?: string;
};

type CheckIn = {
  id?: string;
  checkInType?: "morning" | "afternoon";
  hours?: string;
  mood?: string;
  stress?: string;
  energy: number;
  mode: "Recovery" | "Progress";
  eatenSinceMorning?: boolean;
  foodSinceMorning?: string;
  createdAt?: string;
};

type WeekdayName = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
type LowercaseWeekdayName = Lowercase<WeekdayName>;

type DayPlan = {
  todayGoal?: string;
  Monday?: string;
  Tuesday?: string;
  Wednesday?: string;
  Thursday?: string;
  Friday?: string;
  Saturday?: string;
  Sunday?: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
};

type UserProfile = {
  name: string;
  longTermDream?: string;
  dreamCategory?: string;
  progressMeaning?: string;
  // Phase 1 tiered goals (preferred)
  specificGoal?: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  // Legacy fields, kept for backward compat with profiles saved before tiered flow
  goalOne?: string;
  goalTwo?: string;
  goalThree?: string;
  biggestObstacle?: string;
  hasWorkOrSchool?: boolean;
  hasTransportation?: boolean;
  hasGymAccess?: boolean;
  hasQuietSpace?: boolean;
  hasFoodControl?: boolean;
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
const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";
const PROGRESS_QUEST_ENERGY_COST = 8;
const RECOVERY_QUEST_ENERGY_COST = 6;
const PASSIVE_DECAY_POINTS = 5;
const PASSIVE_DECAY_INTERVAL_HOURS = 2;

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function getWeekdayName(): WeekdayName {
  const days: WeekdayName[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return days[new Date().getDay()];
}

function clampEnergy(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getFlameState(score: number) {
  if (score >= 80) {
    return { icon: "🔥", label: "Blazing Flame", size: 74 };
  }

  if (score >= 60) {
    return { icon: "🔥", label: "Bright Flame", size: 62 };
  }

  if (score >= 40) {
    return { icon: "🔥", label: "Steady Flame", size: 50 };
  }

  if (score >= 25) {
    return { icon: "🔥", label: "Low Flame", size: 40 };
  }

  return { icon: "🟠", label: "Ember", size: 30 };
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
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan>({
    todayGoal: "",
    Monday: "",
    Tuesday: "",
    Wednesday: "",
    Thursday: "",
    Friday: "",
    Saturday: "",
    Sunday: "",
    monday: "",
    tuesday: "",
    wednesday: "",
    thursday: "",
    friday: "",
    saturday: "",
    sunday: "",
  });

  const hasEnergyData = hasRouteEnergy || hasSavedCheckIn;

  const currentMode: ModeState = hasEnergyData
    ? rawMode === "Recovery" || rawMode === "Progress"
      ? rawMode
      : savedMode
    : "Neutral";

  const isRecovery = currentMode === "Recovery";
  const isProgress = currentMode === "Progress";
  const isNeutral = currentMode === "Neutral";

  const baseEnergyYield = hasRouteEnergy ? routeEnergyNumber : savedEnergy;

  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [latestIntention, setLatestIntention] = useState<PreSleepIntention | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadCompletedQuests();
      loadLatestCheckIn();
      loadQuickThoughts();
      loadDayPlan();
    }, [])
  );

  useEffect(() => {
    loadCompletedQuests();
    loadProfile();
    loadLatestCheckIn();
    loadLatestIntention();
    loadQuickThoughts();
    loadDayPlan();
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

    setProfile(JSON.parse(saved));
    setProfileChecked(true);
  }

  async function loadQuickThoughts() {
    const saved = await AsyncStorage.getItem(TOMORROW_QUEUE_KEY);

    if (!saved) {
      setQueueItems([]);
      return;
    }

    try {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        setQueueItems(parsed);
      } else {
        setQueueItems([]);
      }
    } catch {
      setQueueItems([]);
    }
  }

  async function loadDayPlan() {
    const saved = await AsyncStorage.getItem(DAY_PLAN_KEY);

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as Partial<DayPlan> & Record<string, string | undefined>;

      setDayPlan({
        todayGoal: parsed.todayGoal || "",
        Monday: parsed.Monday || parsed.monday || "",
        Tuesday: parsed.Tuesday || parsed.tuesday || "",
        Wednesday: parsed.Wednesday || parsed.wednesday || "",
        Thursday: parsed.Thursday || parsed.thursday || "",
        Friday: parsed.Friday || parsed.friday || "",
        Saturday: parsed.Saturday || parsed.saturday || "",
        Sunday: parsed.Sunday || parsed.sunday || "",
        monday: parsed.monday || parsed.Monday || "",
        tuesday: parsed.tuesday || parsed.Tuesday || "",
        wednesday: parsed.wednesday || parsed.Wednesday || "",
        thursday: parsed.thursday || parsed.Thursday || "",
        friday: parsed.friday || parsed.Friday || "",
        saturday: parsed.saturday || parsed.Saturday || "",
        sunday: parsed.sunday || parsed.Sunday || "",
      });
    } catch {
      // Keep the default empty day plan if saved data cannot be parsed.
    }
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
      try {
        setCompletedQuests(JSON.parse(savedQuests));
      } catch {
        setCompletedQuests([]);
      }
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

    if (
      (checkIn.mode === "Recovery" || checkIn.mode === "Progress") &&
      typeof checkIn.energy === "number"
    ) {
      setSavedMode(checkIn.mode);
      setSavedEnergy(checkIn.energy);
      setHasSavedCheckIn(true);
      setLatestCheckIn(checkIn);
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

  async function toggleQuest(quest: Quest) {
    const mandatoryQuest = getMandatoryQuest();

    if (mandatoryQuest && !quest.mandatory && !completedQuests.includes(mandatoryQuest.title)) {
      await mediumHaptic();
      return;
    }

    const isAlreadyComplete = completedQuests.includes(quest.title);

    const nextCompleted = isAlreadyComplete
      ? completedQuests.filter((item) => item !== quest.title)
      : [...completedQuests, quest.title];

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

  // Prefer the new tiered milestone fields; fall back to legacy goalOne/Two/Three
  // so older profiles keep working until users re-save through PATH SETUP.
  const topGoal =
    profile?.shortTermGoal?.trim() || profile?.goalOne?.trim() || "your top goal";
  const secondGoal =
    profile?.midTermGoal?.trim() || profile?.goalTwo?.trim() || "your next goal";
  const thirdGoal =
    profile?.longTermGoal?.trim() || profile?.goalThree?.trim() || "your future";

  // The specific goal anchors goal-aware quest generation (Progress mode).
  const specificGoal = profile?.specificGoal?.trim() || "";

  const completedMandatoryTitles = completedQuests.filter(
    (title) => title === "Eat to restore energy" || title === "Relax for 30 minutes"
  );
  const completedNormalQuestCount = completedQuests.length - completedMandatoryTitles.length;
  const questEnergyCost = isProgress ? PROGRESS_QUEST_ENERGY_COST : RECOVERY_QUEST_ENERGY_COST;
  const passiveDecay =
    hasEnergyData && latestCheckIn?.createdAt
      ? Math.floor(
          Math.max(0, Date.now() - new Date(latestCheckIn.createdAt).getTime()) /
            (PASSIVE_DECAY_INTERVAL_HOURS * 60 * 60 * 1000)
        ) * PASSIVE_DECAY_POINTS
      : 0;
  const mandatoryRecoveryBoost = completedMandatoryTitles.reduce(
    (sum, title) => sum + (title === "Eat to restore energy" ? 15 : 10),
    0
  );
  const energyYield = hasEnergyData
    ? clampEnergy(baseEnergyYield - passiveDecay - completedNormalQuestCount * questEnergyCost + mandatoryRecoveryBoost)
    : 0;

  const hoursSlept = latestCheckIn?.hours ? Number(latestCheckIn.hours) : null;
  const shouldSuggestNap =
    hasEnergyData &&
    hoursSlept !== null &&
    !Number.isNaN(hoursSlept) &&
    hoursSlept < 7;

  const todayName = getWeekdayName();
  const lowercaseTodayName = todayName.toLowerCase() as LowercaseWeekdayName;
  const todayGoal = dayPlan.todayGoal?.trim() || "";
  const todayRole =
    dayPlan[todayName]?.trim() ||
    dayPlan[lowercaseTodayName]?.trim() ||
    "";
  const todayPlanText = todayGoal || todayRole;

  const flameState = useMemo(() => getFlameState(energyYield), [energyYield]);
  const flameLabel = hasEnergyData ? flameState.label : "Check-in needed";

  const modeTitle = isNeutral ? "Start Today" : isRecovery ? "Recovery Mode" : "Progress Mode";
  const modeInstruction = isNeutral
    ? "Complete a Morning Check-In to calculate your Energy Reserve."
    : isRecovery
    ? "Protect your energy and keep one promise."
    : "Use your energy on the path that matters.";

  const lunaMessage = isNeutral
    ? "Check in first. I’ll build the quest board around your real energy."
    : isRecovery
    ? "Recovery counts. Choose the smallest honest step."
    : "Energy is available. Pick the quest that moves your path forward.";


  function getAccentColor() {
    if (isNeutral) return "#22C55E";
    if (isRecovery) return "#A78BFA";
    return "#FBBF24";
  }

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

  function generateQuickThoughtQuests(): Quest[] {
    const unique = new Set<string>();
    const result: Quest[] = [];

    queueItems.forEach((item) => {
      const text =
        item?.text?.trim() ||
        item?.title?.trim() ||
        item?.task?.trim() ||
        item?.note?.trim();

      if (!text || unique.has(text)) return;

      unique.add(text);

      result.push({
        title: `Quick thought: ${text}`,
        type: "Quick Thought",
        steps: 1,
        description: item?.type ? `Saved from Quick Thoughts (${item.type})` : "Saved from Quick Thoughts",
      });
    });

    return result;
  }

  function getMandatoryQuest(): Quest | null {
    if (!hasEnergyData || isNeutral) return null;

    const threshold = isProgress ? 50 : 40;
    if (energyYield >= threshold) return null;

    const eatQuestDone = completedQuests.includes("Eat to restore energy");
    const relaxQuestDone = completedQuests.includes("Relax for 30 minutes");
    const hasEaten = latestCheckIn?.eatenSinceMorning === true || eatQuestDone;

    if (!hasEaten && !eatQuestDone) {
      return {
        title: "Eat to restore energy",
        type: "Mandatory",
        steps: 0,
        restoreEnergy: 15,
        mandatory: true,
        description: "Have a meal or snack so your energy can recover.",
      };
    }

    if (!relaxQuestDone) {
      return {
        title: "Relax for 30 minutes",
        type: "Mandatory",
        steps: 0,
        restoreEnergy: 10,
        mandatory: true,
        description: "Pause and recover before spending more energy.",
      };
    }

    return null;
  }

  function generateQuests(): Quest[] {
    const napQuest: Quest = {
      title: "Take a recovery nap",
      type: "Recovery",
      steps: 1,
      description: "Aim for 30–60 minutes if your schedule allows.",
    };

    const dayPlanQuest: Quest | null = todayPlanText
      ? {
          title: `Today’s Quest: ${todayPlanText}`,
          type: "Personal",
          steps: 2,
          description: "A personal quest from your Day Plan.",
        }
      : null;

    const quickThoughtQuests = generateQuickThoughtQuests();
    const mandatoryQuest = getMandatoryQuest();

    if (isNeutral) {
      const neutralBase: Quest[] = [
        { title: "Complete Morning Check-In", type: "Start", steps: 1 },
        { title: "Review your current path", type: "Direction", steps: 1 },
        { title: "Choose one small action for today", type: "Plan", steps: 1 },
      ];

      return [
        neutralBase[0],
        ...(dayPlanQuest ? [dayPlanQuest] : []),
        ...(shouldSuggestNap ? [napQuest] : []),
        neutralBase[1],
        neutralBase[2],
        ...quickThoughtQuests,
      ];
    }

    const category = profile?.dreamCategory?.trim() || "Purpose";

    const resourceQuest: Quest = profile?.hasQuietSpace
      ? { title: "Use your quiet space for one focus block", type: "Focus", steps: 1 }
      : { title: "Create a simple focus corner for 10 minutes", type: "Focus", steps: 1 };

    const movementQuest: Quest = profile?.hasGymAccess
      ? { title: "Movement option: gym or structured workout", type: "Body", steps: 1 }
      : { title: "Movement option: walk, stretch, or home workout", type: "Body", steps: 1 };

    const transportQuest: Quest = profile?.hasTransportation
      ? { title: "Plan one out-of-home step you can reach", type: "Logistics", steps: 1 }
      : { title: "Plan one step you can do from home", type: "Logistics", steps: 1 };

    let baseQuests: Quest[];

    if (isProgress) {
      // Progress mode: goal-anchored daily quests from the offline quest DB,
      // personalized with the user's specific goal.
      const progressQuests = generateProgressQuests({ category, specificGoal }, 5);
      baseQuests = [...progressQuests, resourceQuest, movementQuest, transportQuest];
    } else {
      // Recovery mode (unchanged for now): gentle category quests + goal steps.
      const categoryQuests = getCategoryQuests(category, "Recovery");
      const goalQuests: Quest[] = [
        { title: `Goal step: ${topGoal}`, type: "Goal", steps: 1 },
        { title: `Goal step: ${secondGoal}`, type: "Goal", steps: 1 },
        { title: `Goal step: ${thirdGoal}`, type: "Goal", steps: 1 },
      ];
      baseQuests = [
        ...categoryQuests,
        ...goalQuests,
        resourceQuest,
        movementQuest,
        transportQuest,
      ];
    }

    return [
      ...(mandatoryQuest ? [mandatoryQuest] : []),
      ...(dayPlanQuest ? [dayPlanQuest] : []),
      ...(shouldSuggestNap ? [napQuest] : []),
      ...baseQuests,
      ...quickThoughtQuests,
    ];
  }

  const quests = generateQuests();
  const visibleQuests = quests.slice(0, 3);

  const completedSteps = visibleQuests
    .filter((quest) => completedQuests.includes(quest.title))
    .reduce((sum, quest) => sum + quest.steps, 0);

  const completedVisibleQuests = visibleQuests.filter((quest) =>
    completedQuests.includes(quest.title)
  ).length;

  const rank = completedSteps >= 5 ? "Consistent" : "Beginner";

  const moveQuestDone = visibleQuests.some(
    (q) => (q.type === "Body" || q.title.toLowerCase().includes("movement")) && completedQuests.includes(q.title)
  )
    ? 1
    : 0;

  const focusValue = `${completedVisibleQuests}/${visibleQuests.length || 0}`;
  const reflectValue = visibleQuests.some((q) => q.title.toLowerCase().includes("reflect")) ? 1 : 0;

  if (!profileChecked) return null;

  return (
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : isProgress ? styles.progressScreen : styles.neutralScreen}
      contentContainerStyle={styles.container}
    >
      <View style={styles.shell}>
        <View style={isRecovery ? styles.recoveryHeader : isProgress ? styles.progressHeader : styles.neutralHeader}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity style={styles.headerSquareButton} onPress={() => navigateWithHaptic("/onboarding")}>
              <Text style={styles.headerSquareText}>🌿</Text>
            </TouchableOpacity>

            <View style={styles.logoBlock}>
              <Text style={styles.logo}>MYLIT</Text>
              <Text style={styles.subtitle}>Living in Truth</Text>
            </View>

            <TouchableOpacity style={styles.headerSquareButton} onPress={() => navigateWithHaptic("/onboarding")}>
              <Text style={styles.headerSquareText}>🧭</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerModePanel}>
            <Text style={styles.headerModeTitle}>{modeTitle}</Text>
            <Text style={styles.headerModeInstruction}>{modeInstruction}</Text>
          </View>
        </View>

        <View style={styles.timeTrackPanel}>
          <View style={styles.trackHeaderRow}>
            <Text style={styles.trackTitle}>Day Track</Text>
            <View style={[styles.trackMarkerLabel, { backgroundColor: getAccentColor() }]}>
              <Text style={styles.trackMarkerLabelText}>
                {isNeutral ? "Check-in" : isRecovery ? "Recovery" : "Active"}
              </Text>
            </View>
          </View>

          <View style={styles.trackLine}>
            <View
              style={[
                styles.trackMarkerDot,
                isNeutral && styles.trackMarkerStart,
                isProgress && styles.trackMarkerMid,
                isRecovery && styles.trackMarkerEnd,
              ]}
            />
          </View>

          <View style={styles.trackTimesRow}>
            <View style={styles.trackTimeItem}>
              <Text style={styles.trackIcon}>🌅</Text>
              <Text style={styles.trackTimeText}>6 AM</Text>
            </View>
            <View style={styles.trackTimeItem}>
              <Text style={styles.trackIcon}>☀️</Text>
              <Text style={styles.trackTimeText}>12 PM</Text>
            </View>
            <View style={styles.trackTimeItem}>
              <Text style={styles.trackIcon}>🌇</Text>
              <Text style={styles.trackTimeText}>6 PM</Text>
            </View>
            <View style={styles.trackTimeItem}>
              <Text style={styles.trackIcon}>🌙</Text>
              <Text style={styles.trackTimeText}>12 AM</Text>
            </View>
          </View>
        </View>

        <View style={isRecovery ? styles.recoveryLunaBox : isProgress ? styles.progressLunaBox : styles.neutralLunaBox}>
          <View style={styles.lunaOrb}>
            <Text style={styles.lunaOrbText}>L</Text>
          </View>

          <View style={styles.lunaSpeech}>
            <Text style={styles.lunaTag}>Luna</Text>
            <Text style={styles.lunaText}>{lunaMessage}</Text>
            <Text style={styles.lunaPath}>Main path: {topGoal}</Text>
          </View>
        </View>

        <View style={isRecovery ? styles.recoveryEnergyPanel : isProgress ? styles.progressEnergyPanel : styles.neutralEnergyPanel}>
          <View style={styles.energyTopRow}>
            <View>
              <Text style={styles.energyTitle}>Energy Reserve</Text>
              <Text style={styles.energyLabel}>{hasEnergyData ? flameLabel : "Check-in needed"}</Text>
            </View>

            <View style={styles.energyModeBadge}>
              <Text style={styles.energyModeBadgeText}>
                {isNeutral ? "Not set" : isRecovery ? "Recovery" : "Progress"}
              </Text>
            </View>
          </View>

          <View style={styles.energyScoreRow}>
            <Text style={styles.energyScore}>{hasEnergyData ? energyYield : "—"}</Text>
            <Text style={styles.energyOutOf}>/100</Text>
          </View>

          <View style={styles.flameMeter}>
            <Text style={[styles.flameIcon, { fontSize: flameState.size }]}>
              {hasEnergyData ? flameState.icon : "○"}
            </Text>
            <Text style={styles.flameMeterText}>
              {hasEnergyData ? flameLabel : "No flame reading yet"}
            </Text>
          </View>

          <TouchableOpacity style={styles.checkInButton} onPress={() => navigateWithHaptic("/sleep-checkin")}>
            <Text style={styles.checkInButtonText}>Morning Check-In</Text>
          </TouchableOpacity>

          {hasEnergyData ? (
            <TouchableOpacity
              style={styles.afternoonCheckInButton}
              onPress={() =>
                router.push({
                  pathname: "/sleep-checkin",
                  params: { checkInType: "afternoon" },
                })
              }
            >
              <Text style={styles.afternoonCheckInButtonText}>Afternoon Check-In</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.questPanel}>
          <View style={styles.questHeaderRow}>
            <Text style={styles.questTitle}>Quest Board</Text>
            <Text style={styles.questProgress}>
              {completedVisibleQuests}/{visibleQuests.length || 0}
            </Text>
          </View>

          <Text style={styles.questSubtitle}>Complete one. Reflect if it misses.</Text>

          {visibleQuests.map((quest) => {
            const isDone = completedQuests.includes(quest.title);

            return (
              <View key={quest.title} style={[styles.questTile, isDone && styles.questTileDone]}>
                <View style={styles.questLeft}>
                  <View style={styles.questTopRow}>
                    <View style={styles.questTypeBadge}>
                      <Text style={styles.questTypeText}>{quest.type}</Text>
                    </View>
                    <View style={styles.questStepBadge}>
                      <Text style={styles.questStepText}>+{quest.steps}</Text>
                    </View>
                  </View>

                  <Text style={styles.questText}>{quest.title}</Text>
                  {quest.description ? <Text style={styles.questDescription}>{quest.description}</Text> : null}
                  {quest.mandatory ? <Text style={styles.mandatoryLockText}>Normal quests unlock after this.</Text> : null}

                  <View style={styles.questActionsRow}>
                    <Link href={{ pathname: "/reflection", params: { quest: quest.title } }} asChild>
                      <TouchableOpacity style={styles.reflectButton}>
                        <Text style={styles.reflectButtonText}>Reflect</Text>
                      </TouchableOpacity>
                    </Link>
                  </View>
                </View>

                <TouchableOpacity style={[styles.checkBox, isDone && styles.checkBoxDone]} onPress={() => toggleQuest(quest)}>
                  <Text style={styles.checkBoxText}>{isDone ? "✓" : ""}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <View style={styles.rankPanel}>
          <Text style={styles.rankTitle}>RANK & STEPS</Text>
          <View style={styles.rankRow}>
            <Text style={styles.rankLabel}>Rank</Text>
            <Text style={styles.rankValue}>{rank}</Text>
          </View>
          <View style={styles.rankRow}>
            <Text style={styles.rankLabel}>Steps Earned</Text>
            <Text style={styles.rankValue}>{completedSteps}</Text>
          </View>
          <View style={styles.rankRow}>
            <Text style={styles.rankLabel}>Completed Quests</Text>
            <Text style={styles.rankValue}>{completedVisibleQuests}</Text>
          </View>
          <View style={styles.rankMiniStats}>
            <Text style={styles.rankMiniText}>Move: {moveQuestDone}</Text>
            <Text style={styles.rankMiniText}>Focus: {focusValue}</Text>
            <Text style={styles.rankMiniText}>Reflect: {reflectValue}</Text>
          </View>
          <TouchableOpacity style={styles.resetButton} onPress={resetTodayProgress}>
            <Text style={styles.resetButtonText}>Reset Today Progress</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            <TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={lightHaptic}>
              <Text style={styles.navTextActive}>🏠 Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/sleep")}>
              <Text style={styles.navText}>🌙 Sleep</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/calendar")}>
              <Text style={styles.navText}>📅 Calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/mind")}>
              <Text style={styles.navText}>🧠 Mind</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/path")}>
              <Text style={styles.navText}>🧭 Path</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/stats")}>
              <Text style={styles.navText}>🎒 Inventory</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  neutralScreen: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  progressScreen: {
    flex: 1,
    backgroundColor: "#151A2D",
  },
  recoveryScreen: {
    flex: 1,
    backgroundColor: "#0A1020",
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
  neutralHeader: {
    backgroundColor: "#102314",
    borderWidth: 3,
    borderColor: "#22C55E",
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
  },
  progressHeader: {
    backgroundColor: "#251F11",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
  },
  recoveryHeader: {
    backgroundColor: "#1B1940",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerSquareButton: {
    height: 34,
    width: 34,
    borderRadius: 8,
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSquareText: {
    color: "#F9FAFB",
    fontSize: 14,
  },
  logoBlock: {
    alignItems: "center",
  },
  logo: {
    color: "#F9FAFB",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 1,
  },
  subtitle: {
    color: "#CBD5E1",
    fontSize: 12,
    marginTop: 2,
  },
  headerModePanel: {
    marginTop: 12,
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 14,
    padding: 10,
  },
  headerModeTitle: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  headerModeInstruction: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 18,
  },
  timeTrackPanel: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
  },
  trackHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trackTitle: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "800",
  },
  trackMarkerLabel: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  trackMarkerLabelText: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  trackLine: {
    height: 7,
    backgroundColor: "#1F2937",
    borderRadius: 999,
    marginTop: 10,
    marginBottom: 10,
    position: "relative",
  },
  trackMarkerDot: {
    position: "absolute",
    top: -4,
    height: 15,
    width: 15,
    borderRadius: 999,
    backgroundColor: "#F9FAFB",
    borderWidth: 2,
    borderColor: "#0F172A",
  },
  trackMarkerStart: {
    left: "2%",
    backgroundColor: "#22C55E",
  },
  trackMarkerMid: {
    left: "47%",
    backgroundColor: "#FBBF24",
  },
  trackMarkerEnd: {
    left: "85%",
    backgroundColor: "#A78BFA",
  },
  trackTimesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  trackTimeItem: {
    alignItems: "center",
  },
  trackIcon: {
    fontSize: 13,
    marginBottom: 2,
  },
  trackTimeText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
  },
  neutralLunaBox: {
    backgroundColor: "#102314",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
  },
  progressLunaBox: {
    backgroundColor: "#251F11",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
  },
  recoveryLunaBox: {
    backgroundColor: "#1B1940",
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
  },
  lunaOrb: {
    height: 40,
    width: 40,
    borderRadius: 999,
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  lunaOrbText: {
    color: "#F9FAFB",
    fontWeight: "900",
  },
  lunaSpeech: {
    flex: 1,
  },
  lunaTag: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
  },
  lunaText: {
    color: "#E2E8F0",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 5,
  },
  lunaPath: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },
  neutralEnergyPanel: {
    backgroundColor: "#111827",
    borderWidth: 3,
    borderColor: "#22C55E",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  progressEnergyPanel: {
    backgroundColor: "#111827",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  recoveryEnergyPanel: {
    backgroundColor: "#111827",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  energyTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  energyTitle: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  energyLabel: {
    color: "#CBD5E1",
    fontSize: 12,
    marginTop: 4,
  },
  energyModeBadge: {
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  energyModeBadgeText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "900",
  },
  energyScoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 8,
    marginBottom: 8,
  },
  energyScore: {
    color: "#F9FAFB",
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 44,
  },
  energyOutOf: {
    color: "#CBD5E1",
    fontSize: 18,
    marginLeft: 4,
    fontWeight: "800",
  },
  flameMeter: {
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  flameIcon: {
    lineHeight: 78,
  },
  flameMeterText: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  checkInButton: {
    marginTop: 2,
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#F9FAFB",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  checkInButtonText: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
  },
  afternoonCheckInButton: {
    marginTop: 8,
    backgroundColor: "#1E293B",
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  afternoonCheckInButtonText: {
    color: "#EDE9FE",
    fontSize: 13,
    fontWeight: "900",
  },
  questPanel: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 20,
    padding: 12,
    marginBottom: 12,
  },
  questHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  questTitle: {
    color: "#FDE68A",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  questProgress: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
  },
  questSubtitle: {
    color: "#CBD5E1",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  questTile: {
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  questTileDone: {
    borderColor: "#22C55E",
  },
  questLeft: {
    flex: 1,
    marginRight: 10,
  },
  questTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  questTypeBadge: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 7,
    marginRight: 6,
  },
  questTypeText: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "800",
  },
  questStepBadge: {
    backgroundColor: "#14532D",
    borderWidth: 1,
    borderColor: "#22C55E",
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  questStepText: {
    color: "#DCFCE7",
    fontSize: 10,
    fontWeight: "800",
  },
  questText: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  questDescription: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  mandatoryLockText: {
    color: "#FDE68A",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 5,
    textTransform: "uppercase",
  },
  questActionsRow: {
    marginTop: 8,
    flexDirection: "row",
  },
  reflectButton: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#64748B",
    borderRadius: 9,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  reflectButtonText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "800",
  },
  checkBox: {
    height: 26,
    width: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },
  checkBoxDone: {
    backgroundColor: "#166534",
    borderColor: "#22C55E",
  },
  checkBoxText: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
  },
  rankPanel: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
  },
  rankTitle: {
    color: "#FDE68A",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
  },
  rankRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    paddingVertical: 6,
  },
  rankLabel: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },
  rankValue: {
    color: "#F9FAFB",
    fontSize: 12,
    fontWeight: "900",
  },
  rankMiniStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 8,
  },
  rankMiniText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "800",
  },
  resetButton: {
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  resetButtonText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "800",
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
    backgroundColor: "#184B31",
    borderColor: "#FBBF24",
  },
  navText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  navTextActive: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
});