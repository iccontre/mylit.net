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
  energy: number;
  mode: "Recovery" | "Progress";
  createdAt?: string;
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
  const days: Array<keyof DayPlan> = [
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

    const parsed = JSON.parse(saved);

    if (Array.isArray(parsed)) {
      setQueueItems(parsed);
    } else {
      setQueueItems([]);
    }
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

  const hoursSlept = latestCheckIn?.hours ? Number(latestCheckIn.hours) : null;
  const shouldSuggestNap =
    hasEnergyData &&
    hoursSlept !== null &&
    !Number.isNaN(hoursSlept) &&
    hoursSlept < 7;

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

  const lunaMessage = isNeutral
    ? "Check in first. I’ll build the quest board around your real energy."
    : isRecovery
    ? "Recovery counts. Choose the smallest honest step."
    : "Energy is available. Pick the quest that moves your path forward.";

  const meterFillCount = hasEnergyData ? Math.max(0, Math.min(10, Math.round(energyYield / 10))) : 0;

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

  function generateQuests(): Quest[] {
    const napQuest: Quest = {
      title: "Take a recovery nap",
      type: "Recovery",
      steps: 1,
      description: "Aim for 30–60 minutes if your schedule allows.",
    };

    const dayPlanQuest: Quest | null = todayRole
      ? {
          title: `Day plan: ${todayRole}`,
          type: "Day Plan",
          steps: 1,
          description: "Use today’s theme to choose your next move.",
        }
      : null;

    const quickThoughtQuests = generateQuickThoughtQuests();

    if (isNeutral) {
      const neutralBase: Quest[] = [
        { title: "Complete Morning Check-In", type: "Start", steps: 1 },
        { title: "Review your current path", type: "Direction", steps: 1 },
        { title: "Choose one small action for today", type: "Plan", steps: 1 },
      ];

      const withNap = shouldSuggestNap
        ? [neutralBase[0], napQuest, neutralBase[1], neutralBase[2]]
        : neutralBase;

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

    const baseQuests = [
      ...categoryQuests,
      ...goalQuests,
      resourceQuest,
      movementQuest,
      transportQuest,
    ];

    const withNap = shouldSuggestNap ? [napQuest, ...baseQuests] : baseQuests;
    const withDayPlan = dayPlanQuest ? [...withNap, dayPlanQuest] : withNap;

    return [...withDayPlan, ...quickThoughtQuests];
  }

  const quests = generateQuests();

  const completedSteps = quests
    .filter((quest) => completedQuests.includes(quest.title))
    .reduce((sum, quest) => sum + quest.steps, 0);

  const completedVisibleQuests = quests.filter((quest) =>
    completedQuests.includes(quest.title)
  ).length;

  const rank = completedSteps >= 5 ? "Consistent" : "Beginner";

  const moveQuestDone = quests.some(
    (q) => (q.type === "Body" || q.title.toLowerCase().includes("movement")) && completedQuests.includes(q.title)
  )
    ? 1
    : 0;

  const focusValue = `${completedVisibleQuests}/${quests.length}`;
  const reflectValue = quests.some((q) => q.title.toLowerCase().includes("reflect")) ? 1 : 0;

  if (!profileChecked) return null;

  return (
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : isProgress ? styles.progressScreen : styles.neutralScreen}
      contentContainerStyle={styles.container}
    >
      <View style={isRecovery ? styles.recoveryHeader : isProgress ? styles.progressHeader : styles.neutralHeader}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.headerSquareButton} onPress={() => navigateWithHaptic("/onboarding")}>
            <Text style={styles.headerSquareText}>🌿</Text>
          </TouchableOpacity>

          <View style={styles.logoBlock}>
            <Text style={styles.logo}>lit</Text>
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
            <Text style={styles.trackMarkerLabelText}>{isNeutral ? "Check-in" : isRecovery ? "Recovery" : "Active"}</Text>
          </View>
        </View>

        <View style={styles.trackLine}>
          <View style={[styles.trackMarkerDot, isNeutral && styles.trackMarkerStart, isProgress && styles.trackMarkerMid, isRecovery && styles.trackMarkerEnd]} />
        </View>

        <View style={styles.trackTimesRow}>
          <View style={styles.trackTimeItem}><Text style={styles.trackIcon}>🌅</Text><Text style={styles.trackTimeText}>6 AM</Text></View>
          <View style={styles.trackTimeItem}><Text style={styles.trackIcon}>☀️</Text><Text style={styles.trackTimeText}>12 PM</Text></View>
          <View style={styles.trackTimeItem}><Text style={styles.trackIcon}>🌇</Text><Text style={styles.trackTimeText}>6 PM</Text></View>
          <View style={styles.trackTimeItem}><Text style={styles.trackIcon}>🌙</Text><Text style={styles.trackTimeText}>12 AM</Text></View>
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
            <Text style={styles.energyModeBadgeText}>{isNeutral ? "Not set" : isRecovery ? "Recovery" : "Progress"}</Text>
          </View>
        </View>

        <View style={styles.energyScoreRow}>
          <Text style={styles.energyScore}>{hasEnergyData ? energyYield : "—"}</Text>
          <Text style={styles.energyOutOf}>/100</Text>
        </View>

        <View style={styles.energyBlocksRow}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.energyBlock,
                i < meterFillCount && isNeutral ? styles.energyBlockNeutral : null,
                i < meterFillCount && isProgress ? styles.energyBlockProgress : null,
                i < meterFillCount && isRecovery ? styles.energyBlockRecovery : null,
              ]}
            />
          ))}
        </View>

        <Text style={styles.energyHint}>
          {isNeutral
            ? "Complete a Morning Check-In to calculate today’s Energy Reserve."
            : isRecovery
            ? "Check your energy. Keep one promise."
            : "Check your energy. Choose your next move."}
        </Text>
      </View>

      <View style={styles.questBoardPanel}>
        <View style={styles.questBoardHeaderRow}>
          <View style={styles.questBoardHeaderLeft}>
            <Text style={styles.sectionTitle}>Quest Board</Text>
            <Text style={styles.sectionHint}>Complete quests for steps. If one does not happen, reflect instead of judging yourself.</Text>
          </View>
          <View style={styles.questCounterBadge}>
            <Text style={styles.questCounterText}>{completedVisibleQuests}/{quests.length}</Text>
          </View>
        </View>

        {quests.map((quest, index) => {
          const isComplete = completedQuests.includes(quest.title);

          return (
            <View key={`${quest.title}-${index}`} style={isComplete ? styles.questTileCleared : styles.questTile}>
              <TouchableOpacity style={styles.questRow} onPress={() => toggleQuest(quest.title)}>
                <View style={styles.questBody}>
                  <Text style={styles.questTile}>{quest.title}</Text>
                  {quest.description ? <Text style={styles.questDesc}>{quest.description}</Text> : null}
                  <View style={styles.questMetaRow}>
                    <View style={styles.questTypeBadge}><Text style={styles.questTypeText}>{quest.type}</Text></View>
                    <View style={styles.questRewardBadge}><Text style={styles.questRewardText}>+{quest.steps} step</Text></View>
                  </View>
                </View>

                <View style={styles.questCheckBoxWrap}>
                  <Text style={styles.questCheckIcon}>{isComplete ? "✅" : "⬜"}</Text>
                </View>
              </TouchableOpacity>

              {!isComplete ? (
                <Link href={{ pathname: "/reflection", params: { quest: quest.title } }} asChild>
                  <TouchableOpacity style={styles.questReflectButton} onPress={lightHaptic}>
                    <Text style={styles.questReflectText}>Missed? Reflect</Text>
                  </TouchableOpacity>
                </Link>
              ) : (
                <View style={styles.questClearedPill}><Text style={styles.questClearedText}>Cleared</Text></View>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.smallStatPanel}>
          <Text style={styles.smallStatTitle}>Daily Goals</Text>
          <Text style={styles.smallStatLine}>Move: {moveQuestDone}</Text>
          <Text style={styles.smallStatLine}>Focus: {focusValue}</Text>
          <Text style={styles.smallStatLine}>Reflect: {reflectValue}</Text>
        </View>

        <View style={styles.smallStatPanel}>
          <Text style={styles.smallStatTitle}>Steps & Rank</Text>
          <Text style={styles.smallStatLine}>Steps: {completedSteps}</Text>
          <Text style={styles.smallStatLine}>Rank: {rank}</Text>
          <Text style={styles.smallStatLine}>Quests: {completedVisibleQuests}/{quests.length}</Text>
        </View>
      </View>

      <View style={styles.featurePanel}>
        <Text style={styles.sectionTitle}>Daily Loadout</Text>
        <View style={styles.tileRow}>
          <TouchableOpacity style={styles.tileGold} onPress={() => navigateWithHaptic("/sleep-checkin")}>
            <Text style={styles.tileIcon}>🔥</Text>
            <Text style={styles.tileTitle}>Morning Check-In</Text>
            <Text style={styles.tileText}>Enter sleep, mood, and stress.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tileGold} onPress={() => navigateWithHaptic("/onboarding")}>
            <Text style={styles.tileIcon}>🧭</Text>
            <Text style={styles.tileTitle}>Set My Path</Text>
            <Text style={styles.tileText}>Choose your dream and goals.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tileRowSecond}>
          <TouchableOpacity style={styles.tileGreen} onPress={() => navigateWithHaptic("/tomorrow-queue")}>
            <Text style={styles.tileIcon}>💭</Text>
            <Text style={styles.tileTitle}>Quick Thoughts</Text>
            <Text style={styles.tileText}>Save ideas before they disappear.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tileGreen} onPress={() => navigateWithHaptic("/day-plan")}>
            <Text style={styles.tileIcon}>📅</Text>
            <Text style={styles.tileTitle}>Day Plan</Text>
            <Text style={styles.tileText}>Set what each day is for.</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.featurePanelBlue}>
        <Text style={styles.sectionTitle}>Mind</Text>
        <View style={styles.tileRow}>
          <TouchableOpacity style={styles.tileBlue} onPress={() => navigateWithHaptic("/journal")}>
            <Text style={styles.tileIcon}>📓</Text>
            <Text style={styles.tileTitle}>Journal</Text>
            <Text style={styles.tileText}>Write reflections and thought patterns.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tileBlue} onPress={() => navigateWithHaptic("/awareness-check")}>
            <Text style={styles.tileIcon}>🧠</Text>
            <Text style={styles.tileTitle}>Meditations</Text>
            <Text style={styles.tileText}>Notice attention and distractions.</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.featurePanelPurple}>
        <Text style={styles.sectionTitle}>Sleep</Text>
        <View style={styles.tileRow}>
          <TouchableOpacity style={styles.tilePurple} onPress={() => navigateWithHaptic("/pre-sleep-intention")}>
            <Text style={styles.tileIcon}>🌙</Text>
            <Text style={styles.tileTitle}>Pre-Sleep Intention</Text>
            <Text style={styles.tileText}>Set one intention before bed.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tilePurple} onPress={() => navigateWithHaptic("/morning-intention-reflection")}>
            <Text style={styles.tileIcon}>☀️</Text>
            <Text style={styles.tileTitle}>Morning Reflection</Text>
            <Text style={styles.tileText}>Check what carried into morning.</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.featurePanelGreen}>
        <Text style={styles.sectionTitle}>Growth</Text>
        <View style={styles.tileRow}>
          <TouchableOpacity style={styles.tileGreen} onPress={() => navigateWithHaptic("/weekly-summary")}>
            <Text style={styles.tileIcon}>📊</Text>
            <Text style={styles.tileTitle}>Weekly Summary</Text>
            <Text style={styles.tileText}>Review patterns and progress.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tileGreen} onPress={() => navigateWithHaptic("/next-chapter")}>
            <Text style={styles.tileIcon}>🧱</Text>
            <Text style={styles.tileTitle}>Set Your Next Long-Term Goal</Text>
            <Text style={styles.tileText}>Update your direction.</Text>
          </TouchableOpacity>
        </View>
      </View>

      {latestIntention ? (
        <View style={styles.nightPanel}>
          <Text style={styles.sectionTitle}>Night Signal</Text>
          <Text style={styles.sectionHint}>Review the intention you saved before sleep.</Text>
          <Text style={styles.nightText}>{latestIntention.intention}</Text>
          {latestIntention.firstSmallAction ? (
            <Text style={styles.nightSubText}>First small action: {latestIntention.firstSmallAction}</Text>
          ) : null}
          <TouchableOpacity style={styles.nightButton} onPress={() => navigateWithHaptic("/morning-intention-reflection")}>
            <Text style={styles.nightButtonText}>Reflect This Morning</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.nightPanel}>
          <Text style={styles.sectionTitle}>Sleep Signal</Text>
          <Text style={styles.sectionHint}>Set an intention before bed when you’re ready.</Text>
          <TouchableOpacity style={styles.nightButton} onPress={() => navigateWithHaptic("/pre-sleep-intention")}>
            <Text style={styles.nightButtonText}>Set Pre-Sleep Intention</Text>
          </TouchableOpacity>
        </View>
      )}

      {todayRole ? (
        <View style={styles.dayPlanPanel}>
          <Text style={styles.sectionTitle}>Today’s Day Plan</Text>
          <Text style={styles.dayPlanValue}>{todayName}: {todayRole}</Text>
          <Text style={styles.sectionHint}>Use this as the theme for today’s quests.</Text>
        </View>
      ) : null}

      <View style={styles.pathPanel}>
        <Text style={styles.sectionTitle}>Path Map</Text>
        <Text style={styles.sectionHint}>Your dream and goals shape today’s quests.</Text>

        {dreamCategory ? <Text style={styles.pathMeta}>Category: {dreamCategory}</Text> : null}
        {longTermDream ? <Text style={styles.pathMeta}>Long-term dream: {longTermDream}</Text> : null}

        <View style={styles.pathStep}><Text style={styles.pathStepNum}>1</Text><Text style={styles.pathStepBody}>{topGoal}</Text></View>
        <View style={styles.pathStep}><Text style={styles.pathStepNum}>2</Text><Text style={styles.pathStepBody}>{secondGoal}</Text></View>
        <View style={styles.pathStep}><Text style={styles.pathStepNum}>3</Text><Text style={styles.pathStepBody}>{thirdGoal}</Text></View>
      </View>

      <View style={styles.rankPanelLarge}>
        <Text style={styles.sectionTitle}>Rank & Steps</Text>
        <Text style={styles.rankTextLarge}>Rank: {rank}</Text>
        <Text style={styles.rankDetail}>Steps earned today: {completedSteps}</Text>
        <Text style={styles.rankDetail}>Completed quests: {completedVisibleQuests}/{quests.length}</Text>

        <TouchableOpacity style={styles.resetButton} onPress={resetTodayProgress}>
          <Text style={styles.resetButtonText}>Reset Today Plan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomBtnActive} onPress={lightHaptic}>
          <Text style={styles.bottomIcon}>🏠</Text>
          <Text style={styles.bottomText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomBtn} onPress={lightHaptic}>
          <Text style={styles.bottomIcon}>🗂</Text>
          <Text style={styles.bottomText}>Quests</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomBtn} onPress={() => navigateWithHaptic("/journal")}>
          <Text style={styles.bottomIcon}>🧠</Text>
          <Text style={styles.bottomText}>Mind</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomBtn} onPress={() => navigateWithHaptic("/weekly-summary")}>
          <Text style={styles.bottomIcon}>📊</Text>
          <Text style={styles.bottomText}>Stats</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomBtn} onPress={() => navigateWithHaptic("/journal")}>
          <Text style={styles.bottomIcon}>📓</Text>
          <Text style={styles.bottomText}>Journal</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  neutralScreen: { flex: 1, backgroundColor: "#ECFDF5" },
  progressScreen: { flex: 1, backgroundColor: "#FFF7ED" },
  recoveryScreen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 18, paddingTop: 52, paddingBottom: 36 },

  neutralHeader: { backgroundColor: "#DCFCE7", borderColor: "#22C55E", borderWidth: 4, borderRadius: 24, padding: 14, marginBottom: 12 },
  progressHeader: { backgroundColor: "#FEF3C7", borderColor: "#FBBF24", borderWidth: 4, borderRadius: 24, padding: 14, marginBottom: 12 },
  recoveryHeader: { backgroundColor: "#1E1B4B", borderColor: "#A78BFA", borderWidth: 4, borderRadius: 24, padding: 14, marginBottom: 12 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSquareButton: { width: 56, height: 56, borderRadius: 14, borderWidth: 3, borderColor: "#111827", backgroundColor: "#F9FAFB", alignItems: "center", justifyContent: "center" },
  headerSquareText: { fontSize: 22 },
  logoBlock: { flex: 1, alignItems: "center", marginHorizontal: 10 },
  logo: { fontSize: 52, fontWeight: "900", color: "#111827", letterSpacing: -2 },
  subtitle: { fontSize: 12, fontWeight: "800", color: "#374151", marginTop: -4 },
  headerModePanel: { marginTop: 12, borderWidth: 3, borderColor: "#111827", borderRadius: 16, backgroundColor: "#F9FAFB", padding: 12 },
  headerModeTitle: { fontSize: 22, fontWeight: "900", color: "#111827", marginBottom: 2 },
  headerModeInstruction: { fontSize: 13, fontWeight: "800", color: "#374151", lineHeight: 18 },

  timeTrackPanel: { backgroundColor: "#111827", borderColor: "#374151", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  trackHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  trackTitle: { color: "#F9FAFB", fontSize: 16, fontWeight: "900" },
  trackMarkerLabel: { borderRadius: 999, borderWidth: 1, borderColor: "#F9FAFB", paddingVertical: 4, paddingHorizontal: 10 },
  trackMarkerLabelText: { color: "#111827", fontWeight: "900", fontSize: 11 },
  trackLine: { height: 12, borderRadius: 6, backgroundColor: "#374151", borderWidth: 1, borderColor: "#6B7280", marginBottom: 10, justifyContent: "center" },
  trackMarkerDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#FBBF24", borderWidth: 2, borderColor: "#F9FAFB", marginLeft: "45%" },
  trackMarkerStart: { marginLeft: "2%", backgroundColor: "#22C55E" },
  trackMarkerMid: { marginLeft: "42%", backgroundColor: "#FBBF24" },
  trackMarkerEnd: { marginLeft: "80%", backgroundColor: "#A78BFA" },
  trackTimesRow: { flexDirection: "row", justifyContent: "space-between" },
  trackTimeItem: { width: "24%", alignItems: "center" },
  trackIcon: { fontSize: 14, marginBottom: 2 },
  trackTimeText: { color: "#D1D5DB", fontSize: 11, fontWeight: "800" },

  neutralLunaBox: { backgroundColor: "#BBF7D0", borderColor: "#22C55E", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12, flexDirection: "row" },
  progressLunaBox: { backgroundColor: "#FEF3C7", borderColor: "#FBBF24", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12, flexDirection: "row" },
  recoveryLunaBox: { backgroundColor: "#EEF2FF", borderColor: "#A78BFA", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12, flexDirection: "row" },
  lunaOrb: { width: 54, height: 54, borderRadius: 16, backgroundColor: "#111827", borderWidth: 2, borderColor: "#FBBF24", alignItems: "center", justifyContent: "center", marginRight: 10 },
  lunaOrbText: { color: "#F9FAFB", fontSize: 24, fontWeight: "900" },
  lunaSpeech: { flex: 1 },
  lunaTag: { alignSelf: "flex-start", backgroundColor: "#111827", color: "#F9FAFB", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9, overflow: "hidden", fontSize: 11, fontWeight: "900", marginBottom: 5 },
  lunaText: { color: "#111827", fontSize: 14, fontWeight: "800", lineHeight: 20, marginBottom: 5 },
  lunaPath: { color: "#374151", fontSize: 12, fontWeight: "800" },

  neutralEnergyPanel: { backgroundColor: "#14532D", borderColor: "#22C55E", borderWidth: 4, borderRadius: 22, padding: 14, marginBottom: 12 },
  progressEnergyPanel: { backgroundColor: "#111827", borderColor: "#FBBF24", borderWidth: 4, borderRadius: 22, padding: 14, marginBottom: 12 },
  recoveryEnergyPanel: { backgroundColor: "#1E1B4B", borderColor: "#A78BFA", borderWidth: 4, borderRadius: 22, padding: 14, marginBottom: 12 },
  energyTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  energyTitle: { color: "#F9FAFB", fontSize: 20, fontWeight: "900" },
  energyLabel: { color: "#E5E7EB", fontSize: 12, fontWeight: "800" },
  energyModeBadge: { backgroundColor: "#F9FAFB", borderRadius: 999, borderWidth: 1, borderColor: "#111827", paddingVertical: 6, paddingHorizontal: 10 },
  energyModeBadgeText: { color: "#111827", fontSize: 11, fontWeight: "900" },
  energyScoreRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", marginBottom: 8 },
  energyScore: { color: "#FBBF24", fontSize: 52, fontWeight: "900", lineHeight: 56 },
  energyOutOf: { color: "#F9FAFB", fontSize: 20, fontWeight: "900", marginBottom: 8, marginLeft: 2 },
  energyBlocksRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  energyBlock: { width: "8.7%", height: 16, borderRadius: 4, backgroundColor: "#374151", borderWidth: 1, borderColor: "#6B7280" },
  energyBlockNeutral: { backgroundColor: "#22C55E", borderColor: "#BBF7D0" },
  energyBlockProgress: { backgroundColor: "#FBBF24", borderColor: "#FEF3C7" },
  energyBlockRecovery: { backgroundColor: "#A78BFA", borderColor: "#EEF2FF" },
  energyHint: { color: "#E5E7EB", fontSize: 12, fontWeight: "800", lineHeight: 18 },

  questBoardPanel: { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 4, borderRadius: 24, padding: 14, marginBottom: 12 },
  questBoardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  questBoardHeaderLeft: { flex: 1, marginRight: 8 },
  sectionTitle: { color: "#111827", fontSize: 20, fontWeight: "900", marginBottom: 4 },
  sectionHint: { color: "#374151", fontSize: 12, fontWeight: "800", lineHeight: 17 },
  questCounterBadge: { backgroundColor: "#111827", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, marginTop: 2 },
  questCounterText: { color: "#F9FAFB", fontSize: 11, fontWeight: "900" },
  questTile: { backgroundColor: "#F9FAFB", borderColor: "#111827", borderWidth: 3, borderRadius: 16, padding: 10, marginBottom: 8 },
  questTileCleared: { backgroundColor: "#ECFDF5", borderColor: "#22C55E", borderWidth: 3, borderRadius: 16, padding: 10, marginBottom: 8 },
  questRow: { flexDirection: "row", alignItems: "center" },
  questBody: { flex: 1 },
  questDesc: { color: "#374151", fontSize: 11, lineHeight: 16, fontWeight: "800", marginBottom: 5 },
  questMetaRow: { flexDirection: "row", alignItems: "center" },
  questTypeBadge: { backgroundColor: "#E0F2FE", borderColor: "#38BDF8", borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, marginRight: 7 },
  questTypeText: { color: "#111827", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  questRewardBadge: { backgroundColor: "#FBBF24", borderColor: "#111827", borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  questRewardText: { color: "#111827", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  questCheckBoxWrap: { marginLeft: 8 },
  questCheckIcon: { fontSize: 22 },
  questReflectButton: { marginTop: 8, borderRadius: 10, backgroundColor: "#111827", borderColor: "#374151", borderWidth: 2, alignItems: "center", paddingVertical: 8 },
  questReflectText: { color: "#F9FAFB", fontSize: 12, fontWeight: "900" },
  questClearedPill: { marginTop: 8, borderRadius: 999, backgroundColor: "#22C55E", borderColor: "#14532D", borderWidth: 2, alignItems: "center", paddingVertical: 6 },
  questClearedText: { color: "#052E16", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },

  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  smallStatPanel: { width: "48%", backgroundColor: "#E0F2FE", borderColor: "#38BDF8", borderWidth: 3, borderRadius: 16, padding: 10 },
  smallStatTitle: { color: "#111827", fontSize: 14, fontWeight: "900", marginBottom: 6 },
  smallStatLine: { color: "#374151", fontSize: 12, fontWeight: "800", marginBottom: 2 },

  featurePanel: { backgroundColor: "#FFF7ED", borderColor: "#FBBF24", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  featurePanelBlue: { backgroundColor: "#EFF6FF", borderColor: "#38BDF8", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  featurePanelPurple: { backgroundColor: "#EEF2FF", borderColor: "#A78BFA", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  featurePanelGreen: { backgroundColor: "#ECFDF5", borderColor: "#22C55E", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  tileRow: { flexDirection: "row", justifyContent: "space-between" },
  tileRowSecond: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  tileGold: { width: "48%", backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 3, borderRadius: 14, padding: 10, minHeight: 106 },
  tileGreen: { width: "48%", backgroundColor: "#DCFCE7", borderColor: "#22C55E", borderWidth: 3, borderRadius: 14, padding: 10, minHeight: 106 },
  tileBlue: { width: "48%", backgroundColor: "#E0F2FE", borderColor: "#38BDF8", borderWidth: 3, borderRadius: 14, padding: 10, minHeight: 106 },
  tilePurple: { width: "48%", backgroundColor: "#EEF2FF", borderColor: "#A78BFA", borderWidth: 3, borderRadius: 14, padding: 10, minHeight: 106 },
  tileIcon: { fontSize: 16, marginBottom: 4 },
  tileTitle: { color: "#111827", fontSize: 13, fontWeight: "900", marginBottom: 3 },
  tileText: { color: "#374151", fontSize: 11, lineHeight: 16, fontWeight: "800" },

  nightPanel: { backgroundColor: "#1E1B4B", borderColor: "#A78BFA", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  nightText: { color: "#F9FAFB", fontSize: 14, fontWeight: "900", lineHeight: 20, marginBottom: 6 },
  nightSubText: { color: "#E5E7EB", fontSize: 12, fontWeight: "800", lineHeight: 17, marginBottom: 10 },
  nightButton: { backgroundColor: "#312E81", borderColor: "#A78BFA", borderWidth: 2, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  nightButtonText: { color: "#F9FAFB", fontSize: 12, fontWeight: "900" },

  dayPlanPanel: { backgroundColor: "#E0F2FE", borderColor: "#38BDF8", borderWidth: 3, borderRadius: 18, padding: 12, marginBottom: 12 },
  dayPlanValue: { color: "#111827", fontSize: 14, fontWeight: "900", marginBottom: 4 },

  pathPanel: { backgroundColor: "#F9FAFB", borderColor: "#111827", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  pathMeta: { color: "#374151", fontSize: 12, fontWeight: "800", marginBottom: 4 },
  pathStep: { backgroundColor: "#FEF3C7", borderColor: "#FBBF24", borderWidth: 2, borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", marginTop: 6 },
  pathStepNum: { width: 24, height: 24, borderRadius: 8, backgroundColor: "#111827", color: "#F9FAFB", fontSize: 12, fontWeight: "900", textAlign: "center", paddingTop: 4, marginRight: 8, overflow: "hidden" },
  pathStepBody: { flex: 1, color: "#111827", fontSize: 13, fontWeight: "900", lineHeight: 18 },

  rankPanelLarge: { backgroundColor: "#ECFDF5", borderColor: "#22C55E", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  rankTextLarge: { color: "#111827", fontSize: 16, fontWeight: "900", marginBottom: 4 },
  rankDetail: { color: "#374151", fontSize: 12, fontWeight: "800", marginBottom: 2 },
  resetButton: { marginTop: 10, backgroundColor: "#111827", borderColor: "#FBBF24", borderWidth: 2, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  resetButtonText: { color: "#F9FAFB", fontSize: 12, fontWeight: "900" },

  bottomBar: { backgroundColor: "#111827", borderColor: "#374151", borderWidth: 3, borderRadius: 18, padding: 8, flexDirection: "row", justifyContent: "space-between" },
  bottomBtnActive: { width: "19%", backgroundColor: "#FEF3C7", borderColor: "#FBBF24", borderWidth: 2, borderRadius: 10, paddingVertical: 7, alignItems: "center" },
  bottomBtn: { width: "19%", backgroundColor: "#1F2937", borderColor: "#4B5563", borderWidth: 2, borderRadius: 10, paddingVertical: 7, alignItems: "center" },
  bottomIcon: { fontSize: 14, marginBottom: 2 },
  bottomText: { fontSize: 10, fontWeight: "900", color: "#F9FAFB" },
});