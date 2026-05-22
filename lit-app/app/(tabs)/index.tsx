import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

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

function getRankName(completedSteps: number) {
  return completedSteps >= 5 ? "Consistent" : "Beginner";
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
  const shouldSuggestNap =
    hasEnergyData &&
    hoursSlept !== null &&
    !Number.isNaN(hoursSlept) &&
    hoursSlept < 7;

  const todayName = getWeekdayName();
  const todayRole = dayPlan[todayName]?.trim();

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

  const flameLabel = useMemo(() => {
    if (!hasEnergyData) return "CHECK-IN NEEDED";
    if (energyYield >= 75) return "BRIGHT FLAME";
    if (energyYield >= 45) return "STEADY FLAME";
    return "LOW FLAME";
  }, [hasEnergyData, energyYield]);

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
      ? {
          title: `Day plan: ${todayRole}`,
          type: "Day Plan",
          steps: 1,
          description: "Use today’s role to choose your next move.",
        }
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

  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });

  if (!profileChecked) return null;

  return (
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : isProgress ? styles.progressScreen : styles.neutralScreen}
      contentContainerStyle={styles.container}
    >
      <View style={[styles.worldBackdrop, isNeutral && styles.worldNeutral, isProgress && styles.worldProgress, isRecovery && styles.worldRecovery]}>
        <View style={styles.worldTopRow}>
          <TouchableOpacity style={styles.iconTile} onPress={() => navigateWithHaptic("/onboarding")}>
            <Text style={styles.iconTileText}>🌿</Text>
          </TouchableOpacity>
          <View style={styles.logoWrap}>
            <Text style={[styles.logo, { fontFamily: mono }]}>lit</Text>
            <Text style={styles.logoSub}>LIVING IN TRUTH</Text>
            <Text style={styles.modeTitle}>{modeTitle.toUpperCase()}</Text>
            <Text style={styles.modeInstruction}>{modeInstruction}</Text>
          </View>
          <TouchableOpacity style={styles.iconTile} onPress={() => navigateWithHaptic("/onboarding")}>
            <Text style={styles.iconTileText}>🧭</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.celestial, isRecovery ? styles.moon : styles.sun]} />
        <View style={styles.terrainRow}>
          <View style={styles.terrainBlock} />
          <View style={styles.terrainBlockShort} />
          <View style={styles.terrainBlock} />
          <View style={styles.terrainBlockShort} />
        </View>
      </View>

      <View style={styles.dayTrackPanel}>
        <View style={styles.dayTrackLine} />
        <View style={[styles.modeMarker, isNeutral && styles.markerNeutral, isProgress && styles.markerProgress, isRecovery && styles.markerRecovery]} />
        <View style={styles.dayTrackTimes}>
          <View style={styles.dayTrackItem}><Text style={styles.dayTrackEmoji}>🌅</Text><Text style={styles.dayTrackText}>6 AM</Text></View>
          <View style={styles.dayTrackItem}><Text style={styles.dayTrackEmoji}>☀️</Text><Text style={styles.dayTrackText}>12 PM</Text></View>
          <View style={styles.dayTrackItem}><Text style={styles.dayTrackEmoji}>🌇</Text><Text style={styles.dayTrackText}>6 PM</Text></View>
          <View style={styles.dayTrackItem}><Text style={styles.dayTrackEmoji}>🌙</Text><Text style={styles.dayTrackText}>12 AM</Text></View>
        </View>
      </View>

      <View style={styles.rowWrap}>
        <View style={styles.halfPanel}>
          <View style={styles.lunaRow}>
            <View style={styles.lunaOrb}><Text style={styles.lunaOrbText}>L</Text></View>
            <View style={styles.lunaBubble}>
              <Text style={styles.lunaTag}>Luna</Text>
              <Text style={styles.lunaMessage}>{lunaMessage}</Text>
              <Text style={styles.lunaPath}>Main path: {topGoal}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.halfPanel, styles.energyPanel]}>
          <Text style={[styles.hudTitle, { fontFamily: mono }]}>ENERGY RESERVE</Text>
          <Text style={[styles.energyScore, { fontFamily: mono }]}>{hasEnergyData ? `${energyYield}/100` : "—/100"}</Text>
          <Text style={styles.energyLabel}>{flameLabel}</Text>
          <Text style={styles.energyHint}>
            {hasEnergyData ? (isRecovery ? "Keep one promise." : "Choose your next move.") : "Complete Morning Check-In to calculate this."}
          </Text>
          <View style={styles.energyMeterRow}>
            {Array.from({ length: 10 }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.energyMeterBlock,
                  index < meterFillCount && styles.energyMeterBlockOn,
                  index < meterFillCount && isRecovery && styles.energyMeterBlockRecovery,
                  index < meterFillCount && isNeutral && styles.energyMeterBlockNeutral,
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.questPanel}>
        <View style={styles.questHeaderRow}>
          <Text style={[styles.hudTitle, { fontFamily: mono }]}>QUEST BOARD</Text>
          <Text style={styles.questCount}>{completedVisibleQuests}/{quests.length}</Text>
        </View>
        <Text style={styles.questHint}>Complete quests for steps. Missed one? Reflect.</Text>

        {quests.map((quest, index) => {
          const isComplete = completedQuests.includes(quest.title);

          return (
            <View key={index} style={[styles.questRowCard, isComplete && styles.questRowCardDone]}>
              <TouchableOpacity style={styles.questMainRow} onPress={() => toggleQuest(quest.title)}>
                <Text style={styles.questIcon}>{isComplete ? "✅" : "⬜"}</Text>
                <View style={styles.questTextCol}>
                  <Text style={styles.questTitle}>{quest.title}</Text>
                  {quest.description ? <Text style={styles.questDescription}>{quest.description}</Text> : null}
                  <View style={styles.questMetaRow}>
                    <Text style={styles.questBadge}>{quest.type}</Text>
                    <Text style={styles.questReward}>+1</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {!isComplete ? (
                <Link href={{ pathname: "/reflection", params: { quest: quest.title } }} asChild>
                  <TouchableOpacity style={styles.reflectBtn} onPress={lightHaptic}>
                    <Text style={styles.reflectBtnText}>Reflect</Text>
                  </TouchableOpacity>
                </Link>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.widgetGrid}>
        <View style={styles.widgetCard}>
          <Text style={[styles.hudMiniTitle, { fontFamily: mono }]}>SLEEP TIMING</Text>
          <Text style={styles.widgetBody}>
            {latestCheckIn?.estimatedSleepWindow || "Check-in needed"}
          </Text>
          <TouchableOpacity style={styles.widgetBtn} onPress={() => navigateWithHaptic("/sleep-calendar")}>
            <Text style={styles.widgetBtnText}>Open Calendar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.widgetCard}>
          <Text style={[styles.hudMiniTitle, { fontFamily: mono }]}>DAY PLAN</Text>
          <Text style={styles.widgetBody}>{todayRole || "No role set"}</Text>
          <TouchableOpacity style={styles.widgetBtn} onPress={() => navigateWithHaptic("/day-plan")}>
            <Text style={styles.widgetBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.widgetCard}>
          <Text style={[styles.hudMiniTitle, { fontFamily: mono }]}>NIGHT SIGNAL</Text>
          <Text style={styles.widgetBody}>
            {latestIntention?.intention || "No signal set"}
          </Text>
          <TouchableOpacity
            style={styles.widgetBtn}
            onPress={() =>
              navigateWithHaptic(latestIntention ? "/morning-intention-reflection" : "/pre-sleep-intention")
            }
          >
            <Text style={styles.widgetBtnText}>{latestIntention ? "Reflect" : "Set"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.widgetCard}>
          <Text style={[styles.hudMiniTitle, { fontFamily: mono }]}>PATH MAP</Text>
          <Text style={styles.widgetBody}>{topGoal}</Text>
          <TouchableOpacity style={styles.widgetBtn} onPress={() => navigateWithHaptic("/onboarding")}>
            <Text style={styles.widgetBtnText}>Edit Path</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.menuPanel}>
        <Text style={[styles.hudTitle, { fontFamily: mono }]}>MENU</Text>
        <View style={styles.menuGrid}>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/sleep-checkin")}><Text style={styles.menuTileText}>Check-In</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/onboarding")}><Text style={styles.menuTileText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/tomorrow-queue")}><Text style={styles.menuTileText}>Thoughts</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/day-plan")}><Text style={styles.menuTileText}>Day Plan</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/sleep-calendar")}><Text style={styles.menuTileText}>Sleep Cal</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/journal")}><Text style={styles.menuTileText}>Journal</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/awareness-check")}><Text style={styles.menuTileText}>Meditate</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/pre-sleep-intention")}><Text style={styles.menuTileText}>Sleep Intent</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/morning-intention-reflection")}><Text style={styles.menuTileText}>Morning Reflect</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/weekly-summary")}><Text style={styles.menuTileText}>Stats</Text></TouchableOpacity>
          <TouchableOpacity style={styles.menuTile} onPress={() => navigateWithHaptic("/next-chapter")}><Text style={styles.menuTileText}>Long Goal</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.rankPanel}>
        <Text style={[styles.hudTitle, { fontFamily: mono }]}>STEPS & RANK</Text>
        <Text style={styles.rankText}>Steps earned: {completedSteps}</Text>
        <Text style={styles.rankText}>Completed quests: {completedVisibleQuests}/{quests.length}</Text>
        <Text style={styles.rankText}>Rank: {getRankName(completedSteps)}</Text>
        <TouchableOpacity style={styles.resetBtn} onPress={resetTodayProgress}>
          <Text style={styles.resetBtnText}>Reset Today Plan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.bottomItem, styles.bottomItemActive]} onPress={lightHaptic}>
          <Text style={styles.bottomTextActive}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomItem} onPress={lightHaptic}>
          <Text style={styles.bottomText}>Quests</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomItem} onPress={() => navigateWithHaptic("/journal")}>
          <Text style={styles.bottomText}>Mind</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomItem} onPress={() => navigateWithHaptic("/pre-sleep-intention")}>
          <Text style={styles.bottomText}>Sleep</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomItem} onPress={() => navigateWithHaptic("/weekly-summary")}>
          <Text style={styles.bottomText}>Stats</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  neutralScreen: { flex: 1, backgroundColor: "#ECFDF5" },
  progressScreen: { flex: 1, backgroundColor: "#FFF7ED" },
  recoveryScreen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 42, paddingBottom: 28 },

  worldBackdrop: { borderRadius: 18, borderWidth: 3, padding: 12, marginBottom: 12, overflow: "hidden" },
  worldNeutral: { backgroundColor: "#BBF7D0", borderColor: "#22C55E" },
  worldProgress: { backgroundColor: "#FDE68A", borderColor: "#FBBF24" },
  worldRecovery: { backgroundColor: "#020617", borderColor: "#A78BFA" },

  worldTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  iconTile: { width: 52, height: 52, borderWidth: 2, borderColor: "#111827", backgroundColor: "#FFFFFF", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  iconTileText: { fontSize: 20 },
  logoWrap: { flex: 1, alignItems: "center", marginHorizontal: 8 },
  logo: { fontSize: 50, fontWeight: "900", letterSpacing: 2, color: "#111827" },
  logoSub: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: "#374151", marginTop: -6 },
  modeTitle: { marginTop: 8, fontSize: 20, fontWeight: "900", letterSpacing: 1, color: "#111827" },
  modeInstruction: { marginTop: 4, textAlign: "center", fontSize: 12, color: "#374151", fontWeight: "700" },

  celestial: { width: 28, height: 28, borderRadius: 14, marginTop: 10, alignSelf: "center" },
  sun: { backgroundColor: "#FBBF24", borderWidth: 2, borderColor: "#92400E" },
  moon: { backgroundColor: "#C4B5FD", borderWidth: 2, borderColor: "#A78BFA" },

  terrainRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  terrainBlock: { width: "23%", height: 18, backgroundColor: "#166534", borderRadius: 4 },
  terrainBlockShort: { width: "23%", height: 12, backgroundColor: "#22C55E", borderRadius: 4, marginTop: 6 },

  dayTrackPanel: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 10, marginBottom: 12 },
  dayTrackLine: { height: 6, backgroundColor: "#4B5563", borderRadius: 3, marginBottom: 8 },
  modeMarker: { width: 12, height: 12, borderRadius: 2, borderWidth: 2, borderColor: "#F9FAFB", marginTop: -16, marginBottom: 4 },
  markerNeutral: { marginLeft: "2%", backgroundColor: "#22C55E" },
  markerProgress: { marginLeft: "45%", backgroundColor: "#FBBF24" },
  markerRecovery: { marginLeft: "85%", backgroundColor: "#A78BFA" },
  dayTrackTimes: { flexDirection: "row", justifyContent: "space-between" },
  dayTrackItem: { width: "24%", alignItems: "center" },
  dayTrackEmoji: { fontSize: 13 },
  dayTrackText: { marginTop: 2, fontSize: 10, color: "#F9FAFB", fontWeight: "800" },

  rowWrap: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  halfPanel: { width: "49%", backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 8 },

  lunaRow: { flexDirection: "row" },
  lunaOrb: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#111827", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FBBF24", marginRight: 6 },
  lunaOrbText: { color: "#F9FAFB", fontWeight: "900", fontSize: 20 },
  lunaBubble: { flex: 1 },
  lunaTag: { alignSelf: "flex-start", backgroundColor: "#111827", color: "#F9FAFB", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, fontSize: 10, fontWeight: "900", overflow: "hidden", marginBottom: 4 },
  lunaMessage: { fontSize: 12, color: "#111827", fontWeight: "700", lineHeight: 16 },
  lunaPath: { marginTop: 4, fontSize: 11, color: "#374151", fontWeight: "800" },

  energyPanel: { backgroundColor: "#111827", borderColor: "#FBBF24" },
  hudTitle: { fontSize: 15, letterSpacing: 1, fontWeight: "900", color: "#F9FAFB", textTransform: "uppercase", marginBottom: 3 },
  energyScore: { color: "#FBBF24", fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  energyLabel: { color: "#F9FAFB", fontSize: 10, fontWeight: "800", marginTop: 2 },
  energyHint: { color: "#D1D5DB", fontSize: 10, marginTop: 4, fontWeight: "700", lineHeight: 14 },
  energyMeterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  energyMeterBlock: { width: "8.8%", height: 8, backgroundColor: "#374151", borderRadius: 2 },
  energyMeterBlockOn: { backgroundColor: "#FBBF24" },
  energyMeterBlockRecovery: { backgroundColor: "#A78BFA" },
  energyMeterBlockNeutral: { backgroundColor: "#22C55E" },

  questPanel: { backgroundColor: "#FEF3C7", borderWidth: 3, borderColor: "#F59E0B", borderRadius: 14, padding: 10, marginBottom: 12 },
  questHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  questCount: { backgroundColor: "#111827", color: "#F9FAFB", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, fontWeight: "900", fontSize: 10, overflow: "hidden" },
  questHint: { fontSize: 11, color: "#374151", fontWeight: "700", marginBottom: 8 },
  questRowCard: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#374151", borderRadius: 10, padding: 8, marginBottom: 6 },
  questRowCardDone: { backgroundColor: "#DCFCE7", borderColor: "#22C55E" },
  questMainRow: { flexDirection: "row", alignItems: "flex-start" },
  questIcon: { fontSize: 18, marginRight: 6 },
  questTextCol: { flex: 1 },
  questTitle: { fontSize: 13, color: "#111827", fontWeight: "900" },
  questDescription: { fontSize: 10, color: "#374151", marginTop: 2, fontWeight: "700" },
  questMetaRow: { flexDirection: "row", marginTop: 4 },
  questBadge: { fontSize: 9, color: "#111827", backgroundColor: "#E0F2FE", borderWidth: 1, borderColor: "#38BDF8", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden", marginRight: 4, fontWeight: "900" },
  questReward: { fontSize: 9, color: "#111827", backgroundColor: "#FBBF24", borderWidth: 1, borderColor: "#92400E", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden", fontWeight: "900" },
  reflectBtn: { marginTop: 6, backgroundColor: "#111827", borderRadius: 8, paddingVertical: 6, alignItems: "center" },
  reflectBtnText: { color: "#F9FAFB", fontSize: 11, fontWeight: "900" },

  widgetGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 12 },
  widgetCard: { width: "48%", backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#374151", borderRadius: 10, padding: 8, marginBottom: 8 },
  hudMiniTitle: { fontSize: 11, letterSpacing: 1, color: "#111827", fontWeight: "900", textTransform: "uppercase", marginBottom: 3 },
  widgetBody: { fontSize: 11, color: "#374151", fontWeight: "700", minHeight: 28 },
  widgetBtn: { marginTop: 6, backgroundColor: "#111827", borderRadius: 7, paddingVertical: 6, alignItems: "center" },
  widgetBtnText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },

  menuPanel: { backgroundColor: "#E0F2FE", borderWidth: 2, borderColor: "#38BDF8", borderRadius: 12, padding: 10, marginBottom: 12 },
  menuGrid: { flexDirection: "row", flexWrap: "wrap" },
  menuTile: { width: "31%", marginRight: "3.5%", marginBottom: 8, backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#374151", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 5, alignItems: "center" },
  menuTileText: { fontSize: 10, color: "#111827", fontWeight: "900", textAlign: "center" },

  rankPanel: { backgroundColor: "#1E1B4B", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 12, padding: 10, marginBottom: 12 },
  rankText: { color: "#EEF2FF", fontSize: 12, fontWeight: "700", marginTop: 4 },
  resetBtn: { marginTop: 8, backgroundColor: "#111827", borderColor: "#FBBF24", borderWidth: 1, borderRadius: 8, paddingVertical: 7, alignItems: "center" },
  resetBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },

  bottomBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, flexDirection: "row", justifyContent: "space-between", padding: 6 },
  bottomItem: { width: "19%", borderRadius: 8, backgroundColor: "#1F2937", paddingVertical: 8, alignItems: "center" },
  bottomItemActive: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  bottomText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  bottomTextActive: { color: "#111827", fontSize: 10, fontWeight: "900" },
});