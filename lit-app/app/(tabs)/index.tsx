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
  goalOne?: string;
  goalTwo?: string;
  goalThree?: string;
  hasTransportation?: boolean;
  hasGymAccess?: boolean;
  hasQuietSpace?: boolean;
};

type PreSleepIntention = {
  intention: string;
  firstSmallAction: string;
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

function getRankName(completedSteps: number) {
  return completedSteps >= 5 ? "Consistent" : "Beginner";
}

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });

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

  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [latestIntention, setLatestIntention] = useState<PreSleepIntention | null>(null);
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

  async function loadLatestCheckIn() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);
    if (!saved) {
      setHasSavedCheckIn(false);
      setLatestCheckIn(null);
      return;
    }

    const checkIn = JSON.parse(saved) as CheckIn;

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
      setLatestCheckIn(checkIn);
    }
  }

  async function loadLatestIntention() {
    const saved = await AsyncStorage.getItem(LATEST_PRE_SLEEP_INTENTION_KEY);
    if (saved) setLatestIntention(JSON.parse(saved));
  }

  async function loadQuickThoughts() {
    const saved = await AsyncStorage.getItem(TOMORROW_QUEUE_KEY);
    if (!saved) return setQueueItems([]);
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

  async function saveCompletedQuests(nextCompleted: string[]) {
    const today = getTodayKey();
    setCompletedQuests(nextCompleted);
    await AsyncStorage.setItem(TODAY_PROGRESS_DATE_KEY, today);
    await AsyncStorage.setItem(COMPLETED_QUESTS_KEY, JSON.stringify(nextCompleted));
  }

  async function toggleQuest(title: string) {
    const isAlreadyComplete = completedQuests.includes(title);
    const next = isAlreadyComplete
      ? completedQuests.filter((item) => item !== title)
      : [...completedQuests, title];

    if (isAlreadyComplete) await lightHaptic();
    else await successHaptic();

    await saveCompletedQuests(next);
  }

  async function resetTodayProgress() {
    await mediumHaptic();
    await saveCompletedQuests([]);
  }

  const topGoal = profile?.goalOne?.trim() || "your top goal";
  const secondGoal = profile?.goalTwo?.trim() || "your next goal";
  const thirdGoal = profile?.goalThree?.trim() || "your future";

  const todayName = getWeekdayName();
  const todayRole = dayPlan[todayName]?.trim();

  const flameLabel = useMemo(() => {
    if (!hasEnergyData) return "CHECK-IN NEEDED";
    if (energyYield >= 75) return "BRIGHT FLAME";
    if (energyYield >= 45) return "STEADY FLAME";
    return "LOW FLAME";
  }, [hasEnergyData, energyYield]);

  const modeTitle = isNeutral ? "START TODAY" : isRecovery ? "RECOVERY MODE" : "PROGRESS MODE";
  const modeInstruction = isNeutral
    ? "Complete Morning Check-In to calculate your Energy Reserve."
    : isRecovery
    ? "Keep one promise and protect your energy."
    : "Choose the quest that moves your path forward.";

  const lunaMessage = isNeutral
    ? "Check in first. I’ll build today’s quests around your real energy."
    : isRecovery
    ? "Recovery counts. Choose the smallest honest step."
    : "Energy is available. Pick the quest that moves your path forward.";

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
    const quickThoughtQuests = generateQuickThoughtQuests();

    const dayPlanQuest: Quest | null = todayRole
      ? {
          title: `Day plan: ${todayRole}`,
          type: "Day Plan",
          steps: 1,
          description: "Set what the day is for.",
        }
      : null;

    if (isNeutral) {
      const neutralBase: Quest[] = [
        { title: "Complete Morning Check-In", type: "Start", steps: 1 },
        { title: "Review your current path", type: "Direction", steps: 1 },
        { title: "Choose one small action for today", type: "Plan", steps: 1 },
      ];
      const withDayPlan = dayPlanQuest ? [neutralBase[0], dayPlanQuest, neutralBase[1], neutralBase[2]] : neutralBase;
      return [...withDayPlan, ...quickThoughtQuests];
    }

    const category = profile?.dreamCategory?.trim() || "Purpose";
    const modeType: "Recovery" | "Progress" = isRecovery ? "Recovery" : "Progress";
    const categoryQuests = getCategoryQuests(category, modeType);
    const goalQuests: Quest[] = [
      { title: `Goal step: ${topGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${secondGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${thirdGoal}`, type: "Goal", steps: 1 },
    ];

    const base = [...categoryQuests, ...goalQuests];
    const withDayPlan = dayPlanQuest ? [dayPlanQuest, ...base] : base;
    return [...withDayPlan, ...quickThoughtQuests];
  }

  const quests = generateQuests();
  const visibleQuests = quests.slice(0, 5);

  const completedVisibleQuests = visibleQuests.filter((q) => completedQuests.includes(q.title)).length;
  const completedSteps = visibleQuests
    .filter((q) => completedQuests.includes(q.title))
    .reduce((sum, q) => sum + q.steps, 0);

  if (!profileChecked) return null;

  return (
    <ScrollView
      style={isRecovery ? styles.recoveryScreen : isProgress ? styles.progressScreen : styles.neutralScreen}
      contentContainerStyle={styles.container}
    >
      <View style={styles.contentShell}>
        <View style={[styles.headerCard, isNeutral && styles.headerNeutral, isProgress && styles.headerProgress, isRecovery && styles.headerRecovery]}>
          <Text style={[styles.logoText, { fontFamily: mono }]}>lit</Text>
          <Text style={styles.modeTitle}>{modeTitle}</Text>
          <Text style={styles.modeInstruction}>{modeInstruction}</Text>
        </View>

        <View style={styles.trackCard}>
          <View style={styles.trackLine} />
          <View style={[styles.trackMarker, isNeutral && styles.markerNeutral, isProgress && styles.markerProgress, isRecovery && styles.markerRecovery]} />
          <View style={styles.trackTimes}>
            <Text style={styles.trackLabel}>6 AM 🌅</Text>
            <Text style={styles.trackLabel}>12 PM ☀️</Text>
            <Text style={styles.trackLabel}>6 PM 🌇</Text>
            <Text style={styles.trackLabel}>12 AM 🌙</Text>
          </View>
        </View>

        <View style={styles.energyCard}>
          <Text style={[styles.sectionTitleLight, { fontFamily: mono }]}>ENERGY RESERVE</Text>
          <Text style={[styles.energyValue, { fontFamily: mono }]}>{hasEnergyData ? `${energyYield}/100` : "—/100"}</Text>
          <Text style={styles.energyMeta}>{flameLabel}</Text>
          <View style={styles.meterRow}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View key={i} style={[styles.meterBlock, i < meterFillCount && styles.meterBlockOn]} />
            ))}
          </View>
          <TouchableOpacity style={styles.checkinBtn} onPress={() => navigateWithHaptic("/sleep-checkin")}>
            <Text style={styles.checkinBtnText}>Morning Check-In</Text>
            <Text style={styles.checkinSubText}>Check sleep, mood, and stress.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaTag}>Luna</Text>
          <Text style={styles.lunaMessage}>{lunaMessage}</Text>
          <Text style={styles.lunaPath}>Main path: {topGoal}</Text>
        </View>

        <View style={styles.questCard}>
          <View style={styles.questHeader}>
            <Text style={[styles.sectionTitleDark, { fontFamily: mono }]}>QUEST BOARD</Text>
            <Text style={styles.questCount}>{completedVisibleQuests}/{visibleQuests.length}</Text>
          </View>

          {visibleQuests.map((quest, idx) => {
            const done = completedQuests.includes(quest.title);

            return (
              <View key={idx} style={[styles.questRow, done && styles.questRowDone]}>
                <TouchableOpacity style={styles.questRowMain} onPress={() => toggleQuest(quest.title)}>
                  <View style={styles.questTextWrap}>
                    <Text style={styles.questTitle}>{quest.title}</Text>
                    {quest.description ? <Text style={styles.questDesc}>{quest.description}</Text> : null}
                    <View style={styles.questMetaRow}>
                      <Text style={styles.questBadge}>{quest.type}</Text>
                      <Text style={styles.questPill}>+1</Text>
                    </View>
                  </View>
                  <Text style={styles.questCheck}>{done ? "✅" : "⬜"}</Text>
                </TouchableOpacity>

                {!done ? (
                  <Link href={{ pathname: "/reflection", params: { quest: quest.title } }} asChild>
                    <TouchableOpacity style={styles.reflectBtn} onPress={lightHaptic}>
                      <Text style={styles.reflectText}>Reflect</Text>
                    </TouchableOpacity>
                  </Link>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.rankCard}>
          <Text style={[styles.sectionTitleLight, { fontFamily: mono }]}>STEPS & RANK</Text>
          <Text style={styles.rankText}>Steps: {completedSteps}</Text>
          <Text style={styles.rankText}>Completed: {completedVisibleQuests}/{visibleQuests.length}</Text>
          <Text style={styles.rankText}>Rank: {getRankName(completedSteps)}</Text>
          <TouchableOpacity style={styles.resetBtn} onPress={resetTodayProgress}>
            <Text style={styles.resetBtnText}>Reset Today Plan</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={[styles.bottomItem, styles.bottomItemActive]} onPress={lightHaptic}><Text style={styles.bottomTextActive}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => navigateWithHaptic("/sleep")}><Text style={styles.bottomText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => navigateWithHaptic("/calendar")}><Text style={styles.bottomText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => navigateWithHaptic("/mind")}><Text style={styles.bottomText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => navigateWithHaptic("/path")}><Text style={styles.bottomText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={styles.bottomItem} onPress={() => navigateWithHaptic("/stats")}><Text style={styles.bottomText}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  neutralScreen: { flex: 1, backgroundColor: "#ECFDF5" },
  progressScreen: { flex: 1, backgroundColor: "#FFF7ED" },
  recoveryScreen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 38, paddingBottom: 24 },
  contentShell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  headerCard: { borderWidth: 3, borderRadius: 18, padding: 12, marginBottom: 10 },
  headerNeutral: { backgroundColor: "#DCFCE7", borderColor: "#22C55E" },
  headerProgress: { backgroundColor: "#FEF3C7", borderColor: "#FBBF24" },
  headerRecovery: { backgroundColor: "#1E1B4B", borderColor: "#A78BFA" },

  logoText: { fontSize: 48, fontWeight: "900", letterSpacing: 2, color: "#111827", textAlign: "center" },
  modeTitle: { fontSize: 20, fontWeight: "900", letterSpacing: 1, color: "#111827", textAlign: "center", marginTop: 4 },
  modeInstruction: { fontSize: 12, color: "#374151", fontWeight: "700", textAlign: "center", marginTop: 4 },

  trackCard: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 10, marginBottom: 10 },
  trackLine: { height: 6, backgroundColor: "#4B5563", borderRadius: 3, marginBottom: 8 },
  trackMarker: { width: 12, height: 12, borderRadius: 2, borderWidth: 2, borderColor: "#F9FAFB", marginTop: -16, marginBottom: 4 },
  markerNeutral: { marginLeft: "2%", backgroundColor: "#22C55E" },
  markerProgress: { marginLeft: "45%", backgroundColor: "#FBBF24" },
  markerRecovery: { marginLeft: "85%", backgroundColor: "#A78BFA" },
  trackTimes: { flexDirection: "row", justifyContent: "space-between" },
  trackLabel: { fontSize: 10, fontWeight: "800", color: "#F9FAFB" },

  energyCard: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 14, padding: 12, marginBottom: 10 },
  sectionTitleLight: { color: "#F9FAFB", fontSize: 13, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  sectionTitleDark: { color: "#111827", fontSize: 13, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  energyValue: { color: "#FBBF24", fontSize: 36, fontWeight: "900" },
  energyMeta: { color: "#F9FAFB", fontSize: 11, fontWeight: "800", marginTop: 2 },
  meterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 8 },
  meterBlock: { width: "8.8%", height: 8, backgroundColor: "#374151", borderRadius: 2 },
  meterBlockOn: { backgroundColor: "#FBBF24" },
  checkinBtn: { marginTop: 4, backgroundColor: "#1F2937", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  checkinBtnText: { color: "#F9FAFB", fontWeight: "900", fontSize: 13 },
  checkinSubText: { color: "#CBD5E1", fontSize: 10, fontWeight: "700", marginTop: 2 },

  lunaCard: { backgroundColor: "#EEF2FF", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 12, padding: 10, marginBottom: 10 },
  lunaTag: { alignSelf: "flex-start", backgroundColor: "#111827", color: "#F9FAFB", fontSize: 10, fontWeight: "900", borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, overflow: "hidden", marginBottom: 4 },
  lunaMessage: { color: "#111827", fontSize: 12, fontWeight: "700", lineHeight: 17 },
  lunaPath: { color: "#374151", fontSize: 11, fontWeight: "800", marginTop: 4 },

  questCard: { backgroundColor: "#FEF3C7", borderWidth: 3, borderColor: "#F59E0B", borderRadius: 14, padding: 10, marginBottom: 10 },
  questHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  questCount: { backgroundColor: "#111827", color: "#F9FAFB", fontSize: 10, fontWeight: "900", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, overflow: "hidden" },

  questRow: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#374151", borderRadius: 10, padding: 8, marginBottom: 6 },
  questRowDone: { backgroundColor: "#DCFCE7", borderColor: "#22C55E" },
  questRowMain: { flexDirection: "row", alignItems: "flex-start" },
  questTextWrap: { flex: 1 },
  questTitle: { color: "#111827", fontSize: 12, fontWeight: "900" },
  questDesc: { color: "#374151", fontSize: 10, fontWeight: "700", marginTop: 2 },
  questMetaRow: { flexDirection: "row", marginTop: 4 },
  questBadge: { color: "#111827", fontSize: 9, fontWeight: "900", borderRadius: 999, borderWidth: 1, borderColor: "#38BDF8", backgroundColor: "#E0F2FE", paddingVertical: 2, paddingHorizontal: 6, overflow: "hidden", marginRight: 4 },
  questPill: { color: "#111827", fontSize: 9, fontWeight: "900", borderRadius: 999, borderWidth: 1, borderColor: "#92400E", backgroundColor: "#FBBF24", paddingVertical: 2, paddingHorizontal: 6, overflow: "hidden" },
  questCheck: { fontSize: 18, marginLeft: 6 },
  reflectBtn: { marginTop: 6, alignSelf: "flex-end", borderRadius: 8, backgroundColor: "#111827", paddingVertical: 5, paddingHorizontal: 10 },
  reflectText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },

  rankCard: { backgroundColor: "#1E1B4B", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 12, padding: 10, marginBottom: 10 },
  rankText: { color: "#EEF2FF", fontSize: 12, fontWeight: "700", marginTop: 4 },
  resetBtn: { marginTop: 8, backgroundColor: "#111827", borderWidth: 1, borderColor: "#FBBF24", borderRadius: 8, alignItems: "center", paddingVertical: 7 },
  resetBtnText: { color: "#F9FAFB", fontSize: 11, fontWeight: "900" },

  bottomBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  bottomItem: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  bottomItemActive: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  bottomText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  bottomTextActive: { color: "#111827", fontSize: 10, fontWeight: "900" },
});