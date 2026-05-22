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
};

type ModeState = "Recovery" | "Progress" | "Neutral";

const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const TODAY_PROGRESS_DATE_KEY = "lit_today_progress_date";
const PROFILE_KEY = "lit_user_profile";
const CHECKIN_KEY = "lit_latest_checkin";
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
  const pixelFont = Platform.select({
    ios: "Menlo",
    android: "monospace",
    web: "monospace",
    default: "monospace",
  });

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

  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
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

  async function saveCompletedQuests(nextCompleted: string[]) {
    const today = getTodayKey();
    setCompletedQuests(nextCompleted);
    await AsyncStorage.setItem(TODAY_PROGRESS_DATE_KEY, today);
    await AsyncStorage.setItem(COMPLETED_QUESTS_KEY, JSON.stringify(nextCompleted));
  }

  async function toggleQuest(title: string) {
    const isDone = completedQuests.includes(title);
    const next = isDone
      ? completedQuests.filter((item) => item !== title)
      : [...completedQuests, title];

    if (isDone) await lightHaptic();
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

  const flameLabel = useMemo(() => {
    if (!hasEnergyData) return "CHECK-IN NEEDED";
    if (energyYield >= 75) return "BRIGHT FLAME";
    if (energyYield >= 45) return "STEADY FLAME";
    return "LOW FLAME";
  }, [hasEnergyData, energyYield]);

  const meterFillCount = hasEnergyData ? Math.max(0, Math.min(10, Math.round(energyYield / 10))) : 0;

  const todayName = getWeekdayName();
  const todayRole = dayPlan[todayName]?.trim();

  function generateQuickThoughtQuests(): Quest[] {
    const unique = new Set<string>();
    const list: Quest[] = [];

    queueItems.forEach((item) => {
      const text = item.text?.trim() || item.title?.trim() || item.task?.trim() || item.note?.trim();
      if (!text || unique.has(text)) return;
      unique.add(text);
      list.push({
        title: `Quick thought: ${text}`,
        type: "Quick Thought",
        steps: 1,
      });
    });

    return list;
  }

  function generateQuests(): Quest[] {
    const quick = generateQuickThoughtQuests();

    const dayQuest: Quest | null = todayRole
      ? {
          title: `Day plan: ${todayRole}`,
          type: "Day Plan",
          steps: 1,
          description: "Set what the day is for.",
        }
      : null;

    const neutralBase: Quest[] = [
      { title: "Complete Morning Check-In", type: "Start", steps: 1 },
      { title: `Goal step: ${topGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${secondGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${thirdGoal}`, type: "Goal", steps: 1 },
    ];

    const progressBase: Quest[] = [
      { title: `Goal step: ${topGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${secondGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${thirdGoal}`, type: "Goal", steps: 1 },
      { title: isRecovery ? "Protect your sleep window tonight" : "Use one focused action block", type: "Mode", steps: 1 },
    ];

    const list = isNeutral ? neutralBase : progressBase;
    const withDay = dayQuest ? [dayQuest, ...list] : list;

    return [...withDay, ...quick];
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
      <View style={styles.shell}>
        <View style={[styles.hero, isNeutral && styles.heroNeutral, isProgress && styles.heroProgress, isRecovery && styles.heroRecovery]}>
          <View style={styles.heroPixelRow}>
            <View style={styles.pixelBlock} />
            <View style={styles.pixelBlockSmall} />
            <View style={styles.pixelBlock} />
            <View style={styles.pixelBlockSmall} />
          </View>
          <Text style={[styles.logo, { fontFamily: pixelFont }]}>lit</Text>
          <Text style={styles.modeTitle}>{modeTitle}</Text>
          <Text style={styles.modeSubtitle}>{modeInstruction}</Text>
        </View>

        <View style={styles.trackCard}>
          <View style={styles.trackLine} />
          <View style={[styles.trackMarker, isNeutral && styles.markerNeutral, isProgress && styles.markerProgress, isRecovery && styles.markerRecovery]} />
          <View style={styles.trackLabels}>
            <Text style={styles.trackText}>6 AM 🌅</Text>
            <Text style={styles.trackText}>12 PM ☀️</Text>
            <Text style={styles.trackText}>6 PM 🌇</Text>
            <Text style={styles.trackText}>12 AM 🌙</Text>
          </View>
        </View>

        <View style={styles.energyCard}>
          <Text style={[styles.sectionLabelLight, { fontFamily: pixelFont }]}>ENERGY RESERVE</Text>
          <Text style={[styles.energyValue, { fontFamily: pixelFont }]}>{hasEnergyData ? `${energyYield}/100` : "—/100"}</Text>
          <Text style={styles.energyMeta}>{flameLabel}</Text>
          <View style={styles.energyMeter}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View key={i} style={[styles.meterBlock, i < meterFillCount && styles.meterBlockOn]} />
            ))}
          </View>
          <TouchableOpacity style={styles.checkinBtn} onPress={() => navigateWithHaptic("/sleep-checkin")}>
            <Text style={styles.checkinBtnTitle}>Morning Check-In</Text>
            <Text style={styles.checkinBtnSub}>Check sleep, mood, and stress.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaTag}>Luna</Text>
          <Text style={styles.lunaText}>{lunaMessage}</Text>
          <Text style={styles.lunaPath}>Main path: {topGoal}</Text>
        </View>

        <View style={styles.questCard}>
          <View style={styles.questHeader}>
            <Text style={[styles.sectionLabelDark, { fontFamily: pixelFont }]}>QUEST BOARD</Text>
            <Text style={styles.questCounter}>{completedVisibleQuests}/{visibleQuests.length}</Text>
          </View>

          {visibleQuests.map((quest, idx) => {
            const done = completedQuests.includes(quest.title);

            return (
              <View key={idx} style={[styles.questRow, done && styles.questRowDone]}>
                <TouchableOpacity style={styles.questMain} onPress={() => toggleQuest(quest.title)}>
                  <View style={styles.questBody}>
                    <Text style={styles.questTitle}>{quest.title}</Text>
                    {quest.description ? <Text style={styles.questDesc}>{quest.description}</Text> : null}
                    <View style={styles.questMeta}>
                      <Text style={styles.questType}>{quest.type}</Text>
                      <Text style={styles.questReward}>+1</Text>
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
          <Text style={[styles.sectionLabelLight, { fontFamily: pixelFont }]}>STEPS & RANK</Text>
          <Text style={styles.rankText}>Steps: {completedSteps}</Text>
          <Text style={styles.rankText}>Completed: {completedVisibleQuests}/{visibleQuests.length}</Text>
          <Text style={styles.rankText}>Rank: {getRankName(completedSteps)}</Text>
          <TouchableOpacity style={styles.resetBtn} onPress={resetTodayProgress}>
            <Text style={styles.resetText}>Reset Today Plan</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={[styles.navBtn, styles.navBtnActive]} onPress={lightHaptic}>
            <Text style={styles.navTextActive}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/sleep")}>
            <Text style={styles.navText}>Sleep</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/calendar")}>
            <Text style={styles.navText}>Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/mind")}>
            <Text style={styles.navText}>Mind</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/path")}>
            <Text style={styles.navText}>Path</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/stats")}>
            <Text style={styles.navText}>Stats</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const styles = StyleSheet.create({
  neutralScreen: { flex: 1, backgroundColor: "#ECFDF5" },
  progressScreen: { flex: 1, backgroundColor: "#FFF7ED" },
  recoveryScreen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 34, paddingBottom: 24 },

  shell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  hero: { borderWidth: 3, borderRadius: 18, padding: 12, marginBottom: 10 },
  heroNeutral: { backgroundColor: "#DCFCE7", borderColor: "#22C55E" },
  heroProgress: { backgroundColor: "#FEF3C7", borderColor: "#FBBF24" },
  heroRecovery: { backgroundColor: "#1E1B4B", borderColor: "#A78BFA" },

  heroPixelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  pixelBlock: { width: 20, height: 8, backgroundColor: "#111827", borderRadius: 2, opacity: 0.45 },
  pixelBlockSmall: { width: 12, height: 6, backgroundColor: "#111827", borderRadius: 2, opacity: 0.25 },

  logo: { fontSize: 50, fontWeight: "900", letterSpacing: 2, color: "#111827", textAlign: "center" },
  modeTitle: { textAlign: "center", fontSize: 20, letterSpacing: 1, fontWeight: "900", color: "#111827", marginTop: 4 },
  modeSubtitle: { textAlign: "center", fontSize: 12, color: "#374151", fontWeight: "700", marginTop: 4, lineHeight: 18 },

  trackCard: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 10, marginBottom: 10 },
  trackLine: { height: 6, borderRadius: 3, backgroundColor: "#4B5563", marginBottom: 8 },
  trackMarker: { width: 12, height: 12, borderRadius: 2, borderWidth: 2, borderColor: "#F9FAFB", marginTop: -16, marginBottom: 4 },
  markerNeutral: { marginLeft: "2%", backgroundColor: "#22C55E" },
  markerProgress: { marginLeft: "45%", backgroundColor: "#FBBF24" },
  markerRecovery: { marginLeft: "85%", backgroundColor: "#A78BFA" },
  trackLabels: { flexDirection: "row", justifyContent: "space-between" },
  trackText: { color: "#F9FAFB", fontSize: 10, fontWeight: "800" },

  energyCard: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 14, padding: 12, marginBottom: 10 },
  sectionLabelLight: { color: "#F9FAFB", fontSize: 12, letterSpacing: 1, fontWeight: "900", textTransform: "uppercase" },
  sectionLabelDark: { color: "#111827", fontSize: 12, letterSpacing: 1, fontWeight: "900", textTransform: "uppercase" },
  energyValue: { color: "#FBBF24", fontSize: 36, fontWeight: "900", marginTop: 4 },
  energyMeta: { color: "#F9FAFB", fontSize: 11, fontWeight: "800", marginTop: 2 },
  energyMeter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 8 },
  meterBlock: { width: "8.8%", height: 8, backgroundColor: "#374151", borderRadius: 2 },
  meterBlockOn: { backgroundColor: "#FBBF24" },

  checkinBtn: { backgroundColor: "#1F2937", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  checkinBtnTitle: { color: "#F9FAFB", fontSize: 13, fontWeight: "900" },
  checkinBtnSub: { color: "#CBD5E1", fontSize: 10, fontWeight: "700", marginTop: 2 },

  lunaCard: { backgroundColor: "#EEF2FF", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 12, padding: 10, marginBottom: 10 },
  lunaTag: {
    alignSelf: "flex-start",
    backgroundColor: "#111827",
    color: "#F9FAFB",
    fontSize: 10,
    fontWeight: "900",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    overflow: "hidden",
    marginBottom: 4,
  },
  lunaText: { color: "#111827", fontSize: 12, fontWeight: "700", lineHeight: 18 },
  lunaPath: { color: "#374151", fontSize: 11, fontWeight: "800", marginTop: 4 },

  questCard: { backgroundColor: "#FEF3C7", borderWidth: 3, borderColor: "#F59E0B", borderRadius: 14, padding: 10, marginBottom: 10 },
  questHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  questCounter: {
    backgroundColor: "#111827",
    color: "#F9FAFB",
    fontSize: 10,
    fontWeight: "900",
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
    overflow: "hidden",
  },

  questRow: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#374151", borderRadius: 10, padding: 8, marginBottom: 6 },
  questRowDone: { backgroundColor: "#DCFCE7", borderColor: "#22C55E" },
  questMain: { flexDirection: "row", alignItems: "flex-start" },
  questBody: { flex: 1 },
  questTitle: { color: "#111827", fontSize: 12, fontWeight: "900" },
  questDesc: { color: "#374151", fontSize: 10, fontWeight: "700", marginTop: 2 },
  questMeta: { flexDirection: "row", marginTop: 4 },
  questType: {
    color: "#111827",
    fontSize: 9,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: "#38BDF8",
    backgroundColor: "#E0F2FE",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: "hidden",
    marginRight: 4,
  },
  questReward: {
    color: "#111827",
    fontSize: 9,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: "#92400E",
    backgroundColor: "#FBBF24",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  questCheck: { fontSize: 18, marginLeft: 6 },

  reflectBtn: { marginTop: 6, alignSelf: "flex-end", borderRadius: 8, backgroundColor: "#111827", paddingVertical: 5, paddingHorizontal: 10 },
  reflectText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },

  rankCard: { backgroundColor: "#1E1B4B", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 12, padding: 10, marginBottom: 10 },
  rankText: { color: "#EEF2FF", fontSize: 12, fontWeight: "700", marginTop: 4 },
  resetBtn: { marginTop: 8, backgroundColor: "#111827", borderWidth: 1, borderColor: "#FBBF24", borderRadius: 8, alignItems: "center", paddingVertical: 7 },
  resetText: { color: "#F9FAFB", fontSize: 11, fontWeight: "900" },

  bottomNav: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  navBtn: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  navBtnActive: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  navText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  navTextActive: { color: "#111827", fontSize: 10, fontWeight: "900" },
});