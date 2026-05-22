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
  hours?: string;
  mood?: string;
  stress?: string;
  energy?: number;
  mode?: "Recovery" | "Progress";
  createdAt?: string;
  wakeTime?: string;
  caffeineAmount?: string;
  lastCaffeineTime?: string;
  lastMealTime?: string;
  mealHeaviness?: "Light" | "Medium" | "Heavy";
  windDownGoal?: string;
  estimatedSleepWindow?: string;
  caffeineCutoffSuggestion?: string;
  mealCutoffSuggestion?: string;
};

type DayPlan = {
  Monday: string;
  Tuesday: string;
  Wednesday: string;
  Thursday: string;
  Friday: string;
  Saturday: string;
  Sunday: string;
};

type UserProfile = {
  name: string;
  longTermDream?: string;
  dreamCategory?: string;
  progressMeaning?: string;
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

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function getWeekdayName() {
  const days: Array<keyof DayPlan> = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date().getDay()];
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
    Monday: "",
    Tuesday: "",
    Wednesday: "",
    Thursday: "",
    Friday: "",
    Saturday: "",
    Sunday: "",
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
    setProfile(JSON.parse(saved));
    setProfileChecked(true);
  }

  async function loadQuickThoughts() {
    const saved = await AsyncStorage.getItem(TOMORROW_QUEUE_KEY);
    if (!saved) {
      setQueueItems([]);
      return;
    }
    const parsed = JSON.parse(saved);
    setQueueItems(Array.isArray(parsed) ? parsed : []);
  }

  async function loadDayPlan() {
    const saved = await AsyncStorage.getItem(DAY_PLAN_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    setDayPlan({
      Monday: parsed.Monday || "",
      Tuesday: parsed.Tuesday || "",
      Wednesday: parsed.Wednesday || "",
      Thursday: parsed.Thursday || "",
      Friday: parsed.Friday || "",
      Saturday: parsed.Saturday || "",
      Sunday: parsed.Sunday || "",
    });
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

    if (savedQuests) setCompletedQuests(JSON.parse(savedQuests));
  }

  async function loadLatestCheckIn() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);

    if (!saved) {
      setHasSavedCheckIn(false);
      setLatestCheckIn(null);
      return;
    }

    const checkIn = JSON.parse(saved) as CheckIn;

    setLatestCheckIn(checkIn);

    if (
      (checkIn.mode === "Recovery" || checkIn.mode === "Progress") &&
      typeof checkIn.energy === "number"
    ) {
      setSavedMode(checkIn.mode);
      setSavedEnergy(checkIn.energy);
      setHasSavedCheckIn(true);
    } else {
      setHasSavedCheckIn(false);
    }
  }

  async function loadLatestIntention() {
    const saved = await AsyncStorage.getItem(LATEST_PRE_SLEEP_INTENTION_KEY);
    if (saved) setLatestIntention(JSON.parse(saved));
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

    if (isAlreadyComplete) await lightHaptic();
    else await successHaptic();

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

  const hoursSlept = latestCheckIn?.hours ? Number(latestCheckIn.hours) : null;
  const shouldSuggestNap = hasEnergyData && hoursSlept !== null && !Number.isNaN(hoursSlept) && hoursSlept < 7;

  const todayName = getWeekdayName();
  const todayRole = dayPlan[todayName]?.trim();

  const flameLabel = useMemo(() => {
    if (!hasEnergyData) return "Check-in needed";
    if (energyYield >= 75) return "Bright Flame";
    if (energyYield >= 45) return "Steady Flame";
    return "Low Flame";
  }, [hasEnergyData, energyYield]);

  const modeTitle = isNeutral ? "Start Today" : isRecovery ? "Recovery Mode" : "Progress Mode";
  const modeInstruction = isNeutral
    ? "Complete a Morning Check-In to calculate your Energy Reserve."
    : isRecovery
    ? "Protect your energy and keep one promise."
    : "Use your energy on the path that matters.";

  const meterFillCount = hasEnergyData ? Math.max(0, Math.min(10, Math.round(energyYield / 10))) : 0;

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
      const text = item?.text?.trim() || item?.title?.trim() || item?.task?.trim() || item?.note?.trim();
      if (!text || unique.has(text)) return;
      unique.add(text);
      result.push({
        title: `Quick thought: ${text}`,
        type: "Quick Thought",
        steps: 1,
        description: "Saved from Quick Thoughts",
      });
    });

    return result;
  }

  function generateQuests(): Quest[] {
    const napQuest: Quest = {
      title: "Take a recovery nap",
      type: "Recovery",
      steps: 1,
      description: "Aim for 30–60 minutes if your schedule allows.",
    };

    const dayPlanQuest: Quest | null = todayRole
      ? { title: `Day plan: ${todayRole}`, type: "Day Plan", steps: 1, description: "Use today’s role to choose your next move." }
      : null;

    const quickThoughtQuests = generateQuickThoughtQuests();

    if (isNeutral) {
      const neutralBase: Quest[] = [
        { title: "Complete Morning Check-In", type: "Start", steps: 1 },
        { title: "Review your current path", type: "Direction", steps: 1 },
        { title: "Choose one small action for today", type: "Plan", steps: 1 },
      ];

      const withNap = shouldSuggestNap ? [neutralBase[0], napQuest, neutralBase[1], neutralBase[2]] : neutralBase;
      const withDayPlan = dayPlanQuest ? [...withNap, dayPlanQuest] : withNap;
      return [...withDayPlan, ...quickThoughtQuests];
    }

    const category = profile?.dreamCategory?.trim() || "Purpose";
    const questMode: "Recovery" | "Progress" = isRecovery ? "Recovery" : "Progress";
    const categoryQuests = getCategoryQuests(category, questMode);

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

    const baseQuests = [...categoryQuests, ...goalQuests, resourceQuest, movementQuest, transportQuest];
    const withNap = shouldSuggestNap ? [napQuest, ...baseQuests] : baseQuests;
    const withDayPlan = dayPlanQuest ? [...withNap, dayPlanQuest] : withNap;

    return [...withDayPlan, ...quickThoughtQuests];
  }

  const quests = generateQuests();

  const completedSteps = quests
    .filter((quest) => completedQuests.includes(quest.title))
    .reduce((sum, quest) => sum + quest.steps, 0);

  const completedVisibleQuests = quests.filter((quest) => completedQuests.includes(quest.title)).length;
  const rank = completedSteps >= 5 ? "Consistent" : "Beginner";

  if (!profileChecked) return null;

  return (
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : isProgress ? styles.progressScreen : styles.neutralScreen}
      contentContainerStyle={styles.container}
    >
      <View style={isRecovery ? styles.recoveryHeader : isProgress ? styles.progressHeader : styles.neutralHeader}>
        <Text style={styles.logo}>lit</Text>
        <Text style={styles.subtitle}>Living in Truth</Text>
        <Text style={styles.headerModeTitle}>{modeTitle}</Text>
        <Text style={styles.headerModeInstruction}>{modeInstruction}</Text>
      </View>

      <View style={styles.energyPanel}>
        <Text style={styles.sectionTitle}>Energy Reserve</Text>
        <Text style={styles.energyValue}>{hasEnergyData ? `${energyYield}/100` : "—/100"}</Text>
        <Text style={styles.sectionHint}>{flameLabel}</Text>
        <View style={styles.energyBlocksRow}>
          {Array.from({ length: 10 }).map((_, index) => {
            const filled = index < meterFillCount;
            return <View key={index} style={[styles.block, filled && styles.blockFilled]} />;
          })}
        </View>
      </View>

      <View style={styles.sleepTimingPanel}>
        <Text style={styles.sectionTitle}>Sleep Timing</Text>
        <Text style={styles.sectionHint}>
          Based on your latest check-in, this gives rough timing suggestions for tonight.
        </Text>
        {!latestCheckIn ? (
          <Text style={styles.itemText}>Complete a Morning Check-In to see sleep timing suggestions.</Text>
        ) : (
          <>
            {latestCheckIn.wakeTime ? <Text style={styles.itemText}>Approx wake time: {latestCheckIn.wakeTime}</Text> : null}
            {latestCheckIn.estimatedSleepWindow ? (
              <Text style={styles.itemText}>Estimated sleep window: {latestCheckIn.estimatedSleepWindow}</Text>
            ) : null}
            {latestCheckIn.caffeineCutoffSuggestion ? (
              <Text style={styles.itemText}>Caffeine cutoff guide: {latestCheckIn.caffeineCutoffSuggestion}</Text>
            ) : null}
            {latestCheckIn.mealCutoffSuggestion ? (
              <Text style={styles.itemText}>Meal cutoff guide: {latestCheckIn.mealCutoffSuggestion}</Text>
            ) : null}
            {latestCheckIn.windDownGoal ? (
              <Text style={styles.itemText}>Wind-down goal: {latestCheckIn.windDownGoal}</Text>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.questPanel}>
        <Text style={styles.sectionTitle}>Quest Board</Text>
        <Text style={styles.sectionHint}>
          Complete quests for steps. If one does not happen, reflect instead of judging yourself.
        </Text>
        <Text style={styles.counterText}>{completedVisibleQuests}/{quests.length}</Text>

        {quests.map((quest, index) => {
          const isComplete = completedQuests.includes(quest.title);

          return (
            <View key={index} style={[styles.questCard, isComplete && styles.questCardDone]}>
              <TouchableOpacity style={styles.questRow} onPress={() => toggleQuest(quest.title)}>
                <View style={styles.questTextWrap}>
                  <Text style={styles.questTitle}>{quest.title}</Text>
                  {quest.description ? <Text style={styles.questDesc}>{quest.description}</Text> : null}
                  <Text style={styles.questMeta}>{quest.type} · +1 step</Text>
                </View>
                <Text style={styles.check}>{isComplete ? "✅" : "⬜"}</Text>
              </TouchableOpacity>

              {!isComplete ? (
                <Link href={{ pathname: "/reflection", params: { quest: quest.title } }} asChild>
                  <TouchableOpacity style={styles.reflectBtn} onPress={lightHaptic}>
                    <Text style={styles.reflectBtnText}>Missed? Reflect</Text>
                  </TouchableOpacity>
                </Link>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.tilesPanel}>
        <Text style={styles.sectionTitle}>Daily Loadout</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/sleep-checkin")}>
            <Text style={styles.tileTitle}>Morning Check-In</Text>
            <Text style={styles.tileText}>Enter sleep, mood, and stress.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/onboarding")}>
            <Text style={styles.tileTitle}>Set My Path</Text>
            <Text style={styles.tileText}>Choose your dream and goals.</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/tomorrow-queue")}>
            <Text style={styles.tileTitle}>Quick Thoughts</Text>
            <Text style={styles.tileText}>Save ideas before they disappear.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/day-plan")}>
            <Text style={styles.tileTitle}>Day Plan</Text>
            <Text style={styles.tileText}>Set what each day is for.</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/sleep-calendar")}>
            <Text style={styles.tileTitle}>Sleep Calendar</Text>
            <Text style={styles.tileText}>Plan caffeine, meals, wind-down, and tomorrow’s thoughts.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/weekly-summary")}>
            <Text style={styles.tileTitle}>Weekly Summary</Text>
            <Text style={styles.tileText}>Review patterns and progress.</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tilesPanel}>
        <Text style={styles.sectionTitle}>Mind</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/journal")}>
            <Text style={styles.tileTitle}>Journal</Text>
            <Text style={styles.tileText}>Write reflections and thought patterns.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/awareness-check")}>
            <Text style={styles.tileTitle}>Meditations</Text>
            <Text style={styles.tileText}>Notice attention and distractions.</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tilesPanel}>
        <Text style={styles.sectionTitle}>Sleep</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/pre-sleep-intention")}>
            <Text style={styles.tileTitle}>Pre-Sleep Intention</Text>
            <Text style={styles.tileText}>Set one intention before bed.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tile} onPress={() => navigateWithHaptic("/morning-intention-reflection")}>
            <Text style={styles.tileTitle}>Morning Reflection</Text>
            <Text style={styles.tileText}>Check what carried into morning.</Text>
          </TouchableOpacity>
        </View>
      </View>

      {latestIntention ? (
        <View style={styles.nightPanel}>
          <Text style={styles.sectionTitle}>Night Signal</Text>
          <Text style={styles.sectionHint}>Review the intention you saved before sleep.</Text>
          <Text style={styles.itemText}>{latestIntention.intention}</Text>
          {latestIntention.firstSmallAction ? (
            <Text style={styles.itemText}>First small action: {latestIntention.firstSmallAction}</Text>
          ) : null}
          <TouchableOpacity style={styles.nightBtn} onPress={() => navigateWithHaptic("/morning-intention-reflection")}>
            <Text style={styles.nightBtnText}>Reflect This Morning</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {todayRole ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Today’s Day Plan</Text>
          <Text style={styles.itemText}>{todayName}: {todayRole}</Text>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Path Map</Text>
        <Text style={styles.sectionHint}>Your dream and goals shape today’s quests.</Text>
        {dreamCategory ? <Text style={styles.itemText}>Category: {dreamCategory}</Text> : null}
        {longTermDream ? <Text style={styles.itemText}>Long-term dream: {longTermDream}</Text> : null}
        <Text style={styles.itemText}>1. {topGoal}</Text>
        <Text style={styles.itemText}>2. {secondGoal}</Text>
        <Text style={styles.itemText}>3. {thirdGoal}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Rank & Steps</Text>
        <Text style={styles.itemText}>Rank: {rank}</Text>
        <Text style={styles.itemText}>Steps earned today: {completedSteps}</Text>
        <Text style={styles.itemText}>Completed quests: {completedVisibleQuests}/{quests.length}</Text>
        <TouchableOpacity style={styles.resetBtn} onPress={resetTodayProgress}>
          <Text style={styles.resetBtnText}>Reset Today Plan</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  neutralScreen: { flex: 1, backgroundColor: "#ECFDF5" },
  progressScreen: { flex: 1, backgroundColor: "#FFF7ED" },
  recoveryScreen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 18, paddingTop: 56, paddingBottom: 32 },

  neutralHeader: { backgroundColor: "#DCFCE7", borderWidth: 3, borderColor: "#22C55E", borderRadius: 20, padding: 14, marginBottom: 12 },
  progressHeader: { backgroundColor: "#FEF3C7", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 20, padding: 14, marginBottom: 12 },
  recoveryHeader: { backgroundColor: "#1E1B4B", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 20, padding: 14, marginBottom: 12 },
  logo: { fontSize: 48, fontWeight: "900", color: "#111827", textAlign: "center" },
  subtitle: { fontSize: 12, fontWeight: "800", color: "#374151", textAlign: "center", marginTop: -4 },
  headerModeTitle: { fontSize: 24, fontWeight: "900", color: "#111827", marginTop: 8, textAlign: "center" },
  headerModeInstruction: { fontSize: 13, fontWeight: "700", color: "#374151", textAlign: "center", marginTop: 4 },

  energyPanel: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#374151", borderRadius: 18, padding: 14, marginBottom: 12 },
  energyValue: { color: "#FBBF24", fontSize: 42, fontWeight: "900", textAlign: "center", marginTop: 4 },
  energyBlocksRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  block: { width: "8.8%", height: 14, borderRadius: 3, backgroundColor: "#374151", borderWidth: 1, borderColor: "#6B7280" },
  blockFilled: { backgroundColor: "#FBBF24", borderColor: "#FEF3C7" },

  sleepTimingPanel: { backgroundColor: "#EEF2FF", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 18, padding: 14, marginBottom: 12 },
  questPanel: { backgroundColor: "#FEF3C7", borderWidth: 3, borderColor: "#F59E0B", borderRadius: 18, padding: 14, marginBottom: 12 },
  tilesPanel: { backgroundColor: "#E0F2FE", borderWidth: 3, borderColor: "#38BDF8", borderRadius: 18, padding: 14, marginBottom: 12 },
  nightPanel: { backgroundColor: "#1E1B4B", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 18, padding: 14, marginBottom: 12 },
  panel: { backgroundColor: "#F9FAFB", borderWidth: 3, borderColor: "#111827", borderRadius: 18, padding: 14, marginBottom: 12 },

  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  sectionHint: { fontSize: 12, color: "#374151", fontWeight: "700", marginTop: 4, lineHeight: 18 },
  itemText: { fontSize: 14, color: "#111827", fontWeight: "700", marginTop: 6, lineHeight: 20 },
  counterText: { fontSize: 12, fontWeight: "900", color: "#111827", marginTop: 6, marginBottom: 8 },

  questCard: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#111827", borderRadius: 12, padding: 10, marginBottom: 8 },
  questCardDone: { backgroundColor: "#DCFCE7", borderColor: "#22C55E" },
  questRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  questTextWrap: { flex: 1, paddingRight: 8 },
  questTitle: { color: "#111827", fontSize: 15, fontWeight: "900" },
  questDesc: { color: "#374151", fontSize: 12, fontWeight: "700", marginTop: 3 },
  questMeta: { color: "#111827", fontSize: 11, fontWeight: "800", marginTop: 4 },
  check: { fontSize: 22 },
  reflectBtn: { marginTop: 8, backgroundColor: "#111827", borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  reflectBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },

  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  tile: { width: "48%", backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 10, minHeight: 96 },
  tileTitle: { color: "#111827", fontWeight: "900", fontSize: 13, marginBottom: 4 },
  tileText: { color: "#374151", fontWeight: "700", fontSize: 11, lineHeight: 16 },

  nightBtn: { marginTop: 10, backgroundColor: "#312E81", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  nightBtnText: { color: "#FFFFFF", fontWeight: "900" },

  resetBtn: { marginTop: 10, backgroundColor: "#111827", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  resetBtnText: { color: "#FFFFFF", fontWeight: "900" },
});