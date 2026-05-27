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
  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);

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

    if (isDone) {
      await lightHaptic();
    } else {
      await successHaptic();
    }

    await saveCompletedQuests(next);
  }

  const topGoal = profile?.goalOne?.trim() || "your top goal";
  const categoryKey = normalizeDreamCategory(profile?.dreamCategory || "");
  const todayRole = dayPlan[getWeekdayName()]?.trim();

  const hoursSlept = latestCheckIn?.hours ? Number(latestCheckIn.hours) : null;
  const shouldSuggestNap =
    hasEnergyData && hoursSlept !== null && !Number.isNaN(hoursSlept) && hoursSlept < 7;

  function templateToQuest(template: QuestTemplate): Quest {
    return {
      title: template.title,
      type: template.type,
      steps: template.steps || 1,
      description: template.description,
    };
  }

  function quickThoughtQuests(): Quest[] {
    const seen = new Set<string>();
    const result: Quest[] = [];

    queueItems.forEach((item) => {
      const text =
        item?.text?.trim() ||
        item?.title?.trim() ||
        item?.task?.trim() ||
        item?.note?.trim();

      if (!text || seen.has(text)) return;
      seen.add(text);

      result.push({
        title: `Quick thought: ${text}`,
        type: "Quick Thought",
        steps: 1,
      });
    });

    return result;
  }

  function generateQuests(): Quest[] {
    const dayQuest: Quest | null = todayRole
      ? {
          title: `Day plan: ${todayRole}`,
          type: "Day Plan",
          steps: 1,
          description: "Use today’s theme to choose your next move.",
        }
      : null;

    const napQuest: Quest = {
      title: "Take a recovery nap",
      type: "Recovery",
      steps: 1,
      description: "Aim for 30–60 minutes if your schedule allows.",
    };

    if (isNeutral) {
      return [
        { title: "Complete Morning Check-In", type: "Start", steps: 1 },
        { title: "Review your path", type: "Direction", steps: 1 },
        { title: "Choose one small move", type: "Plan", steps: 1 },
      ];
    }

    const pipeline = CATEGORY_PIPELINES[categoryKey] || CATEGORY_PIPELINES.General;
    const modeTemplates = isRecovery ? pipeline.recovery : pipeline.progress;
    const baseCategory = modeTemplates.slice(0, 3).map(templateToQuest);
    const queue = quickThoughtQuests();
    const built: Quest[] = [];

    if (shouldSuggestNap) built.push(napQuest);
    if (dayQuest) built.push(dayQuest);
    built.push(...baseCategory);
    built.push(...queue);

    return built;
  }

  const quests = generateQuests();
  const visibleQuests = quests.slice(0, 3);

  const completedVisibleQuests = visibleQuests.filter((quest) =>
    completedQuests.includes(quest.title)
  ).length;

  const completedSteps = visibleQuests
    .filter((quest) => completedQuests.includes(quest.title))
    .reduce((sum, quest) => sum + quest.steps, 0);

  const rank = completedSteps >= 5 ? "Consistent" : "Beginner";

  const modeTitle = isNeutral ? "Start Today" : isRecovery ? "Recovery Mode" : "Progress Mode";
  const modeSubtitle = isNeutral
    ? "Check your energy before choosing quests."
    : isRecovery
    ? "Keep one promise and protect your energy."
    : "Choose the next move that matters.";

  const lunaMessage = isNeutral
    ? "Check in first. I’ll build today’s quests around your real energy."
    : isRecovery
    ? "Recovery counts. Choose the smallest honest step."
    : "Energy is available. Pick the quest that moves your path forward.";

  const energyLabel = isNeutral ? "No reading yet" : isRecovery ? "Steady Flame" : "Active Flame";
  const meterFillCount = hasEnergyData ? Math.max(0, Math.min(10, Math.round(energyYield / 10))) : 0;

  if (!profileChecked) return null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
    >
      <View style={styles.shell}>
        <View style={[styles.header, isRecovery ? styles.headerRecovery : isProgress ? styles.headerProgress : styles.headerNeutral]}>
          <Text style={styles.logo}>MYLIT</Text>
          <Text style={styles.logoSub}>Living in Truth</Text>
          <View style={styles.modePanel}>
            <Text style={styles.modeTitle}>{modeTitle}</Text>
            <Text style={styles.modeSubtitle}>{modeSubtitle}</Text>
          </View>
        </View>

        <View style={styles.dayTrackPanel}>
          <Text style={styles.panelTitle}>DAY TRACK</Text>
          <View style={styles.trackBar}>
            <View style={[styles.trackMarker, isNeutral ? styles.markerNeutral : isRecovery ? styles.markerRecovery : styles.markerProgress]} />
          </View>
          <View style={styles.trackTimes}>
            <Text style={styles.trackText}>6 AM 🌅</Text>
            <Text style={styles.trackText}>12 PM ☀️</Text>
            <Text style={styles.trackText}>6 PM 🌇</Text>
            <Text style={styles.trackText}>12 AM 🌙</Text>
          </View>
        </View>

        <View style={[styles.lunaPanel, isRecovery ? styles.lunaRecovery : isProgress ? styles.lunaProgress : styles.lunaNeutral]}>
          <Text style={styles.lunaTitle}>Luna</Text>
          <Text style={styles.lunaBody}>{lunaMessage}</Text>
          <Text style={styles.lunaPath}>Main path: {topGoal}</Text>
        </View>

        <View style={[styles.energyPanel, isRecovery ? styles.energyRecovery : isProgress ? styles.energyProgress : styles.energyNeutral]}>
          <View style={styles.energyHead}>
            <Text style={styles.energyTitle}>ENERGY RESERVE</Text>
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>
                {isNeutral ? "CHECK-IN NEEDED" : isRecovery ? "Recovery" : "Progress"}
              </Text>
            </View>
          </View>

          <Text style={styles.energyScore}>{hasEnergyData ? `${energyYield}/100` : "—/100"}</Text>
          <Text style={styles.energyLabel}>{energyLabel}</Text>

          <View style={styles.energyBlocks}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.energyBlock,
                  i < meterFillCount && isNeutral ? styles.fillNeutral : null,
                  i < meterFillCount && isProgress ? styles.fillProgress : null,
                  i < meterFillCount && isRecovery ? styles.fillRecovery : null,
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
            <View>
              <Text style={styles.panelTitle}>QUEST BOARD</Text>
              <Text style={styles.questHint}>Complete one. Reflect if it misses.</Text>
            </View>
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>
                {completedVisibleQuests}/{visibleQuests.length}
              </Text>
            </View>
          </View>

          {visibleQuests.map((quest, idx) => {
            const done = completedQuests.includes(quest.title);

            return (
              <View key={`${quest.title}-${idx}`} style={[styles.questCard, done && styles.questDone]}>
                <TouchableOpacity style={styles.questRow} onPress={() => toggleQuest(quest.title)}>
                  <View style={styles.questBody}>
                    <Text style={styles.questTitle}>{quest.title}</Text>
                    {quest.description ? <Text style={styles.questDescription}>{quest.description}</Text> : null}
                    <View style={styles.questMeta}>
                      <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>{quest.type}</Text></View>
                      <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>+{quest.steps} step</Text></View>
                    </View>
                  </View>
                  <Text style={styles.checkMark}>{done ? "✅" : "⬜"}</Text>
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

        <View style={styles.rankPanel}>
          <Text style={styles.panelTitle}>RANK & STEPS</Text>
          <Text style={styles.rankLine}>Rank: {rank}</Text>
          <Text style={styles.rankLine}>Steps earned today: {completedSteps}</Text>
          <Text style={styles.rankLine}>
            Completed quests: {completedVisibleQuests}/{visibleQuests.length}
          </Text>
        </View>

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            <TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={lightHaptic}>
              <Text style={[styles.navText, styles.navTextActive]}>🏠 Home</Text>
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
              <Text style={styles.navText}>📊 Stats</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },
  container: { paddingTop: 34, paddingBottom: 36 },
  shell: { width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 18 },

  header: {
    borderWidth: 3,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  headerNeutral: { backgroundColor: "#0F2A1C", borderColor: "#22C55E" },
  headerProgress: { backgroundColor: "#2A1F0F", borderColor: "#FBBF24" },
  headerRecovery: { backgroundColor: "#1E1B4B", borderColor: "#A78BFA" },

  logo: { color: "#F9FAFB", fontSize: 34, fontWeight: "900", fontFamily: pixelFont, letterSpacing: 1.2 },
  logoSub: { color: "#CBD5E1", fontSize: 12, fontWeight: "800", fontFamily: pixelFont, marginBottom: 10 },
  modePanel: { backgroundColor: "#111827", borderColor: "#334155", borderWidth: 2, borderRadius: 14, padding: 10 },
  modeTitle: { color: "#F9FAFB", fontSize: 18, fontWeight: "900", fontFamily: pixelFont, marginBottom: 4 },
  modeSubtitle: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontFamily: pixelFont },

  dayTrackPanel: {
    backgroundColor: "#111827",
    borderColor: "#334155",
    borderWidth: 3,
    borderRadius: 20,
    padding: 12,
    marginBottom: 12,
  },
  panelTitle: { color: "#F9FAFB", fontSize: 14, fontWeight: "900", fontFamily: pixelFont, letterSpacing: 0.8, marginBottom: 8 },
  trackBar: { height: 12, borderRadius: 999, backgroundColor: "#334155", justifyContent: "center", marginBottom: 8 },
  trackMarker: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#F9FAFB" },
  markerNeutral: { backgroundColor: "#22C55E", marginLeft: "6%" },
  markerProgress: { backgroundColor: "#FBBF24", marginLeft: "45%" },
  markerRecovery: { backgroundColor: "#A78BFA", marginLeft: "78%" },
  trackTimes: { flexDirection: "row", justifyContent: "space-between" },
  trackText: { color: "#CBD5E1", fontSize: 11, fontWeight: "800", fontFamily: pixelFont },

  lunaPanel: { borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  lunaNeutral: { backgroundColor: "#BBF7D0", borderColor: "#22C55E" },
  lunaProgress: { backgroundColor: "#FEF3C7", borderColor: "#FBBF24" },
  lunaRecovery: { backgroundColor: "#EDE9FE", borderColor: "#A78BFA" },
  lunaTitle: { color: "#111827", fontSize: 13, fontWeight: "900", fontFamily: pixelFont, marginBottom: 6 },
  lunaBody: { color: "#111827", fontSize: 13, lineHeight: 19, fontWeight: "800", marginBottom: 6 },
  lunaPath: { color: "#374151", fontSize: 12, fontWeight: "800", fontFamily: pixelFont },

  energyPanel: { borderWidth: 4, borderRadius: 22, padding: 14, marginBottom: 12 },
  energyNeutral: { backgroundColor: "#14532D", borderColor: "#22C55E" },
  energyProgress: { backgroundColor: "#111827", borderColor: "#FBBF24" },
  energyRecovery: { backgroundColor: "#1E1B4B", borderColor: "#A78BFA" },
  energyHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  energyTitle: { color: "#F9FAFB", fontSize: 15, fontWeight: "900", fontFamily: pixelFont, letterSpacing: 0.8 },
  modeBadge: { backgroundColor: "#F9FAFB", borderRadius: 999, borderWidth: 1, borderColor: "#111827", paddingVertical: 5, paddingHorizontal: 10 },
  modeBadgeText: { color: "#111827", fontSize: 10, fontWeight: "900", fontFamily: pixelFont },
  energyScore: { color: "#F9FAFB", fontSize: 44, fontWeight: "900", fontFamily: pixelFont, marginBottom: 2 },
  energyLabel: { color: "#CBD5E1", fontSize: 12, fontWeight: "800", fontFamily: pixelFont, marginBottom: 8 },
  energyBlocks: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  energyBlock: { width: "8.6%", height: 14, borderRadius: 3, backgroundColor: "#334155", borderWidth: 1, borderColor: "#64748B" },
  fillNeutral: { backgroundColor: "#22C55E", borderColor: "#86EFAC" },
  fillProgress: { backgroundColor: "#FBBF24", borderColor: "#FDE68A" },
  fillRecovery: { backgroundColor: "#A78BFA", borderColor: "#C4B5FD" },
  checkinButton: { backgroundColor: "#0F172A", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  checkinButtonText: { color: "#F9FAFB", fontSize: 12, fontWeight: "900", fontFamily: pixelFont, letterSpacing: 0.5 },

  questPanel: { backgroundColor: "#111827", borderColor: "#FBBF24", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  questHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  questHint: { color: "#CBD5E1", fontSize: 11, fontWeight: "700", fontFamily: pixelFont },
  counterBadge: { backgroundColor: "#1F2937", borderColor: "#475569", borderWidth: 2, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  counterText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900", fontFamily: pixelFont },

  questCard: { backgroundColor: "#0F172A", borderColor: "#334155", borderWidth: 2, borderRadius: 14, padding: 10, marginBottom: 8 },
  questDone: { borderColor: "#22C55E" },
  questRow: { flexDirection: "row", alignItems: "center" },
  questBody: { flex: 1 },
  questTitle: { color: "#F9FAFB", fontSize: 13, fontWeight: "900", fontFamily: pixelFont, marginBottom: 3 },
  questDescription: { color: "#CBD5E1", fontSize: 11, lineHeight: 16, marginBottom: 5 },
  questMeta: { flexDirection: "row", alignItems: "center" },
  typeBadge: { backgroundColor: "#1E293B", borderColor: "#475569", borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 7, marginRight: 6 },
  typeBadgeText: { color: "#E2E8F0", fontSize: 9, fontWeight: "900", fontFamily: pixelFont },
  stepBadge: { backgroundColor: "#FBBF24", borderColor: "#111827", borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 7 },
  stepBadgeText: { color: "#111827", fontSize: 9, fontWeight: "900", fontFamily: pixelFont },
  checkMark: { fontSize: 20, marginLeft: 8 },
  reflectBtn: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#1F2937", borderColor: "#475569", borderWidth: 2, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 10 },
  reflectBtnText: { color: "#F9FAFB", fontSize: 10, fontWeight: "900", fontFamily: pixelFont },

  rankPanel: { backgroundColor: "#111827", borderColor: "#334155", borderWidth: 3, borderRadius: 20, padding: 12, marginBottom: 12 },
  rankLine: { color: "#CBD5E1", fontSize: 12, fontWeight: "800", fontFamily: pixelFont, marginBottom: 4 },

  bottomNav: { backgroundColor: "#0F172A", borderColor: "#374151", borderWidth: 3, borderRadius: 18, padding: 10, marginTop: 8 },
  bottomTitle: { color: "#E2E8F0", fontFamily: pixelFont, fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginBottom: 8 },
  navGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  navButton: { width: "48.5%", backgroundColor: "#111827", borderWidth: 2, borderColor: "#334155", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8, alignItems: "center" },
  navButtonActive: { backgroundColor: "#14532D", borderColor: "#FBBF24" },
  navText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 12, fontWeight: "800", textAlign: "center" },
  navTextActive: { color: "#FDE68A" },
});