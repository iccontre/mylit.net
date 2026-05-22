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
  goalOne?: string;
  goalTwo?: string;
  goalThree?: string;
  dreamCategory?: string;
};

type ModeState = "Recovery" | "Progress" | "Neutral";

const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const TODAY_PROGRESS_DATE_KEY = "lit_today_progress_date";
const PROFILE_KEY = "lit_user_profile";
const CHECKIN_KEY = "lit_latest_checkin";
const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

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
  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
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

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }

  async function mediumHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    const saved = await AsyncStorage.getItem(COMPLETED_QUESTS_KEY);

    if (savedDate !== today) {
      setCompletedQuests([]);
      await AsyncStorage.setItem(TODAY_PROGRESS_DATE_KEY, today);
      await AsyncStorage.setItem(COMPLETED_QUESTS_KEY, JSON.stringify([]));
      return;
    }

    if (saved) setCompletedQuests(JSON.parse(saved));
  }

  async function saveCompletedQuests(next: string[]) {
    const today = getTodayKey();
    setCompletedQuests(next);
    await AsyncStorage.setItem(TODAY_PROGRESS_DATE_KEY, today);
    await AsyncStorage.setItem(COMPLETED_QUESTS_KEY, JSON.stringify(next));
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
      const text = item.text?.trim() || item.title?.trim() || item.task?.trim() || item.note?.trim();
      if (!text || unique.has(text)) return;
      unique.add(text);
      result.push({ title: `Quick thought: ${text}`, type: "Quick Thought", steps: 1 });
    });

    return result;
  }

  function generateQuests(): Quest[] {
    const quick = generateQuickThoughtQuests();

    const dayQuest: Quest | null = todayRole
      ? { title: `Day plan: ${todayRole}`, type: "Day Plan", steps: 1, description: "Set what the day is for." }
      : null;

    if (isNeutral) {
      const neutral: Quest[] = [
        { title: "Complete Morning Check-In", type: "Start", steps: 1 },
        { title: `Goal step: ${topGoal}`, type: "Goal", steps: 1 },
        { title: `Goal step: ${secondGoal}`, type: "Goal", steps: 1 },
        { title: `Goal step: ${thirdGoal}`, type: "Goal", steps: 1 },
      ];
      return [...(dayQuest ? [dayQuest, ...neutral] : neutral), ...quick];
    }

    const category = profile?.dreamCategory?.trim() || "Purpose";
    const modeType: "Recovery" | "Progress" = isRecovery ? "Recovery" : "Progress";
    const categoryQuests = getCategoryQuests(category, modeType);

    const core: Quest[] = [
      { title: `Goal step: ${topGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${secondGoal}`, type: "Goal", steps: 1 },
      { title: `Goal step: ${thirdGoal}`, type: "Goal", steps: 1 },
    ];

    return [...(dayQuest ? [dayQuest] : []), ...categoryQuests, ...core, ...quick];
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
          <View style={styles.heroDecorRow}>
            <View style={styles.pixelBig} />
            <View style={styles.pixelSmall} />
            <View style={styles.pixelSmall} />
            <View style={styles.pixelBig} />
          </View>
          <Text style={[styles.heroLogo, { fontFamily: pixelFont }]}>lit</Text>
          <Text style={[styles.heroMode, isRecovery && styles.heroModeLight]}>{modeTitle}</Text>
          <Text style={[styles.heroModeSub, isRecovery && styles.heroModeSubLight]}>{modeInstruction}</Text>
        </View>

        <View style={styles.dayTrack}>
          <View style={styles.trackLine} />
          <View style={[styles.trackMarker, isNeutral && styles.markerNeutral, isProgress && styles.markerProgress, isRecovery && styles.markerRecovery]} />
          <View style={styles.trackLabels}>
            <Text style={styles.trackLabel}>6 AM 🌅</Text>
            <Text style={styles.trackLabel}>12 PM ☀️</Text>
            <Text style={styles.trackLabel}>6 PM 🌇</Text>
            <Text style={styles.trackLabel}>12 AM 🌙</Text>
          </View>
        </View>

        <View style={styles.energyCard}>
          <Text style={[styles.hudTitleLight, { fontFamily: pixelFont }]}>ENERGY RESERVE</Text>
          <Text style={[styles.energyNumber, { fontFamily: pixelFont }]}>{hasEnergyData ? `${energyYield}/100` : "—/100"}</Text>
          <Text style={styles.energyMeta}>{flameLabel}</Text>
          <View style={styles.meterRow}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View key={i} style={[styles.meterBlock, i < meterFillCount && styles.meterBlockOn]} />
            ))}
          </View>
          <TouchableOpacity style={styles.checkinButton} onPress={() => navigateWithHaptic("/sleep-checkin")}>
            <Text style={styles.checkinTitle}>Morning Check-In</Text>
            <Text style={styles.checkinSubtitle}>Check sleep, mood, and stress.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaBadge}>Luna</Text>
          <Text style={styles.lunaText}>{lunaMessage}</Text>
          <Text style={styles.lunaPath}>Main path: {topGoal}</Text>
        </View>

        <View style={styles.questBoard}>
          <View style={styles.questHeader}>
            <Text style={[styles.hudTitleLight, { fontFamily: pixelFont }]}>QUEST BOARD</Text>
            <Text style={styles.questCounter}>{completedVisibleQuests}/{visibleQuests.length}</Text>
          </View>

          {visibleQuests.map((quest, index) => {
            const done = completedQuests.includes(quest.title);

            return (
              <View key={index} style={[styles.questRow, done && styles.questRowDone]}>
                <TouchableOpacity style={styles.questMain} onPress={() => toggleQuest(quest.title)}>
                  <View style={styles.questMainText}>
                    <Text style={styles.questTitle}>{quest.title}</Text>
                    {quest.description ? <Text style={styles.questDesc}>{quest.description}</Text> : null}
                    <View style={styles.questBadges}>
                      <Text style={styles.questType}>{quest.type}</Text>
                      <Text style={styles.questReward}>+1</Text>
                    </View>
                  </View>
                  <Text style={styles.questCheck}>{done ? "✅" : "⬜"}</Text>
                </TouchableOpacity>

                {!done ? (
                  <Link href={{ pathname: "/reflection", params: { quest: quest.title } }} asChild>
                    <TouchableOpacity style={styles.reflectButton} onPress={lightHaptic}>
                      <Text style={styles.reflectButtonText}>Reflect</Text>
                    </TouchableOpacity>
                  </Link>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.rankCard}>
          <Text style={[styles.hudTitleLight, { fontFamily: pixelFont }]}>STEPS & RANK</Text>
          <Text style={styles.rankText}>Steps: {completedSteps}</Text>
          <Text style={styles.rankText}>Completed: {completedVisibleQuests}/{visibleQuests.length}</Text>
          <Text style={styles.rankText}>Rank: {getRankName(completedSteps)}</Text>
          <TouchableOpacity style={styles.resetButton} onPress={resetTodayProgress}>
            <Text style={styles.resetText}>Reset Today Plan</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.navBar}>
          <TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={lightHaptic}><Text style={styles.navTextActive}>Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/sleep")}><Text style={styles.navText}>Sleep</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/calendar")}><Text style={styles.navText}>Calendar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/mind")}><Text style={styles.navText}>Mind</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/path")}><Text style={styles.navText}>Path</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateWithHaptic("/stats")}><Text style={styles.navText}>Stats</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

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
  heroDecorRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  pixelBig: { width: 18, height: 8, borderRadius: 2, backgroundColor: "#111827", opacity: 0.45 },
  pixelSmall: { width: 10, height: 6, borderRadius: 2, backgroundColor: "#111827", opacity: 0.3 },
  heroLogo: { fontSize: 50, fontWeight: "900", letterSpacing: 2, color: "#111827", textAlign: "center" },
  heroMode: { textAlign: "center", fontSize: 20, fontWeight: "900", letterSpacing: 1, color: "#111827", marginTop: 4 },
  heroModeLight: { color: "#F9FAFB" },
  heroModeSub: { textAlign: "center", fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 4, lineHeight: 18 },
  heroModeSubLight: { color: "#DDD6FE" },

  dayTrack: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 10, marginBottom: 10 },
  trackLine: { height: 6, borderRadius: 3, backgroundColor: "#4B5563", marginBottom: 8 },
  trackMarker: { width: 12, height: 12, borderRadius: 2, borderWidth: 2, borderColor: "#F9FAFB", marginTop: -16, marginBottom: 4 },
  markerNeutral: { marginLeft: "2%", backgroundColor: "#22C55E" },
  markerProgress: { marginLeft: "45%", backgroundColor: "#FBBF24" },
  markerRecovery: { marginLeft: "85%", backgroundColor: "#A78BFA" },
  trackLabels: { flexDirection: "row", justifyContent: "space-between" },
  trackLabel: { color: "#F9FAFB", fontSize: 10, fontWeight: "800" },

  energyCard: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 14, padding: 12, marginBottom: 10 },
  hudTitleLight: { color: "#F9FAFB", fontSize: 12, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  energyNumber: { color: "#FBBF24", fontSize: 36, fontWeight: "900", marginTop: 4 },
  energyMeta: { color: "#F9FAFB", fontSize: 11, fontWeight: "800", marginTop: 2 },
  meterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 8 },
  meterBlock: { width: "8.8%", height: 8, backgroundColor: "#374151", borderRadius: 2 },
  meterBlockOn: { backgroundColor: "#FBBF24" },
  checkinButton: { backgroundColor: "#1F2937", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  checkinTitle: { color: "#F9FAFB", fontSize: 13, fontWeight: "900" },
  checkinSubtitle: { color: "#CBD5E1", fontSize: 10, fontWeight: "700", marginTop: 2 },

  lunaCard: { backgroundColor: "#EEF2FF", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 12, padding: 10, marginBottom: 10 },
  lunaBadge: { alignSelf: "flex-start", backgroundColor: "#111827", color: "#F9FAFB", fontSize: 10, fontWeight: "900", borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, overflow: "hidden", marginBottom: 4 },
  lunaText: { color: "#111827", fontSize: 12, fontWeight: "700", lineHeight: 18 },
  lunaPath: { color: "#374151", fontSize: 11, fontWeight: "800", marginTop: 4 },

  questBoard: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 14, padding: 10, marginBottom: 10 },
  questHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  questCounter: { backgroundColor: "#FBBF24", color: "#111827", fontSize: 10, fontWeight: "900", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, overflow: "hidden" },

  questRow: { backgroundColor: "#1F2937", borderWidth: 1, borderColor: "#374151", borderRadius: 10, padding: 8, marginBottom: 6 },
  questRowDone: { backgroundColor: "#14532D", borderColor: "#22C55E" },
  questMain: { flexDirection: "row", alignItems: "flex-start" },
  questMainText: { flex: 1 },
  questTitle: { color: "#F9FAFB", fontSize: 12, fontWeight: "900" },
  questDesc: { color: "#CBD5E1", fontSize: 10, fontWeight: "700", marginTop: 2 },
  questBadges: { flexDirection: "row", marginTop: 4 },
  questType: { color: "#111827", backgroundColor: "#E0F2FE", borderWidth: 1, borderColor: "#38BDF8", fontSize: 9, fontWeight: "900", borderRadius: 999, paddingVertical: 2, paddingHorizontal: 6, overflow: "hidden", marginRight: 4 },
  questReward: { color: "#111827", backgroundColor: "#FBBF24", borderWidth: 1, borderColor: "#92400E", fontSize: 9, fontWeight: "900", borderRadius: 999, paddingVertical: 2, paddingHorizontal: 6, overflow: "hidden" },
  questCheck: { fontSize: 18, marginLeft: 6, color: "#F9FAFB" },
  reflectButton: { marginTop: 6, alignSelf: "flex-end", borderRadius: 8, backgroundColor: "#334155", paddingVertical: 5, paddingHorizontal: 10 },
  reflectButtonText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },

  rankCard: { backgroundColor: "#1E1B4B", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 12, padding: 10, marginBottom: 10 },
  rankText: { color: "#EEF2FF", fontSize: 12, fontWeight: "700", marginTop: 4 },
  resetButton: { marginTop: 8, backgroundColor: "#111827", borderWidth: 1, borderColor: "#FBBF24", borderRadius: 8, alignItems: "center", paddingVertical: 7 },
  resetText: { color: "#F9FAFB", fontSize: 11, fontWeight: "900" },

  navBar: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 12, padding: 6, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  navButton: { width: "31.5%", marginBottom: 6, backgroundColor: "#1F2937", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  navButtonActive: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  navText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900" },
  navTextActive: { color: "#111827", fontSize: 10, fontWeight: "900" },
});