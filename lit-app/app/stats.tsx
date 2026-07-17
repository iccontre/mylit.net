import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  ActivityIndicator,
  type AppStateStatus,
} from "react-native";

import { LOG_HISTORY_HEADING, uiAssets } from "../constants/uiAssets";
import { useMobileFrame } from "../constants/mobileLayout";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { getSession, signOut } from "../lib/auth";
import {
  computeFreshRankBonuses,
  computeItemStepsFromSources,
  computeTodayScopedEarnedSteps,
  loadTodayCompletions,
  reconcileMonotonicTotalSteps,
  SKILL_TIER_SIZE,
  USER_STATS_KEY,
} from "../lib/questProgress";
import {
  clearAllLocalProgressForSignOut,
  forceUploadLocalProgressToCloud,
  getSyncDiagnostics,
  mergeCloudIntoLocalSafely,
  persistProgressKeys,
} from "../lib/progressStore";
import { TODAY_QUEST_STEPS } from "../lib/scheduling";
import { isSupabaseConfigured } from "../lib/supabase";
import { syncAndGetStepRank, type StepRank } from "../lib/stepRank";
import { APP_VERSION } from "../lib/appVersion.generated";
import { fetchLiveVersion } from "../lib/pwaUpdate";
import { ProgressRecoveryModal } from "../components/ProgressRecoveryModal";
import { BottomNav } from "../components/BottomNav";
import { GuideFoundationCard } from "../components/GuideFoundationCard";
import { WorldChrome } from "../components/parchment/WorldChrome";

type ActivePanel = "weekly" | "skill" | "rank" | "behavior" | null;
type ActiveInfo =
  | "stats"
  | "evie"
  | "weekly"
  | "skill"
  | "rank"
  | "behavior"
  | "weeklyPopup"
  | "skillPopup"
  | "rankPopup"
  | "behaviorPopup"
  | null;
type Mode = "Recovery" | "Progress";

type CheckIn = {
  id?: string;
  hours?: string | number;
  sleep?: string | number;
  mood?: string | number;
  stress?: string | number;
  energy?: number;
  mode?: Mode | string;
  createdAt?: string;
  date?: string;
  wakeTime?: string;
  sleepTime?: string;
};

type UserStats = {
  rankBonusesAwarded?: number[];
  totalSteps?: number;
};

type StatsSnapshot = {
  latestCheckIn: CheckIn | null;
  checkIns: CheckIn[];
  completedQuests: unknown;
  quickThoughts: unknown;
  dayPlan: unknown;
  journalEntries: unknown;
  dreamJournalEntries: unknown;
  preSleepIntentions: unknown;
  morningReflections: unknown;
  alternateMorningReflections: unknown;
  meditations: unknown;
  reflections: unknown;
  sleepCalendar: unknown;
  earnedSteps: number;
  rankBonusPool: number;
  rankBonusesAwarded: number[];
};

const CHECKIN_KEY = "lit_latest_checkin";
const CHECKIN_HISTORY_KEY = "lit_checkin_history";
const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const QUICK_THOUGHTS_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";
const JOURNAL_KEY = "lit_journal_entries";
const DREAM_JOURNAL_KEY = "lit_dream_journal";
const PRE_SLEEP_INTENTIONS_KEY = "lit_pre_sleep_intentions";
const MORNING_REFLECTIONS_KEY = "lit_morning_reflections";
const MORNING_INTENTION_REFLECTIONS_KEY = "lit_morning_intention_reflections";
const MEDITATIONS_KEY = "lit_awareness_checks";
const REFLECTIONS_KEY = "lit_reflections";
const SLEEP_CALENDAR_KEY = "lit_sleep_calendar";
const AFFIRMATIONS_KEY = "lit_affirmations";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const INFO_COPY: Record<NonNullable<ActiveInfo>, { title: string; body: string }> = {
  stats: { title: "STATS BOARD", body: "Stats are feedback, not judgment. Steps come from completed actions only — saving a task does not earn steps. Completing quests, checklist items, reflections, and sleep actions can earn steps when supported. Skill grows from your own accumulated steps. Rank compares your total steps to every other MYLIT player — most steps earns Rank #1. Missed items are useful data, not failure." },
  evie: { title: "EVIE'S NOTE", body: "Stats are for learning, not judging. Look for patterns that help you adjust your next step honestly. One good data point is enough to move forward." },
  weekly: { title: "WEEKLY SUMMARY", body: "Weekly Summary shows what happened this week: energy, steps, completed quests, saved thoughts, sleep and mind entries, and your progress vs recovery balance." },
  skill: { title: "SKILL PROGRESS", body: "Skill Progress turns your own completed actions into visible growth. Every 100 steps unlocks the next skill tier, and each new tier grants a one-time +10 step bonus. Only completed actions count toward skill. Skill is personal — it does not compare you to other players." },
  rank: { title: "RANK", body: "Rank compares your total steps to every other signed-in MYLIT player. Whoever has the most steps holds Rank #1 — ties share the same rank. Sign in and keep completing actions to be ranked; Rank updates each time you open Stats." },
  behavior: { title: "BEHAVIOR", body: "Behavior shows patterns across energy, sleep, recovery, progress, and cognitive habits so you can adjust without judging yourself." },
  weeklyPopup: { title: "WEEKLY SUMMARY", body: "Weekly Summary shows what happened this week: energy, steps, completed quests, saved thoughts, sleep and mind entries, and your progress vs recovery balance." },
  skillPopup: { title: "SKILL PROGRESS", body: "Skill Progress turns your own completed actions into visible growth. Every 100 steps unlocks the next skill tier, and each new tier grants a one-time +10 step bonus. Only completed actions count toward skill. Skill is personal — it does not compare you to other players." },
  rankPopup: { title: "RANK", body: "Rank compares your total steps to every other signed-in MYLIT player. Whoever has the most steps holds Rank #1 — ties share the same rank. Sign in and keep completing actions to be ranked; Rank updates each time you open Stats." },
  behaviorPopup: { title: "BEHAVIOR", body: "Behavior shows patterns across energy, sleep, recovery, progress, and cognitive habits so you can adjust without judging yourself." },
};

