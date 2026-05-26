import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  CATEGORY_PIPELINES,
  normalizeDreamCategory,
  QuestTemplate,
} from "../../constants/questPipelines";

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
  planOfDay?: string;
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

function toQuest(template: QuestTemplate): Quest {
  return {
    title: template.title,
    type: template.type,
    steps: template.steps,
    description: template.description,
  };
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
  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);

  const [dayPlan, setDayPlan] = useState<DayPlan>({
    Monday: "",
    Tuesday: "",
    Wednesday: "",
    Thursday: "",
    Friday: "",
    Saturday: "",
    Sunday: "",
  });

  useEffect(() => {
    loadProfile();
    loadLatestCheckIn();
    loadQuickThoughts();
    loadDayPlan();
    loadCompletedQuests();
  }, []);

  useEffect(() => {
    if (hasRouteEnergy && (rawMode === "Recovery" || rawMode === "Progress")) {
      setSavedMode(rawMode);
      setSavedEnergy(routeEnergyNumber);
      setHasSavedCheckIn(true);
    }
  }, [hasRouteEnergy, rawMode, routeEnergyNumber]);

  const hasEnergyData = hasRouteEnergy || hasSavedCheckIn;

  const currentMode: ModeState = hasEnergyData
    ? rawMode === "Recovery" || rawMode === "Progress"
      ? rawMode
      : savedMode
    : "Neutral";

  const isNeutral = currentMode === "Neutral";
  const isRecovery = currentMode === "Recovery";
  const isProgress = currentMode === "Progress";
  const energyYield = hasRouteEnergy ? routeEnergyNumber : savedEnergy;

  async function lightHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // web safe
    }
  }

  async function mediumHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // web safe
    }
  }

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // web safe
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
    } else {
      setHasSavedCheckIn(false);
    }

    setLatestCheckIn(checkIn);
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
    setCompletedQuests(saved ? JSON.parse(saved) : []);
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
      ? completedQuests.filter((q) => q !== title)
      : [...completedQuests, title];

    if (isDone) {
      await lightHaptic();
    } else {
      await successHaptic();
    }

    await saveCompletedQuests(next);
  }

  async function resetTodayProgress() {
    await mediumHaptic();
    await saveCompletedQuests([]);
  }

  function generateQuickThoughtQuests(): Quest[] {
    const unique = new Set<string>();
    const out: Quest[] = [];

    queueItems.forEach((item) => {
      const text =
        item.text?.trim() ||
        item.title?.trim() ||
        item.task?.trim() ||
        item.note?.trim();

      if (!text || unique.has(text)) return;
      unique.add(text);

      out.push({
        title: `Quick thought: ${text}`,
        type: "Quick Thought",
        steps: 1,
        description: "Save the thought. Take one move.",
      });
    });

    return out;
  }

  function getCategoryModeQuests(): Quest[] {
    const categoryKey = normalizeDreamCategory(profile?.dreamCategory);
    const pipeline = CATEGORY_PIPELINES[categoryKey] ?? CATEGORY_PIPELINES.General;

    const modeTemplates: QuestTemplate[] =
      currentMode === "Neutral"
        ? pipeline.neutral
        : currentMode === "Recovery"
        ? pipeline.recovery
        : pipeline.progress;

    const resourceSafe = modeTemplates.filter((template) => {
      if (!template.resourceTags || template.resourceTags.length === 0) return true;

      return template.resourceTags.every((tag) => {
        if (tag === "gym") return !!profile?.hasGymAccess;
        if (tag === "food") return !!profile?.hasFoodControl;
        if (tag === "quiet") return !!profile?.hasQuietSpace;
        if (tag === "transportation") return !!profile?.hasTransportation;
        return true;
      });
    });

    const fallback = resourceSafe.length > 0 ? resourceSafe : modeTemplates;
    return fallback.map(toQuest);
  }

  const quests = useMemo(() => {
    const quickThoughtQuests = generateQuickThoughtQuests();
    const categoryQuests = getCategoryModeQuests();
    const todayRole = dayPlan[getWeekdayName()]?.trim();

    const dayPlanQuest: Quest | null = todayRole
      ? {
          title: `Day plan: ${todayRole}`,
          type: "Day Plan",
          steps: 1,
          description: "Use today’s theme to choose your next move.",
        }
      : null;

    const hoursSlept = latestCheckIn?.hours ? Number(latestCheckIn.hours) : null;
    const napQuest: Quest | null =
      hasEnergyData &&
      hoursSlept !== null &&
      !Number.isNaN(hoursSlept) &&
      hoursSlept < 7
        ? {
            title: "Take a recovery nap",
            type: "Recovery",
            steps: 1,
            description: "Aim for 30–60 minutes if your schedule allows.",
          }
        : null;

    if (isNeutral) {
      const starter: Quest[] = [
        {
          title: "Complete Morning Check-In",
          type: "Start",
          steps: 1,
          description: "Check sleep, mood, and stress.",
        },
        {
          title: "Review your path",
          type: "Path",
          steps: 1,
          description: "Look at your top goal and choose your direction.",
        },
        {
          title: "Choose one small move",
          type: "Plan",
          steps: 1,
          description: "Pick one honest step for today.",
        },
      ];

      const neutralCombined = [
        ...starter,
        ...categoryQuests,
        ...(dayPlanQuest ? [dayPlanQuest] : []),
        ...quickThoughtQuests,
      ];

      return neutralCombined;
    }

    const modeCombined = [
      ...(napQuest ? [napQuest] : []),
      ...(dayPlanQuest ? [dayPlanQuest] : []),
      ...categoryQuests,
      ...quickThoughtQuests,
    ];

    return modeCombined;
  }, [profile, currentMode, dayPlan, latestCheckIn, hasEnergyData, queueItems, isNeutral]);

  const visibleQuests = quests.slice(0, 3);
  const completedVisibleQuests = visibleQuests.filter((q) => completedQuests.includes(q.title)).length;
  const completedSteps = completedVisibleQuests;
  const rank = completedSteps >= 5 ? "Consistent" : "Beginner";

  const topGoal = profile?.goalOne?.trim() || "your top goal";

  const modeTitle = isNeutral ? "Start Today" : isProgress ? "Progress Mode" : "Recovery Mode";
  const modeInstruction = isNeutral
    ? "Complete a Morning Check-In to calculate your Energy Reserve."
    : isProgress
    ? "Use your energy on the path that matters."
    : "Protect your energy and keep one promise.";

  const lunaMessage = isNeutral
    ? "Check in first. I’ll build today’s quests around your real energy."
    : isProgress
    ? "Energy is available. Pick the quest that moves your path forward."
    : "Recovery counts. Choose the smallest honest step.";

  const meterFillCount = hasEnergyData
    ? Math.max(0, Math.min(10, Math.round(energyYield / 10)))
    : 0;

  function getAccentColor() {
    if (isNeutral) return "#22C55E";
    if (isRecovery) return "#A78BFA";
    return "#FBBF24";
  }

  if (!profileChecked) {
    return (
      <View style={[styles.screenRecovery, styles.center]}>
        <Text style={styles.loadingText}>Loading your path…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={isNeutral ? styles.screenNeutral : isProgress ? styles.screenProgress : styles.screenRecovery}
      contentContainerStyle={styles.shell}
    >
      <View style={isNeutral ? styles.heroNeutral : isProgress ? styles.heroProgress : styles.heroRecovery}>
        <View style={styles.heroRow}>
          <View style={styles.heroTile}><Text style={styles.heroTileText}>🌿</Text></View>
          <View style={styles.heroCenter}>
            <Text style={styles.logo}>lit</Text>
            <Text style={styles.logoSub}>Living in Truth</Text>
          </View>
          <View style={styles.heroTile}><Text style={styles.heroTileText}>⚙️</Text></View>
        </View>

        <View style={styles.heroModePanel}>
          <Text style={styles.heroModeTitle}>{modeTitle}</Text>
          <Text style={styles.heroModeText}>{modeInstruction}</Text>
        </View>
      </View>

      <View style={styles.trackPanel}>
        <View style={styles.trackTop}>
          <Text style={styles.trackTitle}>DAY TRACK</Text>
          <View style={[styles.trackBadge, { backgroundColor: getAccentColor() }]}>
            <Text style={styles.trackBadgeText}>{isNeutral ? "Check-in" : isRecovery ? "Recovery" : "Active"}</Text>
          </View>
        </View>

        <View style={styles.trackLine}>
          <View
            style={[
              styles.trackMarker,
              isNeutral ? styles.trackMarkerNeutral : isProgress ? styles.trackMarkerProgress : styles.trackMarkerRecovery,
            ]}
          />
        </View>

        <View style={styles.trackTimes}>
          <View style={styles.timePoint}><Text style={styles.timeIcon}>🌅</Text><Text style={styles.timeText}>6 AM</Text></View>
          <View style={styles.timePoint}><Text style={styles.timeIcon}>☀️</Text><Text style={styles.timeText}>12 PM</Text></View>
          <View style={styles.timePoint}><Text style={styles.timeIcon}>🌇</Text><Text style={styles.timeText}>6 PM</Text></View>
          <View style={styles.timePoint}><Text style={styles.timeIcon}>🌙</Text><Text style={styles.timeText}>12 AM</Text></View>
        </View>
      </View>

      <View style={isNeutral ? styles.lunaNeutral : isProgress ? styles.lunaProgress : styles.lunaRecovery}>
        <View style={styles.lunaOrb}><Text style={styles.lunaOrbText}>L</Text></View>
        <View style={styles.lunaBubble}>
          <Text style={styles.lunaTag}>Luna</Text>
          <Text style={styles.lunaMessage}>{lunaMessage}</Text>
          <Text style={styles.lunaPath}>Main path: {topGoal}</Text>
        </View>
      </View>

      <View style={isNeutral ? styles.energyNeutral : isProgress ? styles.energyProgress : styles.energyRecovery}>
        <View style={styles.energyTop}>
          <View>
            <Text style={styles.energyTitle}>ENERGY RESERVE</Text>
            <Text style={styles.energyLabel}>{hasEnergyData ? "Live score" : "Check-in needed"}</Text>
          </View>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{isNeutral ? "CHECK-IN NEEDED" : currentMode.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.energyScoreRow}>
          <Text style={styles.energyScore}>{hasEnergyData ? energyYield : "—"}</Text>
          <Text style={styles.energyOutOf}>/100</Text>
        </View>

        <View style={styles.energyMeterRow}>
          {Array.from({ length: 10 }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.energyBlock,
                index < meterFillCount
                  ? isNeutral
                    ? styles.energyFillNeutral
                    : isProgress
                    ? styles.energyFillProgress
                    : styles.energyFillRecovery
                  : null,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.checkinButton} onPress={() => navigateWithHaptic("/sleep-checkin")}>
          <Text style={styles.checkinButtonText}>Morning Check-In</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.questPanel}>
        <View style={styles.questHeaderRow}>
          <Text style={styles.questTitle}>QUEST BOARD</Text>
          <View style={styles.questCountBadge}>
            <Text style={styles.questCountText}>{completedVisibleQuests}/{visibleQuests.length || 0}</Text>
          </View>
        </View>

        {visibleQuests.map((quest, index) => {
          const done = completedQuests.includes(quest.title);

          return (
            <View key={`${quest.title}-${index}`} style={done ? styles.questCardDone : styles.questCard}>
              <TouchableOpacity style={styles.questRow} onPress={() => toggleQuest(quest.title)}>
                <View style={styles.questBody}>
                  <Text style={styles.questName}>{quest.title}</Text>
                  {quest.description ? <Text style={styles.questDesc}>{quest.description}</Text> : null}
                  <View style={styles.questMeta}>
                    <View style={styles.badgeType}><Text style={styles.badgeTypeText}>{quest.type}</Text></View>
                    <View style={styles.badgeReward}><Text style={styles.badgeRewardText}>+{quest.steps}</Text></View>
                  </View>
                </View>
                <Text style={styles.questCheck}>{done ? "✅" : "⬜"}</Text>
              </TouchableOpacity>

              {!done ? (
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

      <View style={styles.rankMini}>
        <Text style={styles.rankTitle}>STEPS & RANK</Text>
        <Text style={styles.rankText}>Steps: {completedSteps}</Text>
        <Text style={styles.rankText}>Completed: {completedVisibleQuests}/{visibleQuests.length || 0}</Text>
        <Text style={styles.rankText}>Rank: {rank}</Text>
      </View>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navBtnActive} onPress={lightHaptic}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/sleep")}>
          <Text style={styles.navIcon}>🌙</Text>
          <Text style={styles.navText}>Sleep</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/calendar")}>
          <Text style={styles.navIcon}>📅</Text>
          <Text style={styles.navText}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/mind")}>
          <Text style={styles.navIcon}>🧠</Text>
          <Text style={styles.navText}>Mind</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/path")}>
          <Text style={styles.navIcon}>🧭</Text>
          <Text style={styles.navText}>Path</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => navigateWithHaptic("/stats")}>
          <Text style={styles.navIcon}>📊</Text>
          <Text style={styles.navText}>Stats</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.resetBtn} onPress={resetTodayProgress}>
        <Text style={styles.resetBtnText}>Reset Today Plan</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenNeutral: { flex: 1, backgroundColor: "#ECFDF5" },
  screenProgress: { flex: 1, backgroundColor: "#FFF7ED" },
  screenRecovery: { flex: 1, backgroundColor: "#0F172A" },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    padding: 16,
    paddingTop: 48,
    paddingBottom: 28,
  },
  center: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#F9FAFB", fontFamily: pixelFont, fontSize: 16, fontWeight: "900" },

  heroNeutral: { backgroundColor: "#DCFCE7", borderWidth: 3, borderColor: "#22C55E", borderRadius: 22, padding: 12, marginBottom: 10 },
  heroProgress: { backgroundColor: "#FEF3C7", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 22, padding: 12, marginBottom: 10 },
  heroRecovery: { backgroundColor: "#1E1B4B", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 22, padding: 12, marginBottom: 10 },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTile: { width: 50, height: 50, borderRadius: 12, borderWidth: 2, borderColor: "#111827", backgroundColor: "#F9FAFB", alignItems: "center", justifyContent: "center" },
  heroTileText: { fontSize: 20 },
  heroCenter: { alignItems: "center", flex: 1, marginHorizontal: 8 },
  logo: { fontFamily: pixelFont, fontSize: 44, fontWeight: "900", color: "#111827", letterSpacing: -2 },
  logoSub: { fontFamily: pixelFont, fontSize: 11, fontWeight: "800", color: "#374151", marginTop: -4 },
  heroModePanel: { marginTop: 10, backgroundColor: "#F9FAFB", borderWidth: 2, borderColor: "#111827", borderRadius: 12, padding: 10 },
  heroModeTitle: { fontFamily: pixelFont, fontSize: 20, fontWeight: "900", color: "#111827" },
  heroModeText: { fontFamily: pixelFont, fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 2, lineHeight: 17 },

  trackPanel: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#374151", borderRadius: 16, padding: 10, marginBottom: 10 },
  trackTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  trackTitle: { fontFamily: pixelFont, fontSize: 13, fontWeight: "900", color: "#F9FAFB", letterSpacing: 1 },
  trackBadge: { borderRadius: 999, borderWidth: 1, borderColor: "#F9FAFB", paddingHorizontal: 8, paddingVertical: 3 },
  trackBadgeText: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", color: "#111827" },
  trackLine: { height: 10, borderRadius: 6, backgroundColor: "#374151", borderWidth: 1, borderColor: "#6B7280", marginBottom: 8, justifyContent: "center" },
  trackMarker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#F9FAFB" },
  trackMarkerNeutral: { backgroundColor: "#22C55E", marginLeft: "2%" },
  trackMarkerProgress: { backgroundColor: "#FBBF24", marginLeft: "42%" },
  trackMarkerRecovery: { backgroundColor: "#A78BFA", marginLeft: "80%" },
  trackTimes: { flexDirection: "row", justifyContent: "space-between" },
  timePoint: { width: "24%", alignItems: "center" },
  timeIcon: { fontSize: 13, marginBottom: 2 },
  timeText: { fontFamily: pixelFont, color: "#CBD5E1", fontSize: 10, fontWeight: "800" },

  lunaNeutral: { backgroundColor: "#BBF7D0", borderWidth: 3, borderColor: "#22C55E", borderRadius: 18, padding: 10, marginBottom: 10, flexDirection: "row" },
  lunaProgress: { backgroundColor: "#FEF3C7", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 18, padding: 10, marginBottom: 10, flexDirection: "row" },
  lunaRecovery: { backgroundColor: "#EEF2FF", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 18, padding: 10, marginBottom: 10, flexDirection: "row" },
  lunaOrb: { width: 46, height: 46, borderRadius: 12, backgroundColor: "#111827", borderWidth: 2, borderColor: "#FBBF24", alignItems: "center", justifyContent: "center", marginRight: 8 },
  lunaOrbText: { fontFamily: pixelFont, color: "#F9FAFB", fontSize: 20, fontWeight: "900" },
  lunaBubble: { flex: 1 },
  lunaTag: { alignSelf: "flex-start", backgroundColor: "#111827", color: "#F9FAFB", borderRadius: 999, overflow: "hidden", paddingVertical: 3, paddingHorizontal: 8, fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginBottom: 4 },
  lunaMessage: { fontFamily: pixelFont, color: "#111827", fontSize: 12, fontWeight: "800", lineHeight: 17 },
  lunaPath: { fontFamily: pixelFont, color: "#374151", fontSize: 11, fontWeight: "700", marginTop: 4 },

  energyNeutral: { backgroundColor: "#14532D", borderWidth: 4, borderColor: "#22C55E", borderRadius: 20, padding: 12, marginBottom: 10 },
  energyProgress: { backgroundColor: "#111827", borderWidth: 4, borderColor: "#FBBF24", borderRadius: 20, padding: 12, marginBottom: 10 },
  energyRecovery: { backgroundColor: "#1E1B4B", borderWidth: 4, borderColor: "#A78BFA", borderRadius: 20, padding: 12, marginBottom: 10 },
  energyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  energyTitle: { fontFamily: pixelFont, color: "#F9FAFB", fontSize: 20, fontWeight: "900", letterSpacing: 1 },
  energyLabel: { fontFamily: pixelFont, color: "#CBD5E1", fontSize: 11, fontWeight: "700", marginTop: 2 },
  modeBadge: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#111827", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 150 },
  modeBadgeText: { fontFamily: pixelFont, color: "#111827", fontSize: 9, fontWeight: "900", textAlign: "center" },
  energyScoreRow: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", marginBottom: 8 },
  energyScore: { fontFamily: pixelFont, color: "#FBBF24", fontSize: 48, fontWeight: "900", lineHeight: 52 },
  energyOutOf: { fontFamily: pixelFont, color: "#F9FAFB", fontSize: 18, fontWeight: "900", marginLeft: 2, marginBottom: 6 },
  energyMeterRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  energyBlock: { width: "8.8%", height: 14, borderRadius: 3, backgroundColor: "#374151", borderWidth: 1, borderColor: "#6B7280" },
  energyFillNeutral: { backgroundColor: "#22C55E", borderColor: "#BBF7D0" },
  energyFillProgress: { backgroundColor: "#FBBF24", borderColor: "#FEF3C7" },
  energyFillRecovery: { backgroundColor: "#A78BFA", borderColor: "#EEF2FF" },
  checkinButton: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 10, alignItems: "center", paddingVertical: 9 },
  checkinButtonText: { fontFamily: pixelFont, color: "#F9FAFB", fontSize: 12, fontWeight: "900" },

  questPanel: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 18, padding: 10, marginBottom: 10 },
  questHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  questTitle: { fontFamily: pixelFont, color: "#F9FAFB", fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  questCountBadge: { backgroundColor: "#FBBF24", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  questCountText: { fontFamily: pixelFont, color: "#111827", fontSize: 10, fontWeight: "900" },
  questCard: { backgroundColor: "#1F2937", borderWidth: 2, borderColor: "#4B5563", borderRadius: 12, padding: 8, marginBottom: 7 },
  questCardDone: { backgroundColor: "#064E3B", borderWidth: 2, borderColor: "#22C55E", borderRadius: 12, padding: 8, marginBottom: 7 },
  questRow: { flexDirection: "row", alignItems: "center" },
  questBody: { flex: 1 },
  questName: { fontFamily: pixelFont, color: "#F9FAFB", fontSize: 12, fontWeight: "900", marginBottom: 3, lineHeight: 16 },
  questDesc: { fontFamily: pixelFont, color: "#CBD5E1", fontSize: 10, fontWeight: "700", lineHeight: 14, marginBottom: 4 },
  questMeta: { flexDirection: "row", alignItems: "center" },
  badgeType: { backgroundColor: "#E0F2FE", borderWidth: 1, borderColor: "#38BDF8", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginRight: 5 },
  badgeTypeText: { fontFamily: pixelFont, color: "#111827", fontSize: 9, fontWeight: "900" },
  badgeReward: { backgroundColor: "#FBBF24", borderWidth: 1, borderColor: "#111827", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeRewardText: { fontFamily: pixelFont, color: "#111827", fontSize: 9, fontWeight: "900" },
  questCheck: { fontSize: 20, marginLeft: 8 },
  reflectBtn: { marginTop: 7, backgroundColor: "#111827", borderWidth: 2, borderColor: "#374151", borderRadius: 8, alignItems: "center", paddingVertical: 6 },
  reflectBtnText: { fontFamily: pixelFont, color: "#F9FAFB", fontSize: 10, fontWeight: "900" },

  rankMini: { backgroundColor: "#E0F2FE", borderWidth: 3, borderColor: "#38BDF8", borderRadius: 14, padding: 10, marginBottom: 10 },
  rankTitle: { fontFamily: pixelFont, color: "#111827", fontSize: 13, fontWeight: "900", marginBottom: 5 },
  rankText: { fontFamily: pixelFont, color: "#374151", fontSize: 11, fontWeight: "700", marginBottom: 2 },

  bottomNav: { backgroundColor: "#111827", borderWidth: 3, borderColor: "#374151", borderRadius: 14, padding: 6, flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  navBtnActive: { width: "15.6%", backgroundColor: "#FEF3C7", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, paddingVertical: 6, alignItems: "center" },
  navBtn: { width: "15.6%", backgroundColor: "#1F2937", borderWidth: 2, borderColor: "#4B5563", borderRadius: 8, paddingVertical: 6, alignItems: "center" },
  navIcon: { fontSize: 12, marginBottom: 2 },
  navText: { fontFamily: pixelFont, fontSize: 9, fontWeight: "900", color: "#F9FAFB" },

  resetBtn: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 10, alignItems: "center", paddingVertical: 8 },
  resetBtnText: { fontFamily: pixelFont, color: "#F9FAFB", fontSize: 11, fontWeight: "900" },
});