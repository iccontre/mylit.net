import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../../constants/uiAssets";
import { generateProgressQuests } from "../../lib/questGeneration";

const mylitLogo = require("../../assets/ui/logo/mylit-logo.png");

const fireAssets = {
  ember: require("../../assets/ui/fires/ember.png"),
  lowFlame: require("../../assets/ui/fires/low-flame.png"),
  steadyFlame: require("../../assets/ui/fires/steady-flame.png"),
  brightFlame: require("../../assets/ui/fires/bright-flame.png"),
  blazingFlame: require("../../assets/ui/fires/blazing-flame.png"),
};

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
  goalsGeneratedAt?: string;
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
    return { image: fireAssets.blazingFlame, label: "Blazing Flame", size: 74 };
  }

  if (score >= 60) {
    return { image: fireAssets.brightFlame, label: "Bright Flame", size: 62 };
  }

  if (score >= 40) {
    return { image: fireAssets.steadyFlame, label: "Steady Flame", size: 50 };
  }

  if (score >= 25) {
    return { image: fireAssets.lowFlame, label: "Low Flame", size: 40 };
  }

  return { image: fireAssets.ember, label: "Ember", size: 30 };
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

  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [latestIntention, setLatestIntention] = useState<PreSleepIntention | null>(null);

  const latestCheckInDay = latestCheckIn?.createdAt
    ? new Date(latestCheckIn.createdAt).toLocaleDateString("en-CA")
    : null;
  const latestCheckInTime = latestCheckIn?.createdAt
    ? new Date(latestCheckIn.createdAt).getTime()
    : null;
  const pathSetTime = profile?.goalsGeneratedAt
    ? new Date(profile.goalsGeneratedAt).getTime()
    : null;
  const isSavedCheckInToday = latestCheckInDay === getTodayKey();
  const isSavedCheckInAfterPath =
    latestCheckInTime !== null && pathSetTime !== null
      ? latestCheckInTime >= pathSetTime
      : true;
  const hasSavedEnergyData =
    hasSavedCheckIn &&
    latestCheckIn !== null &&
    isSavedCheckInToday &&
    isSavedCheckInAfterPath;

  const hasEnergyData = hasRouteEnergy || hasSavedEnergyData;

  const currentMode: ModeState = hasEnergyData
    ? rawMode === "Recovery" || rawMode === "Progress"
      ? rawMode
      : hasSavedEnergyData
      ? savedMode
      : "Neutral"
    : "Neutral";

  const isRecovery = currentMode === "Recovery";
  const isProgress = currentMode === "Progress";
  const isNeutral = currentMode === "Neutral";

  const baseEnergyYield = hasRouteEnergy ? routeEnergyNumber : hasSavedEnergyData ? savedEnergy : 0;

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

  const modeTitle = isNeutral ? "Balanced Mode" : isRecovery ? "Recovery Mode" : "Progress Mode";
  const modeInstruction = isNeutral
    ? "A new day awaits. Small steps today, bright tomorrows."
    : isRecovery
    ? "Gentle steps today. You're doing enough."
    : "Keep building momentum. Your best day is ahead.";

  const guideName = isRecovery ? "Luna" : "Evie";
  const guideImage = isRecovery ? uiAssets.guides.luna : uiAssets.guides.evie;
  const guideMessage = isRecovery
    ? "It's okay to take it slow, stargazer. Rest is part of becoming your brightest self."
    : "You're on fire! Keep building momentum. Your best day is ahead.";

  const theme = isRecovery
    ? {
        accent: "#C4A7FF",
        accent2: "#8B5CF6",
        glow: "#E9D5FF",
        dark: "rgba(22, 17, 42, 0.94)",
        panel: "rgba(18, 16, 34, 0.95)",
        soft: "#DDD6FE",
        status: "RECOVERY",
        mode: "RECOVERY MODE",
      }
    : isProgress
    ? {
        accent: "#FBBF24",
        accent2: "#84CC16",
        glow: "#FEF3C7",
        dark: "rgba(15, 18, 15, 0.94)",
        panel: "rgba(8, 13, 18, 0.95)",
        soft: "#D9F99D",
        status: "ACTIVE",
        mode: "PROGRESS MODE",
      }
    : {
        accent: "#F8C84A",
        accent2: "#22C55E",
        glow: "#FDE68A",
        dark: "rgba(11, 17, 22, 0.92)",
        panel: "rgba(8, 14, 18, 0.94)",
        soft: "#F8E7A1",
        status: "STEADY",
        mode: "BALANCED MODE",
      };

  function getAccentColor() {
    return theme.accent;
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
    <View style={styles.pageRoot}>
      <View style={styles.phoneFrame}>
        <ImageBackground source={uiAssets.backgrounds.default} style={styles.phoneBackground} resizeMode="cover">
          <View style={styles.worldOverlay}>
            <ScrollView
              style={styles.screenScroller}
              contentContainerStyle={styles.hudContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.topHud}>
                <TouchableOpacity style={[styles.cornerButton, { borderColor: theme.accent }]} onPress={() => navigateWithHaptic("/onboarding")}>
                  <Text style={styles.cornerButtonText}>🌲</Text>
                </TouchableOpacity>

                <Image source={mylitLogo} style={styles.heroLogo} resizeMode="contain" />

                <TouchableOpacity style={[styles.cornerButton, { borderColor: theme.accent }]} onPress={() => navigateWithHaptic("/onboarding")}>
                  <Text style={styles.cornerButtonText}>⚙️</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modeRow}>
                <Text style={[styles.modeTitle, { color: theme.accent }]}>{theme.mode}</Text>
                <Text style={styles.modeSubtitle} numberOfLines={1}>{modeInstruction}</Text>
              </View>

              <View style={[styles.timePanel, { borderColor: theme.accent }]}>
                <View style={styles.panelHeaderRow}>
                  <Text style={styles.panelHeaderText}>DAY / TIME TRACK</Text>
                  <View style={[styles.statusPill, { borderColor: theme.accent }]}>
                    <Text style={[styles.statusPillText, { color: theme.accent }]}>{theme.status}</Text>
                  </View>
                </View>
                <View style={styles.timelineIconsRow}>
                  <Text style={styles.timelineIcon}>🌅</Text>
                  <Text style={styles.timelineIcon}>☀️</Text>
                  <Text style={styles.timelineIcon}>{isRecovery ? "☾" : "🌇"}</Text>
                  <Text style={styles.timelineIcon}>🌙</Text>
                </View>
                <View style={styles.timelineTrack}>
                  <View style={[styles.timelineFill, { backgroundColor: theme.accent }]} />
                  <View
                    style={[
                      styles.timelineMarker,
                      { borderColor: theme.accent, backgroundColor: theme.glow },
                      isNeutral && styles.timelineMarkerNeutral,
                      isProgress && styles.timelineMarkerProgress,
                      isRecovery && styles.timelineMarkerRecovery,
                    ]}
                  />
                </View>
                <View style={styles.timelineLabelsRow}>
                  <Text style={styles.timelineLabel}>6 AM</Text>
                  <Text style={styles.timelineLabel}>12 PM</Text>
                  <Text style={styles.timelineLabel}>6 PM</Text>
                  <Text style={styles.timelineLabel}>12 AM</Text>
                </View>
              </View>

              <View style={[styles.guideScene, isNeutral && styles.guideSceneNeutral]}>
                {!isNeutral ? (
                  <Image source={guideImage} style={[styles.guideEmblem, { borderColor: theme.accent }]} resizeMode="contain" />
                ) : null}
                <View style={[styles.speechBubble, { borderColor: theme.accent }, isNeutral && styles.neutralSpeechBubble]}>
                  <Text style={styles.speechText}>{isNeutral ? modeInstruction : guideMessage}</Text>
                  {!isNeutral ? <Text style={[styles.speechName, { color: theme.accent }]}>{guideName} {isRecovery ? "💜" : "💚"}</Text> : null}
                </View>
              </View>

              <View style={[styles.energyCard, { borderColor: theme.accent }]}>
                <View style={styles.energyHeaderRow}>
                  <Text style={[styles.energyTitle, { color: theme.accent }]}>{isRecovery ? "+ RECOVERY MODE +" : "ENERGY FLAME"}</Text>
                  <View style={[styles.energyPill, { borderColor: theme.accent }]}>
                    <Text style={[styles.energyPillText, { color: theme.accent }]}>{isNeutral ? "STEADY" : isRecovery ? "RECOVERY" : "PROGRESS"}</Text>
                  </View>
                </View>
                <Image
                  source={hasEnergyData ? flameState.image : fireAssets.steadyFlame}
                  style={[
                    styles.energyFlame,
                    {
                      height: hasEnergyData ? flameState.size + 42 : 92,
                      width: hasEnergyData ? flameState.size + 42 : 92,
                    },
                  ]}
                  resizeMode="contain"
                />
                <View style={styles.energyScoreLine}>
                  <Text style={[styles.energyScore, { color: theme.glow }]}>{hasEnergyData ? energyYield : "—"}</Text>
                  <Text style={styles.energyOutOf}> / 100</Text>
                </View>
                <Text style={[styles.flameMeterText, { color: theme.soft }]}>{hasEnergyData ? flameLabel : "CHECK-IN NEEDED"}</Text>
                <Text style={styles.energyFooterText} numberOfLines={2}>{modeInstruction}</Text>
              </View>

              <View style={styles.checkInRow}>
                <TouchableOpacity style={[styles.checkInCard, { borderColor: theme.accent }]} onPress={() => navigateWithHaptic("/sleep-checkin")}>
                  <View style={styles.checkIconBox}><Text style={styles.checkIcon}>🌄</Text></View>
                  <View style={styles.checkTextBox}>
                    <Text style={[styles.checkTitle, { color: theme.glow }]}>MORNING{"\n"}CHECK-IN</Text>
                    <Text style={styles.checkSubtitle} numberOfLines={2}>{isRecovery ? "Start your day with kindness." : "Start strong. Set your focus."}</Text>
                  </View>
                  <Text style={[styles.checkArrow, { color: theme.accent }]}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.checkInCard, { borderColor: theme.accent }]}
                  onPress={() =>
                    router.push({
                      pathname: "/sleep-checkin",
                      params: { checkInType: "afternoon" },
                    })
                  }
                >
                  <View style={styles.checkIconBox}><Text style={styles.checkIcon}>{isRecovery ? "🌙" : "🌇"}</Text></View>
                  <View style={styles.checkTextBox}>
                    <Text style={[styles.checkTitle, { color: theme.glow }]}>AFTERNOON{"\n"}CHECK-IN</Text>
                    <Text style={styles.checkSubtitle} numberOfLines={2}>{isRecovery ? "Pause, breathe, reset." : "Recalibrate. Keep going."}</Text>
                  </View>
                  <Text style={[styles.checkArrow, { color: theme.accent }]}>›</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.questBoard, { borderColor: theme.accent }]}>
                <View style={styles.questHeaderRow}>
                  <Text style={[styles.questTitle, { color: theme.accent }]}>{isRecovery ? "+ QUEST BOARD +" : "⚔ QUEST BOARD"}</Text>
                  <Text style={[styles.questCount, { color: theme.accent }]}>{isNeutral ? "LOCKED" : isProgress ? `${visibleQuests.length} ACTIVE` : `${completedVisibleQuests}/${visibleQuests.length || 0}`}</Text>
                </View>

                {isNeutral ? (
                  <View style={styles.questLockedCard}>
                    <Text style={styles.questLockedTitle}>Quest Board Locked</Text>
                    <Text style={styles.questLockedText} numberOfLines={2}>Complete a check-in to reveal energy-aware quests for your path.</Text>
                    <TouchableOpacity style={[styles.questLockedButton, { borderColor: theme.accent }]} onPress={() => navigateWithHaptic("/sleep-checkin")}>
                      <Text style={styles.questLockedButtonText}>START CHECK-IN</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  visibleQuests.map((quest) => {
                    const isDone = completedQuests.includes(quest.title);

                    return (
                      <View key={quest.title} style={[styles.questRow, isDone && styles.questRowDone]}>
                        <View style={styles.questIconSlot}>
                          <Text style={styles.questIcon}>{quest.mandatory ? "!" : quest.type === "Body" ? "🏋️" : quest.type === "Focus" ? "📓" : "📜"}</Text>
                        </View>
                        <View style={styles.questCopy}>
                          <Text style={styles.questText} numberOfLines={1}>{quest.title}</Text>
                          <View style={styles.questMetaRow}>
                            <Text style={[styles.questMeta, { color: theme.soft }]} numberOfLines={1}>{quest.description || quest.type}</Text>
                            <Text style={[styles.questSteps, { color: theme.accent }]}>+{quest.steps}</Text>
                          </View>
                        </View>
                        <Link href={{ pathname: "/reflection", params: { quest: quest.title } }} asChild>
                          <TouchableOpacity style={styles.reflectButton}>
                            <Text style={styles.reflectButtonText}>↺</Text>
                          </TouchableOpacity>
                        </Link>
                        <TouchableOpacity style={[styles.checkBox, isDone && styles.checkBoxDone, { borderColor: isDone ? "#22C55E" : theme.soft }]} onPress={() => toggleQuest(quest)}>
                          <Text style={styles.checkBoxText}>{isDone ? "✓" : ""}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>

              <View style={[styles.statsBar, { borderColor: theme.accent }]}>
                <View style={styles.statCell}>
                  <Text style={styles.statIcon}>🛡️</Text>
                  <View>
                    <Text style={[styles.statLabel, { color: theme.accent }]}>RANK</Text>
                    <Text style={styles.statValue}>{rank}</Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statIcon}>🥾</Text>
                  <View>
                    <Text style={[styles.statLabel, { color: theme.accent }]}>STEPS</Text>
                    <Text style={styles.statValue}>{completedSteps}</Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statIcon}>🎒</Text>
                  <View>
                    <Text style={[styles.statLabel, { color: theme.accent }]}>INVENTORY</Text>
                    <Text style={styles.statValue}>{completedVisibleQuests} / {visibleQuests.length || 0}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={[styles.bottomNav, { borderColor: theme.accent }]}>
              <TouchableOpacity style={[styles.navButton, styles.navButtonActive, { borderColor: theme.accent }]} onPress={lightHaptic}>
                <Text style={styles.navTextActive}>🏠</Text>
                <Text style={[styles.navLabelActive, { color: theme.glow }]}>HOME</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/sleep")}>
                <Text style={styles.navText}>🌙</Text>
                <Text style={styles.navLabel}>SLEEP</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/mind")}>
                <Text style={styles.navText}>🧠</Text>
                <Text style={styles.navLabel}>MIND</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/path")}>
                <Text style={styles.navText}>🌲</Text>
                <Text style={styles.navLabel}>PATH</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/calendar")}>
                <Text style={styles.navText}>📅</Text>
                <Text style={styles.navLabel}>CAL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/stats")}>
                <Text style={styles.navText}>🎒</Text>
                <Text style={styles.navLabel}>BAG</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#02040A",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneFrame: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    backgroundColor: "#050814",
    overflow: "hidden",
  },
  phoneBackground: {
    flex: 1,
  },
  worldOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 12, 0.08)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 86,
    justifyContent: "space-between",
  },
  topHud: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cornerButton: {
    height: 52,
    width: 52,
    borderWidth: 3,
    borderRadius: 8,
    backgroundColor: "rgba(6, 10, 18, 0.94)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  cornerButtonText: {
    fontSize: 24,
  },
  heroLogo: {
    height: 86,
    width: 238,
    marginTop: -2,
  },
  modeRow: {
    marginTop: -10,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modeTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 0,
  },
  modeSubtitle: {
    flex: 1,
    color: "#F8F1D7",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "right",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  timePanel: {
    backgroundColor: "rgba(6, 10, 18, 0.78)",
    borderWidth: 3,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelHeaderText: {
    color: "#F8F1D7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  statusPill: {
    borderWidth: 2,
    backgroundColor: "rgba(9, 14, 24, 0.95)",
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "900",
  },
  timelineIconsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: -1,
  },
  timelineIcon: {
    fontSize: 18,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 0,
  },
  timelineTrack: {
    height: 8,
    backgroundColor: "rgba(1, 5, 12, 0.96)",
    borderWidth: 2,
    borderColor: "#111827",
    position: "relative",
    overflow: "visible",
  },
  timelineFill: {
    position: "absolute",
    left: 0,
    top: 1,
    bottom: 1,
    width: "42%",
    opacity: 0.75,
  },
  timelineMarker: {
    position: "absolute",
    top: -9,
    height: 22,
    width: 22,
    borderWidth: 3,
    transform: [{ rotate: "45deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
  },
  timelineMarkerNeutral: { left: "23%" },
  timelineMarkerProgress: { left: "42%" },
  timelineMarkerRecovery: { left: "10%" },
  timelineLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  timelineLabel: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "900",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 0,
  },
  guideScene: {
    minHeight: 94,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    marginVertical: 3,
  },
  guideSceneNeutral: {
    minHeight: 78,
    justifyContent: "center",
  },
  guideEmblem: {
    height: 86,
    width: 86,
    borderWidth: 3,
    borderRadius: 43,
    backgroundColor: "rgba(8, 13, 24, 0.55)",
    marginRight: 10,
  },
  speechBubble: {
    flex: 1,
    backgroundColor: "rgba(8, 12, 20, 0.94)",
    borderWidth: 3,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  neutralSpeechBubble: {
    flex: 0,
    width: "72%",
  },
  speechText: {
    color: "#F8F1D7",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  speechName: {
    fontSize: 14,
    fontWeight: "900",
    marginTop: 5,
  },
  energyCard: {
    width: "58%",
    minHeight: 188,
    alignSelf: "center",
    backgroundColor: "rgba(6, 10, 18, 0.96)",
    borderWidth: 4,
    borderRadius: 5,
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  energyHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  energyTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  energyPill: {
    borderWidth: 1,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  energyPillText: {
    fontSize: 8,
    fontWeight: "900",
  },
  energyFlame: {
    marginTop: 2,
    marginBottom: -4,
  },
  energyScoreLine: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  energyScore: {
    fontSize: 44,
    fontWeight: "900",
    lineHeight: 48,
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  energyOutOf: {
    color: "#F8F1D7",
    fontSize: 22,
    fontWeight: "900",
  },
  flameMeterText: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  energyFooterText: {
    color: "#F8F1D7",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
  },
  checkInRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 7,
  },
  checkInCard: {
    flex: 1,
    minHeight: 82,
    backgroundColor: "rgba(6, 10, 18, 0.95)",
    borderWidth: 3,
    borderRadius: 4,
    padding: 7,
    flexDirection: "row",
    alignItems: "center",
  },
  checkIconBox: {
    height: 46,
    width: 46,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
  },
  checkIcon: {
    fontSize: 27,
  },
  checkTextBox: {
    flex: 1,
  },
  checkTitle: {
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
  },
  checkSubtitle: {
    color: "#F8F1D7",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    marginTop: 2,
  },
  checkArrow: {
    fontSize: 30,
    fontWeight: "900",
    marginLeft: 3,
  },
  questBoard: {
    minHeight: 150,
    backgroundColor: "rgba(5, 9, 17, 0.96)",
    borderWidth: 3,
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
  },
  questHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  questTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },
  questCount: {
    fontSize: 13,
    fontWeight: "900",
  },
  questLockedCard: {
    flex: 1,
    minHeight: 92,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  questLockedTitle: {
    color: "#F8F1D7",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  questLockedText: {
    color: "#CBD5E1",
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    marginVertical: 6,
  },
  questLockedButton: {
    borderWidth: 2,
    backgroundColor: "#111827",
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  questLockedButtonText: {
    color: "#F8F1D7",
    fontSize: 10,
    fontWeight: "900",
  },
  questRow: {
    minHeight: 39,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderWidth: 2,
    borderColor: "#2E3542",
    paddingHorizontal: 6,
    marginBottom: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  questRowDone: {
    borderColor: "#22C55E",
    backgroundColor: "rgba(20, 83, 45, 0.72)",
  },
  questIconSlot: {
    height: 28,
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  questIcon: {
    fontSize: 18,
  },
  questCopy: {
    flex: 1,
  },
  questText: {
    color: "#F8F1D7",
    fontSize: 12,
    fontWeight: "900",
  },
  questMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
  },
  questMeta: {
    flex: 1,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 1,
  },
  questSteps: {
    fontSize: 10,
    fontWeight: "900",
  },
  reflectButton: {
    height: 25,
    width: 25,
    marginLeft: 5,
    borderWidth: 1,
    borderColor: "#64748B",
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  reflectButtonText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "900",
  },
  checkBox: {
    height: 24,
    width: 24,
    marginLeft: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1020",
  },
  checkBoxDone: {
    backgroundColor: "#166534",
  },
  checkBoxText: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
  },
  statsBar: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(5, 9, 17, 0.96)",
    borderWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  statCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  statDivider: {
    height: 40,
    width: 2,
    backgroundColor: "#4B5563",
  },
  statIcon: {
    fontSize: 26,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  statValue: {
    color: "#F8F1D7",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 1,
  },
  bottomNav: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    height: 66,
    backgroundColor: "rgba(4, 8, 16, 0.98)",
    borderWidth: 3,
    borderRadius: 5,
    padding: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#3A4558",
    borderRadius: 3,
    paddingVertical: 4,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonActive: {
    backgroundColor: "#162314",
  },
  navText: {
    color: "#E2E8F0",
    fontSize: 17,
    fontWeight: "900",
  },
  navTextActive: {
    color: "#FDE68A",
    fontSize: 17,
    fontWeight: "900",
  },
  navLabel: {
    color: "#CBD5E1",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
  },
  navLabelActive: {
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
  },
});