const emptyStats: StatsSnapshot = {
  latestCheckIn: null, checkIns: [], completedQuests: [], quickThoughts: [], dayPlan: null,
  journalEntries: [], dreamJournalEntries: [], preSleepIntentions: [], morningReflections: [],
  alternateMorningReflections: [], meditations: [], reflections: [], sleepCalendar: [],
  earnedSteps: 0, rankBonusPool: 0, rankBonusesAwarded: [],
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function countAny(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length;
  if (typeof value === "string") return value.trim() ? 1 : 0;
  return 0;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>);
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function getNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatValue(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function average(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  return Math.round(numbers.reduce((t, n) => t + n, 0) / numbers.length);
}

function averageTime(values: string[]): string | null {
  const minutes = values.map((v) => {
    const m = v.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    let h = Number(m[1]); const min = Number(m[2]); const mer = m[3]?.toUpperCase();
    if (mer === "PM" && h < 12) h += 12;
    if (mer === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }).filter((v): v is number => v !== null);
  if (minutes.length === 0) return null;
  const avg = Math.round(minutes.reduce((t, n) => t + n, 0) / minutes.length);
  const h24 = Math.floor(avg / 60) % 24; const min = avg % 60;
  const suf = h24 >= 12 ? "PM" : "AM"; const h12 = h24 % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suf}`;
}

function weekRange(): string {
  const today = new Date(); const day = today.getDay();
  const monday = new Date(today); monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function skillTierName(level: number): string {
  const names: Record<number, string> = {
    1: "Beginner", 2: "Explorer", 3: "Trailblazer", 4: "Dreamsmith",
    5: "Luminary", 6: "Waykeeper", 7: "Mythwalker", 8: "Starbound",
  };
  return names[level] ?? `Legend ${level - 8}`;
}

function getSkillInfo(totalSteps: number) {
  const currentLevel = Math.floor(totalSteps / SKILL_TIER_SIZE) + 1;
  const stepsIntoRank = totalSteps % SKILL_TIER_SIZE;
  const percentToNext = Math.min(100, Math.round((stepsIntoRank / SKILL_TIER_SIZE) * 100));
  const nextRankAt = currentLevel * SKILL_TIER_SIZE;
  const stepsRemaining = nextRankAt - totalSteps;
  return { currentLevel, stepsIntoRank, percentToNext, nextRankAt, stepsRemaining };
}

function computeItemSteps(dayPlan: unknown, quickThoughts: unknown): number {
  let total = 0;
  const seenIds = new Set<string>();
  const plan = dayPlan as Record<string, unknown> | null;
  if (plan?.todayQuest) {
    const quest = plan.todayQuest as Record<string, unknown>;
    const id = quest.id ? String(quest.id) : null;
    if (quest.status === "completed" && id && !seenIds.has(id)) {
      seenIds.add(id); total += safeNumber(quest.steps, 2);
    }
  }
  if (plan?.weekdayChecklists && typeof plan.weekdayChecklists === "object") {
    for (const dayItems of Object.values(plan.weekdayChecklists as Record<string, unknown>)) {
      if (!Array.isArray(dayItems)) continue;
      for (const raw of dayItems) {
        const item = raw as Record<string, unknown>;
        const id = item.id ? String(item.id) : null;
        if (item.checked && id && !seenIds.has(id)) {
          seenIds.add(id); total += safeNumber(item.steps, 1);
        }
      }
    }
  }
  if (Array.isArray(quickThoughts)) {
    for (const raw of quickThoughts) {
      const item = raw as Record<string, unknown>;
      const id = item.id ? String(item.id) : null;
      if (item.completedAt && id && !seenIds.has(id)) {
        seenIds.add(id); total += safeNumber(item.steps, 1);
      }
    }
  }
  return total;
}

function getWeeklySteps(quickThoughts: unknown, dayPlan: unknown): number {
  const today = new Date(); const day = today.getDay();
  const monday = new Date(today); monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day)); monday.setHours(0, 0, 0, 0);
  let total = 0;
  if (Array.isArray(quickThoughts)) {
    for (const raw of quickThoughts) {
      const item = raw as Record<string, unknown>;
      if (item.completedAt) {
        const d = new Date(String(item.completedAt));
        if (d >= monday) total += safeNumber(item.steps, 1);
      }
    }
  }
  const plan = dayPlan as Record<string, unknown> | null;
  if (plan?.todayQuest) {
    const quest = plan.todayQuest as Record<string, unknown>;
    if (quest.status === "completed") total += safeNumber(quest.steps, TODAY_QUEST_STEPS);
  }
  return total;
}

export default function StatsScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const { width, height } = useWindowDimensions();
  const modalWidth = Math.min(width - 24, 520);
  const modalMaxHeight = Math.min(height * 0.88, 720);

  const [stats, setStats] = useState<StatsSnapshot>(emptyStats);
  const [stepRank, setStepRank] = useState<StepRank | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [activeInfo, setActiveInfo] = useState<ActiveInfo>(null);
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [showLearningLoopModal, setShowLearningLoopModal] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{
    liveVersion: string | null;
    swActive: boolean;
    userIdSuffix: string | null;
    lastCloudHydrationAt: string | null;
    ldmStateSource: string | null;
    schemaVersion: number;
  } | null>(null);

  useEffect(() => {
    loadStats();
    void trackEvent(ANALYTICS_EVENTS.stats_opened);
  }, []);

  // Home and Stats must always show the same total. Home re-reads local storage every time
  // the tab regains focus (see app/(tabs)/index.tsx) — Stats previously only loaded once on
  // mount, so completing a quest on Home and switching to Stats (expo-router tabs stay mounted,
  // they don't remount) kept showing a stale total until a full reload/logout. This mirrors
  // Home's own focus-refresh so both screens read the same freshly-computed total immediately.
  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  // Cross-device convergence: the focus refresh above only re-reads LOCAL storage. If another
  // device completed a quest/checklist item in the cloud since this device's last hydration,
  // this device would otherwise never see it without a full reload. Mirrors Home's identical
  // foreground-refetch + polling fallback (no realtime subscriptions exist in this codebase).
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    async function rehydrateFromCloud() {
      await mergeCloudIntoLocalSafely();
      void loadStats();
    }

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") void rehydrateFromCloud();
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);

    const CROSS_DEVICE_POLL_MS = 2 * 60 * 1000;
    const pollId = setInterval(() => {
      if (AppState.currentState === "active") void rehydrateFromCloud();
    }, CROSS_DEVICE_POLL_MS);

    return () => {
      subscription.remove();
      clearInterval(pollId);
    };
  }, []);

  async function handleQuickUpload() {
    setRecoveryBusy(true);
    setRecoveryMessage("");
    try {
      const uploaded = await forceUploadLocalProgressToCloud();
      if (uploaded > 0) {
        setRecoveryMessage(`Uploaded ${uploaded} progress keys to your account.`);
        await loadStats();
      } else {
        setRecoveryMessage("No saved progress found to upload, or sign in first.");
      }
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function loadDiagnostics() {
    const [live, sync, session, swReg] = await Promise.all([
      fetchLiveVersion(),
      getSyncDiagnostics(),
      getSession(),
      Platform.OS === "web" && typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? navigator.serviceWorker.getRegistration()
        : Promise.resolve(null),
    ]);
    setDiagnostics({
      liveVersion: live?.version ?? null,
      swActive: Boolean(swReg?.active),
      // Last 6 chars only — enough to correlate a support report with a specific account
      // without displaying the full identifier.
      userIdSuffix: session?.user?.id ? session.user.id.slice(-6) : null,
      lastCloudHydrationAt: sync.lastCloudHydrationAt,
      ldmStateSource: sync.ldmStateSource,
      schemaVersion: sync.schemaVersion,
    });
  }

  function toggleDiagnostics() {
    const next = !showDiagnostics;
    setShowDiagnostics(next);
    if (next) void loadDiagnostics();
  }

  async function handleLogout() {
    await signOut();
    // Never let this account's cached state leak into whichever account signs in next on
    // this device — the data isn't lost, it already lives in the cloud and rehydrates
    // normally next time this user signs back in.
    await clearAllLocalProgressForSignOut();
    router.replace("/auth");
  }

  async function loadStats() {
    const [latestCheckIn, checkIns, completedQuests, quickThoughts, dayPlan, journalEntries,
      dreamJournalEntries, preSleepIntentions, morningReflections, alternateMorningReflections,
      meditations, reflections, sleepCalendar, userStats, affirmations] = await Promise.all([
      readJson<CheckIn | null>(CHECKIN_KEY, null),
      readJson<CheckIn[]>(CHECKIN_HISTORY_KEY, []),
      readJson<unknown>(COMPLETED_QUESTS_KEY, []),
      readJson<unknown>(QUICK_THOUGHTS_KEY, []),
      readJson<unknown>(DAY_PLAN_KEY, null),
      readJson<unknown>(JOURNAL_KEY, []),
      readJson<unknown>(DREAM_JOURNAL_KEY, []),
      readJson<unknown>(PRE_SLEEP_INTENTIONS_KEY, []),
      readJson<unknown>(MORNING_REFLECTIONS_KEY, []),
      readJson<unknown>(MORNING_INTENTION_REFLECTIONS_KEY, []),
      readJson<unknown>(MEDITATIONS_KEY, []),
      readJson<unknown>(REFLECTIONS_KEY, []),
      readJson<unknown>(SLEEP_CALENDAR_KEY, []),
      readJson<UserStats>(USER_STATS_KEY, {}),
      readJson<unknown[]>(AFFIRMATIONS_KEY, []),
    ]);

    // Compute fresh from completed actions only — ignores any stale stored totals/bonuses.
    // This guarantees: if earnedSteps === 0, displayTotal === 0. No bonus at Level 1.
    const earnedSteps = computeItemStepsFromSources(dayPlan, quickThoughts);
    const todayCompletions = await loadTodayCompletions();
    const todayScopedEarnedSteps = computeTodayScopedEarnedSteps({
      dayPlan,
      quickThoughts,
      todayCompletions,
    });
    const affirmationsCount = Array.isArray(affirmations) ? affirmations.length : 0;
    // Already all-time cumulative on their own — added on top of the per-day ledger rather
    // than banked into it (banking them too would double count them every future day).
    const alwaysCumulativeSteps = affirmationsCount + safeNumber(userStats.totalSteps, 0);
    // Same authoritative per-day ledger Home reads (see reconcileMonotonicTotalSteps) — this
    // actually accumulates across days instead of freezing at one historical peak.
    const displayEarnedSteps = (await reconcileMonotonicTotalSteps(todayScopedEarnedSteps)) + alwaysCumulativeSteps;
    const { rankBonusPool, awardedThresholds } = computeFreshRankBonuses(displayEarnedSteps);
    const prevAwarded = Array.isArray(userStats.rankBonusesAwarded) ? userStats.rankBonusesAwarded : [];
    const hasNewBonuses = awardedThresholds.some(t => !prevAwarded.includes(t));

    if (hasNewBonuses) {
      await persistProgressKeys({
        [USER_STATS_KEY]: JSON.stringify({
          ...userStats,
          rankBonusesAwarded: awardedThresholds,
        }),
      });
    }

    setStats({
      latestCheckIn, checkIns: Array.isArray(checkIns) ? checkIns : [],
      completedQuests, quickThoughts, dayPlan, journalEntries, dreamJournalEntries,
      preSleepIntentions, morningReflections, alternateMorningReflections,
      meditations, reflections, sleepCalendar,
      earnedSteps: displayEarnedSteps, rankBonusPool, rankBonusesAwarded: awardedThresholds,
    });

    // Fire-and-forget: Rank compares against other players and needs a network
    // round trip, so it should never block the rest of the stats screen.
    void syncAndGetStepRank(displayEarnedSteps + rankBonusPool).then(setStepRank);
  }

  const computed = useMemo(() => {
    const checkIns = stats.checkIns;
    const latest = stats.latestCheckIn ?? checkIns[checkIns.length - 1] ?? null;
    const energies = checkIns.map((c: CheckIn) => getNumber(c.energy)).filter((v): v is number => v !== null);
    const progressDays = checkIns.filter((c: CheckIn) => c.mode === "Progress").length;
    const recoveryDays = checkIns.filter((c: CheckIn) => c.mode === "Recovery").length;
    const wakeTimes = [...checkIns.map((c: CheckIn) => c.wakeTime), ...toArray(stats.sleepCalendar).map((e) => (e as Record<string, unknown>)?.wakeTime)].filter((v): v is string => typeof v === "string");
    const sleepTimes = [...checkIns.map((c: CheckIn) => c.sleepTime), ...toArray(stats.sleepCalendar).map((e) => (e as Record<string, unknown>)?.sleepTime)].filter((v): v is string => typeof v === "string");
    const morningCount = countAny(stats.morningReflections) + countAny(stats.alternateMorningReflections);
    const quickThoughtCount = countAny(stats.quickThoughts);
    const completedQuickThoughts = Array.isArray(stats.quickThoughts) ? stats.quickThoughts.filter((i: unknown) => Boolean((i as Record<string, unknown>).completedAt)).length : 0;
    const checkInCount = checkIns.length + (stats.latestCheckIn && checkIns.length === 0 ? 1 : 0);
    const totalSteps = stats.earnedSteps + stats.rankBonusPool;
    const weeklySteps = getWeeklySteps(stats.quickThoughts, stats.dayPlan);
    const rankInfo = getSkillInfo(totalSteps);
    return {
      latest, latestEnergy: getNumber(latest?.energy), latestMode: latest?.mode ?? "Not logged yet",
      latestSleep: latest?.sleep ?? latest?.hours, latestMood: latest?.mood, latestStress: latest?.stress,
      questsCompleted: countAny(stats.completedQuests), quickThoughtCount, completedQuickThoughts,
      journalCount: countAny(stats.journalEntries), dreamJournalCount: countAny(stats.dreamJournalEntries),
      preSleepCount: countAny(stats.preSleepIntentions), morningCount,
      meditationCount: countAny(stats.meditations), reflectionCount: countAny(stats.reflections),
      averageEnergy: average(energies), progressDays, recoveryDays, checkInCount,
      averageWakeTime: averageTime(wakeTimes), averageSleepTime: averageTime(sleepTimes),
      totalSteps, weeklySteps, rankBonusesAwarded: stats.rankBonusesAwarded,
      ...rankInfo,
    };
  }, [stats]);

  const smallWin = computed.completedQuickThoughts > 0
    ? "You completed a scheduled quest this week."
    : computed.questsCompleted > 0 ? "You finished at least one quest. That's a real step forward."
    : computed.checkInCount > 0 ? "You checked in this week. That gives you real data to work with."
    : "Starting with one honest check-in is enough.";

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.default} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
            <ScrollView style={styles.screenScroller} contentContainerStyle={[styles.hudContent, { paddingBottom: mobile.scrollPaddingBottom }]} showsVerticalScrollIndicator={false} bounces={false}>

              <View style={styles.heroPanel}>
                <WorldChrome hub="stats" kicker="STATS BOARD" title="STATS" subtitle="Know your journey. Level up with insight." />
                <TouchableOpacity style={styles.infoBtn} onPress={() => setActiveInfo("stats")}>
                  <Text style={styles.infoBtnText}>?</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.eviePanel}>
                <Image source={uiAssets.guides.evie} style={styles.evieAvatar} resizeMode="contain" />
                <View style={styles.evieCopy}>
                  <Text style={styles.evieName}>EVIE</Text>
                  <Text style={styles.evieText}>Stats help you spot patterns, track growth, and adjust your habits with intention.</Text>
                </View>
                <TouchableOpacity style={styles.infoBtn} onPress={() => setActiveInfo("evie")}>
                  <Text style={styles.infoBtnText}>?</Text>
                </TouchableOpacity>
              </View>

              {/* Current Status Snapshot */}
              <View style={styles.snapshotCard}>
                <Text style={styles.snapshotTitle}>CURRENT STATUS</Text>
                <View style={styles.snapshotGrid}>
                  <View style={styles.snapStat}>
                    <Text style={styles.snapValue}>{computed.totalSteps}</Text>
                    <Text style={styles.snapLabel}>TOTAL STEPS</Text>
                  </View>
                  <View style={[styles.snapStat, styles.snapDividerLeft]}>
                    <Text style={styles.snapValue}>{skillTierName(computed.currentLevel)}</Text>
                    <Text style={styles.snapLabel}>LV {computed.currentLevel} SKILL</Text>
                  </View>
                  <View style={[styles.snapStat, styles.snapDividerTop]}>
                    <Text style={styles.snapValue}>{computed.latestEnergy !== null ? `${computed.latestEnergy}` : "—"}</Text>
                    <Text style={styles.snapLabel}>ENERGY /100</Text>
                  </View>
                  <View style={[styles.snapStat, styles.snapDividerTop, styles.snapDividerLeft]}>
                    <Text style={styles.snapValue}>{computed.weeklySteps}</Text>
                    <Text style={styles.snapLabel}>THIS WEEK</Text>
                  </View>
                </View>
                <View style={styles.miniProgressTrack}>
                  <View style={[styles.miniProgressFill, { width: `${computed.percentToNext}%` }]} />
                </View>
                <Text style={styles.rankCaption}>
                  {computed.percentToNext}% to {skillTierName(computed.currentLevel + 1)} · {computed.stepsRemaining} steps remain
                </Text>
              </View>

              <ChestCard accent="gold" icon="📅" title="WEEKLY SUMMARY" subtitle="Energy, steps & activity this week." meta={`${weekRange()} · ${computed.weeklySteps} steps`} onPress={() => setActivePanel("weekly")} onInfo={() => setActiveInfo("weekly")} />
              <ChestCard accent="green" icon="🛡️" title="SKILL PROGRESS" subtitle="Steps, level, and next skill unlock." meta={`${computed.totalSteps} / ${computed.nextRankAt} · ${computed.percentToNext}%`} onPress={() => setActivePanel("skill")} onInfo={() => setActiveInfo("skill")} />
              <ChestCard accent="purple" icon="🏆" title="RANK" subtitle="Your steps vs other players." meta={stepRank ? `#${stepRank.rank} of ${stepRank.totalPlayers}` : "Sign in to rank"} onPress={() => setActivePanel("rank")} onInfo={() => setActiveInfo("rank")} />
              <ChestCard accent="gold" icon="📊" title="BEHAVIOR" subtitle="Routines, sleep & cognitive habits." meta={`${computed.progressDays} progress · ${computed.recoveryDays} recovery`} onPress={() => setActivePanel("behavior")} onInfo={() => setActiveInfo("behavior")} />
              <ChestCard accent="purple" icon="📖" title={LOG_HISTORY_HEADING} subtitle="Journals, reflections, meditations, dreams & intentions." meta="Saved to your account · synced across devices" onPress={() => router.push("/log-history")} />
              <ChestCard accent="green" icon="🧭" title="EDIT MY LIFE PROFILE" subtitle="Name, goals, obstacles, and how Evie/Luna should support you." meta="Optional · helps Evie and Luna understand you" onPress={() => router.push("/life-profile")} />
              <ChestCard accent="purple" icon="📜" title="GUIDE CONTEXT" subtitle="What you've shared with Luna and Evie — and remove any of it." meta="Explicit, revocable · nothing is shared automatically" onPress={() => router.push("/guide-context")} />

              <TouchableOpacity style={styles.learningLoopButton} onPress={() => setShowLearningLoopModal(true)}>
                <Text style={styles.learningLoopButtonText}>🔁 MYLIT LEARNING LOOP</Text>
              </TouchableOpacity>
              <Text style={styles.learningLoopNote}>See what Stats is learning so Evie, Luna, and Calendar can adjust.</Text>

              <Modal visible={showLearningLoopModal} transparent animationType="fade" onRequestClose={() => setShowLearningLoopModal(false)}>
                <View style={styles.learningLoopBackdrop}>
                  <ScrollView style={styles.learningLoopPanel} contentContainerStyle={styles.learningLoopContent}>
                    <GuideFoundationCard />
                    <TouchableOpacity style={styles.learningLoopCloseBtn} onPress={() => setShowLearningLoopModal(false)}>
                      <Text style={styles.learningLoopCloseBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </Modal>

              <View style={styles.pageFooter}>
                <View style={styles.pageFooterLine} />
                <Text style={styles.pageFooterText}>MYLIT · YOUR JOURNEY</Text>
                <View style={styles.pageFooterLine} />
              </View>

              <View style={styles.recoveryCard}>
                <Text style={styles.recoveryTitle}>PROGRESS RECOVERY</Text>
                <Text style={styles.recoveryText}>
                  Use this if your steps or quests disappeared after signing in. MYLIT will scan this
                  device for saved progress and merge it into your account without deleting anything.
                </Text>
                {recoveryMessage ? <Text style={styles.recoveryMessage}>{recoveryMessage}</Text> : null}
                <TouchableOpacity style={styles.recoveryButton} onPress={() => setRecoveryVisible(true)}>
                  <Text style={styles.recoveryButtonText}>RECOVER LOCAL PROGRESS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.recoveryButton, styles.recoveryButtonSecondary]}
                  onPress={() => void handleQuickUpload()}
                  disabled={recoveryBusy}
                >
                  {recoveryBusy ? (
                    <ActivityIndicator color="#E9D5FF" />
                  ) : (
                    <Text style={styles.recoveryButtonTextSecondary}>UPLOAD THIS DEVICE&apos;S PROGRESS</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.diagnosticsToggle} onPress={toggleDiagnostics}>
                <Text style={styles.diagnosticsToggleText}>{showDiagnostics ? "HIDE DIAGNOSTICS" : "DIAGNOSTICS (SUPPORT)"}</Text>
              </TouchableOpacity>
              {showDiagnostics ? (
                <View style={styles.diagnosticsCard}>
                  {diagnostics ? (
                    <>
                      <Text style={styles.diagnosticsRow}>Running version: {APP_VERSION}</Text>
                      <Text style={styles.diagnosticsRow}>Live version: {diagnostics.liveVersion ?? "unknown"}</Text>
                      <Text style={styles.diagnosticsRow}>Service worker active: {diagnostics.swActive ? "yes" : "no"}</Text>
                      <Text style={styles.diagnosticsRow}>Account: {diagnostics.userIdSuffix ? `…${diagnostics.userIdSuffix}` : "not signed in"}</Text>
                      <Text style={styles.diagnosticsRow}>Schema version: {diagnostics.schemaVersion}</Text>
                      <Text style={styles.diagnosticsRow}>Last cloud hydration: {diagnostics.lastCloudHydrationAt ?? "never"}</Text>
                      <Text style={styles.diagnosticsRow}>LDM state source: {diagnostics.ldmStateSource ?? "n/a"}</Text>
                    </>
                  ) : (
                    <ActivityIndicator color="#94A3B8" />
                  )}
                </View>
              ) : null}

              <TouchableOpacity style={styles.logoutButton} onPress={() => void handleLogout()}>
                <Text style={styles.logoutButtonText}>SIGN OUT</Text>
              </TouchableOpacity>

              <View style={styles.installCard}>
                <Text style={styles.installTitle}>INSTALL MYLIT</Text>
                <Text style={styles.installText}>1. Open mylit.net in Safari</Text>
                <Text style={styles.installText}>2. Tap Share</Text>
                <Text style={styles.installText}>3. Tap Add to Home Screen</Text>
                <Text style={styles.installText}>4. Open MYLIT from your Home Screen</Text>
              </View>

            </ScrollView>

            <BottomNav activeRoute="stats" bottomOffset={mobile.bottomNavOffset} />

            {activePanel !== null ? (
              <View style={styles.modalOverlay}>
                <View style={[styles.modalPanel, { width: modalWidth, maxHeight: modalMaxHeight }]}>
                  <View style={styles.modalTopBar}>
                    <TouchableOpacity
                      style={styles.infoBtn}
                      onPress={() =>
                        setActiveInfo(
                          activePanel === "weekly"
                            ? "weeklyPopup"
                            : activePanel === "skill"
                            ? "skillPopup"
                            : activePanel === "rank"
                            ? "rankPopup"
                            : "behaviorPopup"
                        )
                      }
                    >
                      <Text style={styles.infoBtnText}>?</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.closeButton} onPress={() => setActivePanel(null)}>
                      <Text style={styles.closeButtonText}>×</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                    {activePanel === "weekly" ? <WeeklyPanel computed={computed} smallWin={smallWin} /> : null}
                    {activePanel === "skill" ? <SkillPanel computed={computed} /> : null}
                    {activePanel === "rank" ? <RankPanel stepRank={stepRank} /> : null}
                    {activePanel === "behavior" ? <BehaviorPanel computed={computed} /> : null}
                    <TouchableOpacity style={styles.returnButton} onPress={() => setActivePanel(null)}>
                      <Text style={styles.returnButtonText}>RETURN</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </View>
            ) : null}

            {activeInfo !== null ? (
              <View style={styles.infoOverlay}>
                <View style={[styles.infoCard, { width: Math.min(width - 32, 480) }]}>
                  <Text style={styles.infoTitle}>{INFO_COPY[activeInfo].title}</Text>
                  <Text style={styles.infoBody}>{INFO_COPY[activeInfo].body}</Text>
                  <View style={styles.lunaInfoRow}>
                    <Image source={uiAssets.guides.luna} style={styles.lunaInfoImage} resizeMode="contain" />
                    <Text style={styles.lunaInfoText}>Luna · MYLIT Guide</Text>
                  </View>
                  <TouchableOpacity style={styles.returnButton} onPress={() => setActiveInfo(null)}>
                    <Text style={styles.returnButtonText}>RETURN</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <ProgressRecoveryModal
              visible={recoveryVisible}
              onClose={() => setRecoveryVisible(false)}
              onRecovered={() => {
                void loadStats();
                setRecoveryMessage("Progress recovered and saved to your account.");
              }}
            />
          </View>
        </View>
      </View>
  );
}

function ChestCard({ accent, icon, title, subtitle, meta, onPress, onInfo }: { accent: "gold" | "green" | "purple"; icon: string; title: string; subtitle: string; meta: string; onPress: () => void; onInfo?: () => void }) {
  const borderStyle = accent === "gold" ? styles.goldChest : accent === "green" ? styles.greenChest : styles.purpleChest;
  const glowStyle = accent === "gold" ? styles.goldGlow : accent === "green" ? styles.greenGlow : styles.purpleGlow;
  const textStyle = accent === "gold" ? styles.goldText : accent === "green" ? styles.greenText : styles.purpleText;
  const metaBgStyle = accent === "gold" ? styles.goldMetaBg : accent === "green" ? styles.greenMetaBg : styles.purpleMetaBg;
  return (
    <TouchableOpacity style={[styles.chestCard, borderStyle]} onPress={onPress} activeOpacity={0.82}>
      <View style={[styles.chestIconWrap, glowStyle]}><Text style={styles.chestIcon}>{icon}</Text></View>
      <View style={styles.chestCopy}>
        <Text style={styles.chestTitle}>{title}</Text>
        <Text style={styles.chestSubtitleText}>{subtitle}</Text>
        <View style={[styles.chestMeta, metaBgStyle]}>
          <Text style={[styles.chestMetaText, textStyle]}>{meta}</Text>
        </View>
      </View>
      <View style={styles.chestRight}>
        {onInfo ? (
          <TouchableOpacity style={styles.infoBtn} onPress={onInfo}>
            <Text style={styles.infoBtnText}>?</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.openCue, textStyle]}>›</Text>
      </View>
    </TouchableOpacity>
  );
}


function StatCard({ label, value, accent = "#FBBF24" }: { label: string; value: string | number; accent?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

type ComputedStats = {
  latest: CheckIn | null; latestEnergy: number | null; latestMode: string; latestSleep: unknown; latestMood: unknown; latestStress: unknown;
  questsCompleted: number; quickThoughtCount: number; completedQuickThoughts: number; journalCount: number; dreamJournalCount: number;
  preSleepCount: number; morningCount: number; meditationCount: number; reflectionCount: number; averageEnergy: number | null;
  progressDays: number; recoveryDays: number; checkInCount: number; averageWakeTime: string | null; averageSleepTime: string | null;
  totalSteps: number; weeklySteps: number; rankBonusesAwarded: number[];
  currentLevel: number; stepsIntoRank: number; percentToNext: number; nextRankAt: number; stepsRemaining: number;
};

function WeeklyPanel({ computed, smallWin }: { computed: ComputedStats; smallWin: string }) {
  return (
    <>
      <Text style={styles.modalTitle}>WEEKLY SUMMARY</Text>
      <Text style={styles.modalSubtitle}>{weekRange()}</Text>
      <View style={styles.featureCard}>
        <View style={styles.featureHalf}>
          <Text style={styles.cardKicker}>ENERGY</Text>
          <Text style={styles.bigNumber}>{computed.latestEnergy !== null ? `${computed.latestEnergy}` : "—"}</Text>
          <Text style={styles.bigUnit}>/100</Text>
        </View>
        <View style={styles.featureDivider} />
        <View style={styles.featureHalf}>
          <Text style={styles.cardKicker}>MODE</Text>
          <Text style={computed.latestMode === "Recovery" ? styles.recoveryMode : styles.progressMode}>{formatValue(computed.latestMode)}</Text>
          <Text style={styles.detailText}>Sleep: {formatValue(computed.latestSleep)} • Mood: {formatValue(computed.latestMood)}</Text>
        </View>
      </View>
      <View style={styles.statsGrid}>
        <StatCard label="Total Steps" value={computed.totalSteps} accent="#FBBF24" />
        <StatCard label="Steps This Week" value={computed.weeklySteps} accent="#FDE68A" />
        <StatCard label="Quests Completed" value={computed.questsCompleted} />
        <StatCard label="Scheduled Quests Done" value={computed.completedQuickThoughts} accent="#C084FC" />
        <StatCard label="Progress Days" value={computed.progressDays} accent="#6EE7B7" />
        <StatCard label="Recovery Days" value={computed.recoveryDays} accent="#C084FC" />
        <StatCard label="Avg Energy" value={computed.averageEnergy ?? "—"} accent="#67E8F9" />
        <StatCard label="Check-ins" value={computed.checkInCount} />
        <StatCard label="Pre-sleep Intentions" value={computed.preSleepCount} accent="#A78BFA" />
        <StatCard label="Morning Reflections" value={computed.morningCount} accent="#FDE68A" />
        <StatCard label="Journal Entries" value={computed.journalCount} />
        <StatCard label="Dream Journal" value={computed.dreamJournalCount} accent="#93C5FD" />
      </View>
      <View style={styles.smallWinCard}><Text style={styles.smallWinTitle}>SMALL WIN</Text><Text style={styles.smallWinText}>{smallWin}</Text></View>
      <LunaNote text="You do not need a perfect week to learn something useful." />
    </>
  );
}

function SkillPanel({ computed }: { computed: ComputedStats }) {
  const bonusStepsTotal = computed.rankBonusesAwarded.length * 10;
  return (
    <>
      <Text style={styles.modalTitle}>SKILL PROGRESS</Text>
      <View style={styles.rankDuelCard}>
        <View style={styles.rankBlock}><Text style={styles.cardKicker}>CURRENT SKILL</Text><Text style={styles.rankBadge}>🛡️</Text><Text style={styles.rankName}>{skillTierName(computed.currentLevel)}</Text><Text style={styles.levelText}>Level {computed.currentLevel}</Text></View>
        <Text style={styles.rankArrow}>»</Text>
        <View style={styles.rankBlock}><Text style={styles.cardKicker}>NEXT SKILL</Text><Text style={styles.rankBadge}>💎</Text><Text style={styles.rankName}>{skillTierName(computed.currentLevel + 1)}</Text><Text style={styles.levelText}>Level {computed.currentLevel + 1}</Text></View>
      </View>
      <View style={styles.progressCard}>
        <Text style={[styles.cardKicker, { color: "#92610A" }]}>TOTAL STEPS → NEXT SKILL AT {computed.nextRankAt}</Text>
        <Text style={styles.progressTotal}>{computed.totalSteps} <Text style={styles.progressUnit}>/ {computed.nextRankAt}</Text></Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${computed.percentToNext}%` }]} /></View>
        <Text style={styles.progressCaption}>{computed.percentToNext}% to next skill • {computed.stepsRemaining} steps remain</Text>
      </View>
      <View style={styles.statsGrid}>
        <StatCard label="Total Steps" value={computed.totalSteps} accent="#FBBF24" />
        <StatCard label="Steps This Week" value={computed.weeklySteps} accent="#67E8F9" />
        <StatCard label="Skill Bonuses Earned" value={`+${bonusStepsTotal} pts`} accent="#86EFAC" />
        <StatCard label="Next Unlock" value={skillTierName(computed.currentLevel + 1)} accent="#C084FC" />
      </View>
      <View style={styles.smallWinCard}>
        <Text style={styles.smallWinTitle}>NEXT UNLOCK PREVIEW</Text>
        <Text style={styles.smallWinText}>Reach {computed.nextRankAt} steps to unlock {skillTierName(computed.currentLevel + 1)}. Each skill unlock grants +10 bonus steps — once only.</Text>
      </View>
      <LunaNote text="Progress builds quietly. Every honest step still counts." />
    </>
  );
}

function RankPanel({ stepRank }: { stepRank: StepRank | null }) {
  return (
    <>
      <Text style={styles.modalTitle}>RANK</Text>
      <View style={styles.rankDuelCard}>
        <View style={styles.rankBlock}>
          <Text style={styles.cardKicker}>YOUR RANK</Text>
          <Text style={styles.rankBadge}>🏆</Text>
          <Text style={styles.rankName}>{stepRank ? `#${stepRank.rank}` : "Unranked"}</Text>
          <Text style={styles.levelText}>{stepRank ? `of ${stepRank.totalPlayers} players` : "Sign in to rank"}</Text>
        </View>
      </View>
      <View style={styles.smallWinCard}>
        <Text style={styles.smallWinTitle}>HOW RANK WORKS</Text>
        <Text style={styles.smallWinText}>
          Rank compares your total steps to every other signed-in MYLIT player. Whoever has the
          most steps holds Rank #1 — ties share the same rank. Sign in and keep completing
          actions to be ranked.
        </Text>
      </View>
      <LunaNote text="Rank is a mirror, not a judgment. Compare kindly." />
    </>
  );
}

function BehaviorPanel({ computed }: { computed: ComputedStats }) {
  const total = computed.progressDays + computed.recoveryDays;
  const pct = total > 0 ? Math.round((computed.progressDays / total) * 100) : 0;
  const rct = total > 0 ? 100 - pct : 0;
  return (
    <>
      <Text style={styles.modalTitle}>BEHAVIOR</Text>
      <Text style={styles.modalSubtitle}>Patterns are information, not judgment.</Text>
      <View style={styles.balanceCard}>
        <Text style={styles.cardKicker}>PROGRESS VS RECOVERY</Text>
        <View style={styles.balanceRow}><Text style={styles.progressMode}>{pct}% Progress</Text><Text style={styles.recoveryMode}>{rct}% Recovery</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFillGreen, { width: `${pct}%` }]} /><View style={[styles.progressFillPurple, { width: `${rct}%` }]} /></View>
      </View>
      <View style={styles.statsGrid}>
        <StatCard label="Progress Days" value={computed.progressDays} accent="#86EFAC" />
        <StatCard label="Recovery Days" value={computed.recoveryDays} accent="#C084FC" />
        <StatCard label="Avg Energy" value={computed.averageEnergy ?? "—"} accent="#67E8F9" />
        <StatCard label="Check-ins" value={computed.checkInCount} accent="#FDE68A" />
        <StatCard label="Avg Wake Time" value={computed.averageWakeTime ?? "—"} accent="#FDE68A" />
        <StatCard label="Avg Sleep Time" value={computed.averageSleepTime ?? "—"} accent="#93C5FD" />
      </View>
      <Text style={styles.sectionTitle}>COGNITIVE MARKERS</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Dream Journal" value={computed.dreamJournalCount} accent="#93C5FD" />
        <StatCard label="Meditations" value={computed.meditationCount} accent="#C084FC" />
        <StatCard label="Reflections" value={computed.reflectionCount} accent="#86EFAC" />
        <StatCard label="Morning Reflections" value={computed.morningCount} accent="#FDE68A" />
        <StatCard label="Pre-sleep Intentions" value={computed.preSleepCount} accent="#A78BFA" />
        <StatCard label="Journal Entries" value={computed.journalCount} />
      </View>
      <LunaNote text="Patterns are information, not judgment. Use them to choose your next honest step." />
    </>
  );
}

function LunaNote({ text }: { text: string }) {
  return (
    <View style={styles.lunaNote}>
      <Image source={uiAssets.guides.luna} style={styles.lunaNoteImage} resizeMode="contain" />
      <View style={styles.lunaNoteCopy}>
        <Text style={styles.lunaNoteName}>LUNA</Text>
        <Text style={styles.lunaNoteText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  learningLoopButton: { borderWidth: 2, borderColor: "#38BDF8", borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(12,74,110,0.35)", marginTop: 4 },
  learningLoopButtonText: { color: "#BAE6FD", fontFamily: "monospace", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  learningLoopNote: { color: "#94A3B8", fontSize: 10, fontWeight: "700", textAlign: "center", marginTop: 6, marginBottom: 12 },
  learningLoopBackdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.88)", padding: 18, paddingTop: 60, paddingBottom: 40 },
  learningLoopPanel: { flex: 1, backgroundColor: "rgba(46,32,20,0.98)", borderWidth: 3, borderColor: "#5C4425", borderRadius: 12 },
  learningLoopContent: { padding: 16 },
  learningLoopCloseBtn: { marginTop: 8, alignItems: "center", paddingVertical: 10 },
  learningLoopCloseBtnText: { color: "#94A3B8", fontFamily: "monospace", fontSize: 11, fontWeight: "900" },
  pageRoot: { flex: 1, backgroundColor: "#140F0A" },
  phoneStage: { alignSelf: "center", backgroundColor: "#1C1410", overflow: "hidden", position: "relative", borderWidth: 2, borderColor: "rgba(251,191,36,0.55)", shadowColor: "#000", shadowOpacity: 0.85, shadowRadius: 0, shadowOffset: { width: 6, height: 6 } },
  phoneStageFullscreen: { borderWidth: 0, shadowOpacity: 0 },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  backgroundImage: { width: "100%", height: "100%" },
  worldOverlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.65)" },
  screenScroller: { flex: 1 },
  hudContent: { minHeight: "100%", paddingTop: 14, paddingHorizontal: 14, paddingBottom: 82 },
  heroPanel: { position: "relative", marginBottom: 8 },
  heroCopyRow: { flexDirection: "row", alignItems: "center" },
  heroCopy: { flex: 1 },
  heroLabel: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 28, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  heroSubtitle: { color: "#F8E7A1", fontSize: 11, fontWeight: "800", lineHeight: 16 },
  eviePanel: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(46,32,20,0.95)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, padding: 8, marginBottom: 8 },
  evieAvatar: { width: 44, height: 50, marginRight: 8 },
  evieCopy: { flex: 1 },
  evieName: { color: "#FDE047", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  evieText: { color: "#CBD5E1", fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  infoBtn: { position: "absolute", top: 10, right: 10, width: 26, height: 26, borderWidth: 2, borderColor: "#8A6D3A", borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#F5EFE2" },
  infoBtnText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  chestCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#EAD9B6", borderWidth: 3, borderColor: "#5C4425", borderRadius: 8, padding: 10, marginBottom: 8, minHeight: 80, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 3, height: 3 } },
  goldChest: { borderLeftWidth: 6, borderLeftColor: "#FBBF24" }, greenChest: { borderLeftWidth: 6, borderLeftColor: "#22C55E" }, purpleChest: { borderLeftWidth: 6, borderLeftColor: "#A855F7" },
  chestIconWrap: { width: 52, height: 52, borderRadius: 6, alignItems: "center", justifyContent: "center", marginRight: 10 },
  goldGlow: { backgroundColor: "rgba(251,191,36,0.28)" }, greenGlow: { backgroundColor: "rgba(34,197,94,0.28)" }, purpleGlow: { backgroundColor: "rgba(168,85,247,0.28)" },
  chestIcon: { fontSize: 30 },
  chestCopy: { flex: 1 },
  chestTitle: { color: "#4A3620", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  chestSubtitleText: { color: "#7C5B2B", fontSize: 11, lineHeight: 15, marginTop: 2, fontWeight: "700" },
  chestMeta: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, marginTop: 6, alignSelf: "flex-start" },
  chestMetaText: { fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  goldMetaBg: { backgroundColor: "rgba(251,191,36,0.14)" },
  greenMetaBg: { backgroundColor: "rgba(34,197,94,0.14)" },
  purpleMetaBg: { backgroundColor: "rgba(168,85,247,0.14)" },
  goldText: { color: "#FBBF24" }, greenText: { color: "#86EFAC" }, purpleText: { color: "#C084FC" },
  chestRight: { flexDirection: "column", alignItems: "center", gap: 4, marginLeft: 4 },
  openCue: { fontSize: 26, fontWeight: "900" },
  snapshotCard: { backgroundColor: "#EAD9B6", borderWidth: 3, borderColor: "#92610A", borderRadius: 8, padding: 10, marginBottom: 8, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 3, height: 3 } },
  snapshotTitle: { color: "#92610A", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 6 },
  snapshotGrid: { flexDirection: "row", flexWrap: "wrap" },
  snapStat: { width: "50%", paddingVertical: 5, paddingHorizontal: 6, alignItems: "center" },
  snapValue: { color: "#4A3620", fontFamily: pixelFont, fontSize: 17, fontWeight: "900" },
  snapLabel: { color: "#7C5B2B", fontFamily: pixelFont, fontSize: 8, fontWeight: "900", marginTop: 2, letterSpacing: 0.5 },
  snapDividerLeft: { borderLeftWidth: 1, borderLeftColor: "#8B6B3D" },
  snapDividerTop: { borderTopWidth: 1, borderTopColor: "#8B6B3D" },
  miniProgressTrack: { height: 8, borderRadius: 4, backgroundColor: "#F4E8CE", borderWidth: 1, borderColor: "#92610A", overflow: "hidden", marginTop: 8, marginBottom: 4 },
  miniProgressFill: { height: "100%", backgroundColor: "#FBBF24" },
  rankCaption: { color: "#7C5B2B", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", textAlign: "center" },
  pageFooter: { flexDirection: "row", alignItems: "center", paddingVertical: 10, marginBottom: 2 },
  pageFooterLine: { flex: 1, height: 1, backgroundColor: "#3E2A1A" },
  pageFooterText: { color: "#5C4425", fontFamily: pixelFont, fontSize: 8, fontWeight: "900", letterSpacing: 1.5, marginHorizontal: 10 },
  bottomNav: { position: "absolute", bottom: 8, left: 8, right: 8, height: 62, flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(4,8,16,0.98)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 5, padding: 4 },
  navButton: { flex: 1, backgroundColor: "#3E2A1A", borderWidth: 2, borderColor: "#3A4558", borderRadius: 3, paddingVertical: 4, marginHorizontal: 2, alignItems: "center", justifyContent: "center" },
  navButtonActive: { backgroundColor: "#162314", borderColor: "#FBBF24" },
  navIcon: { fontSize: 18 },
  navLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 1 },
  navLabelActive: { color: "#FDE68A" },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", alignItems: "center", paddingVertical: 20, zIndex: 10 },
  modalPanel: { backgroundColor: "rgba(8,17,34,0.99)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 12, overflow: "hidden" },
  modalTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  modalContent: { paddingHorizontal: 14, paddingBottom: 14 },
  closeButton: { width: 30, height: 30, borderRadius: 6, borderWidth: 2, borderColor: "#FBBF24", alignItems: "center", justifyContent: "center" },
  closeButtonText: { color: "#FBBF24", fontSize: 24, lineHeight: 26, fontWeight: "900" },
  modalTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 22, fontWeight: "900", textAlign: "center", letterSpacing: 2, marginBottom: 2 },
  modalSubtitle: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 11, textAlign: "center", marginBottom: 10, fontWeight: "800" },
  featureCard: { flexDirection: "row", backgroundColor: "rgba(7,19,38,0.98)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, padding: 12, marginBottom: 10 },
  featureHalf: { flex: 1 },
  featureDivider: { width: 1, backgroundColor: "#475569", marginHorizontal: 10 },
  cardKicker: { color: "#E5E7EB", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, marginBottom: 4 },
  bigNumber: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 28, fontWeight: "900" },
  bigUnit: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  progressMode: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 15, fontWeight: "900" },
  recoveryMode: { color: "#C084FC", fontFamily: pixelFont, fontSize: 15, fontWeight: "900" },
  detailText: { color: "#CBD5E1", fontSize: 11, lineHeight: 15, marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 4 },
  statCard: { width: "48%", backgroundColor: "rgba(46,32,20,0.96)", borderWidth: 2, borderColor: "#5C4425", borderRadius: 8, padding: 10, marginBottom: 8, minHeight: 68, justifyContent: "center" },
  statValue: { fontFamily: pixelFont, fontSize: 20, fontWeight: "900", textAlign: "center" },
  statLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", textAlign: "center", marginTop: 4, lineHeight: 12 },
  smallWinCard: { borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.35)", borderRadius: 8, padding: 10, marginTop: 4, marginBottom: 10 },
  smallWinTitle: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginBottom: 4 },
  smallWinText: { color: "#F8FAFC", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  lunaNote: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: "#A78BFA", backgroundColor: "rgba(49,46,129,0.25)", borderRadius: 8, padding: 10, marginBottom: 10 },
  lunaNoteImage: { width: 42, height: 50, marginRight: 10 },
  lunaNoteCopy: { flex: 1 },
  lunaNoteName: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  lunaNoteText: { color: "#F8FAFC", fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  lunaInfoRow: { flexDirection: "row", alignItems: "center", marginTop: 10, marginBottom: 4 },
  lunaInfoImage: { width: 28, height: 34, marginRight: 8 },
  lunaInfoText: { color: "#A78BFA", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  rankDuelCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 2, borderColor: "#5C4425", backgroundColor: "rgba(7,19,38,0.98)", borderRadius: 8, padding: 12, marginBottom: 10 },
  rankBlock: { flex: 1, alignItems: "center" },
  rankBadge: { fontSize: 26, marginTop: 4 },
  rankName: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", textAlign: "center", marginTop: 4 },
  levelText: { color: "#67E8F9", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 2 },
  rankArrow: { color: "#FBBF24", fontSize: 22, fontWeight: "900", marginHorizontal: 6 },
  progressCard: { borderWidth: 3, borderColor: "#92610A", backgroundColor: "#EAD9B6", borderRadius: 8, padding: 12, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 3, height: 3 } },
  progressTotal: { color: "#4A3620", fontFamily: pixelFont, fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 4 },
  progressUnit: { color: "#7C5B2B", fontSize: 15, fontWeight: "900" },
  progressTrack: { height: 14, borderRadius: 7, borderWidth: 1, borderColor: "#92610A", backgroundColor: "#F4E8CE", flexDirection: "row", overflow: "hidden", marginTop: 10 },
  progressFill: { height: "100%", backgroundColor: "#FBBF24" },
  progressFillGreen: { height: "100%", backgroundColor: "#22C55E" },
  progressFillPurple: { height: "100%", backgroundColor: "#A855F7" },
  progressCaption: { color: "#7C5B2B", textAlign: "center", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginTop: 6 },
  balanceCard: { borderWidth: 2, borderColor: "#5C4425", backgroundColor: "rgba(7,19,38,0.98)", borderRadius: 8, padding: 12, marginBottom: 10 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, marginBottom: 8 },
  sectionTitle: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginTop: 4, marginBottom: 8, letterSpacing: 1 },
  infoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.86)", justifyContent: "center", alignItems: "center", padding: 20, zIndex: 25 },
  infoCard: { backgroundColor: "rgba(46,32,20,0.99)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 12, padding: 16 },
  infoTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", marginBottom: 10 },
  infoBody: { color: "#CBD5E1", fontSize: 13, lineHeight: 20, fontWeight: "700", marginBottom: 14 },
  returnButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", borderRadius: 6, paddingVertical: 11, alignItems: "center", marginTop: 6 },
  returnButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  recoveryCard: {
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#7C3AED",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "rgba(49,46,129,0.22)",
  },
  recoveryTitle: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  recoveryText: {
    color: "#CBD5E1",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  recoveryMessage: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 8,
    textAlign: "center",
  },
  recoveryButton: {
    backgroundColor: "rgba(46,32,20,0.96)",
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  recoveryButtonSecondary: {
    borderColor: "#475569",
    backgroundColor: "rgba(7,19,38,0.85)",
    marginBottom: 0,
  },
  recoveryButtonText: {
    color: "#E9D5FF",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  recoveryButtonTextSecondary: {
    color: "#94A3B8",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  diagnosticsToggle: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "rgba(46,32,20,0.5)",
  },
  diagnosticsToggleText: {
    color: "#64748B",
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  diagnosticsCard: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#5C4425",
    borderRadius: 6,
    padding: 10,
    backgroundColor: "rgba(2,4,10,0.6)",
    gap: 3,
  },
  diagnosticsRow: {
    color: "#94A3B8",
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "700",
  },
  logoutButton: {
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(46,32,20,0.75)",
  },
  logoutButtonText: {
    color: "#94A3B8",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  installCard: {
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "rgba(7,19,38,0.85)",
  },
  installTitle: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  installText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 16,
  },
});
