import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  ImageBackground,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { uiAssets } from "../constants/uiAssets";

type ActivePanel = "weekly" | "rank" | "behavior" | null;
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

type StatsSnapshot = {
  latestCheckIn: CheckIn | null;
  checkIns: CheckIn[];
  completedQuests: unknown;
  quickThoughts: unknown;
  journalEntries: unknown;
  dreamJournalEntries: unknown;
  preSleepIntentions: unknown;
  morningReflections: unknown;
  alternateMorningReflections: unknown;
  meditations: unknown;
  reflections: unknown;
  sleepCalendar: unknown;
  totalSteps: number;
  completedSteps: number;
};

const CHECKIN_KEY = "lit_latest_checkin";
const CHECKIN_HISTORY_KEY = "lit_checkin_history";
const COMPLETED_QUESTS_KEY = "lit_completed_quests";
const QUICK_THOUGHTS_KEY = "lit_tomorrow_queue";
const JOURNAL_KEY = "lit_journal_entries";
const DREAM_JOURNAL_KEY = "lit_dream_journal";
const PRE_SLEEP_INTENTIONS_KEY = "lit_pre_sleep_intentions";
const MORNING_REFLECTIONS_KEY = "lit_morning_reflections";
const MORNING_INTENTION_REFLECTIONS_KEY = "lit_morning_intention_reflections";
const MEDITATIONS_KEY = "lit_awareness_checks";
const REFLECTIONS_KEY = "lit_reflections";
const SLEEP_CALENDAR_KEY = "lit_sleep_calendar";
const USER_STATS_KEY = "lit_user_stats";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const emptyStats: StatsSnapshot = {
  latestCheckIn: null,
  checkIns: [],
  completedQuests: [],
  quickThoughts: [],
  journalEntries: [],
  dreamJournalEntries: [],
  preSleepIntentions: [],
  morningReflections: [],
  alternateMorningReflections: [],
  meditations: [],
  reflections: [],
  sleepCalendar: [],
  totalSteps: 0,
  completedSteps: 0,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
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
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatValue(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function average(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  return Math.round(numbers.reduce((total, item) => total + item, 0) / numbers.length);
}

function rankName(level: number): string {
  if (level === 1) return "Beginner";
  if (level === 2) return "Explorer";
  if (level === 3) return "Pathfinder";
  if (level === 4) return "Dreamsmith";
  return "Luminary";
}

function weekRange(): string {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
  return `${format(monday)} - ${format(sunday)}`;
}

function averageTime(values: string[]): string | null {
  const minutes = values
    .map((value) => {
      const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (!match) return null;
      let hour = Number(match[1]);
      const minute = Number(match[2]);
      const meridiem = match[3]?.toUpperCase();
      if (meridiem === "PM" && hour < 12) hour += 12;
      if (meridiem === "AM" && hour === 12) hour = 0;
      return hour * 60 + minute;
    })
    .filter((value): value is number => value !== null);

  if (minutes.length === 0) return null;
  const avg = Math.round(minutes.reduce((total, item) => total + item, 0) / minutes.length);
  const hour24 = Math.floor(avg / 60) % 24;
  const minute = avg % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export default function StatsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsSnapshot>(emptyStats);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const [latestCheckIn, checkIns, completedQuests, quickThoughts, journalEntries, dreamJournalEntries, preSleepIntentions, morningReflections, alternateMorningReflections, meditations, reflections, sleepCalendar, userStats] = await Promise.all([
      readJson<CheckIn | null>(CHECKIN_KEY, null),
      readJson<CheckIn[]>(CHECKIN_HISTORY_KEY, []),
      readJson<unknown>(COMPLETED_QUESTS_KEY, []),
      readJson<unknown>(QUICK_THOUGHTS_KEY, []),
      readJson<unknown>(JOURNAL_KEY, []),
      readJson<unknown>(DREAM_JOURNAL_KEY, []),
      readJson<unknown>(PRE_SLEEP_INTENTIONS_KEY, []),
      readJson<unknown>(MORNING_REFLECTIONS_KEY, []),
      readJson<unknown>(MORNING_INTENTION_REFLECTIONS_KEY, []),
      readJson<unknown>(MEDITATIONS_KEY, []),
      readJson<unknown>(REFLECTIONS_KEY, []),
      readJson<unknown>(SLEEP_CALENDAR_KEY, []),
      readJson<Record<string, unknown>>(USER_STATS_KEY, {}),
    ]);

    setStats({
      latestCheckIn,
      checkIns: Array.isArray(checkIns) ? checkIns : [],
      completedQuests,
      quickThoughts,
      journalEntries,
      dreamJournalEntries,
      preSleepIntentions,
      morningReflections,
      alternateMorningReflections,
      meditations,
      reflections,
      sleepCalendar,
      totalSteps: Number(userStats.totalSteps ?? userStats.completedSteps ?? 0),
      completedSteps: Number(userStats.completedSteps ?? 0),
    });
  }

  const computed = useMemo(() => {
    const checkIns = stats.checkIns;
    const latest = stats.latestCheckIn ?? checkIns[checkIns.length - 1] ?? null;
    const energies = checkIns.map((checkIn: CheckIn) => getNumber(checkIn.energy)).filter((value: number | null): value is number => value !== null);
    const progressDays = checkIns.filter((checkIn: CheckIn) => checkIn.mode === "Progress").length;
    const recoveryDays = checkIns.filter((checkIn: CheckIn) => checkIn.mode === "Recovery").length;
    const wakeTimes = [...checkIns.map((checkIn: CheckIn) => checkIn.wakeTime), ...toArray(stats.sleepCalendar).map((entry) => (entry as Record<string, unknown>)?.wakeTime)].filter((value): value is string => typeof value === "string");
    const sleepTimes = [...checkIns.map((checkIn: CheckIn) => checkIn.sleepTime), ...toArray(stats.sleepCalendar).map((entry) => (entry as Record<string, unknown>)?.sleepTime)].filter((value): value is string => typeof value === "string");
    const morningCount = countAny(stats.morningReflections) + countAny(stats.alternateMorningReflections);
    const quickThoughtCount = countAny(stats.quickThoughts);
    const checkInCount = checkIns.length + (stats.latestCheckIn && checkIns.length === 0 ? 1 : 0);
    const rankSize = 50;
    const totalSteps = Math.max(0, Number(stats.totalSteps ?? stats.completedSteps ?? 0));
    const currentLevel = Math.floor(totalSteps / rankSize) + 1;
    const stepsIntoRank = totalSteps % rankSize;
    const percentToNextRank = Math.round((stepsIntoRank / rankSize) * 100);
    const nextRankAt = currentLevel * rankSize;

    return {
      latest,
      latestEnergy: getNumber(latest?.energy),
      latestMode: latest?.mode ?? "Not logged yet",
      latestSleep: latest?.sleep ?? latest?.hours,
      latestMood: latest?.mood,
      latestStress: latest?.stress,
      questsCompleted: countAny(stats.completedQuests),
      quickThoughtCount,
      journalCount: countAny(stats.journalEntries),
      dreamJournalCount: countAny(stats.dreamJournalEntries),
      preSleepCount: countAny(stats.preSleepIntentions),
      morningCount,
      meditationCount: countAny(stats.meditations),
      reflectionCount: countAny(stats.reflections),
      averageEnergy: average(energies),
      progressDays,
      recoveryDays,
      checkInCount,
      averageWakeTime: averageTime(wakeTimes),
      averageSleepTime: averageTime(sleepTimes),
      rankSize,
      totalSteps,
      currentLevel,
      stepsIntoRank,
      percentToNextRank,
      nextRankAt,
    };
  }, [stats]);

  const smallWin = computed.quickThoughtCount > 0
    ? "You saved quick thoughts instead of letting them disappear."
    : computed.checkInCount > 0
    ? "You checked in this week. That gives you real data to work with."
    : "Starting with one honest check-in is enough.";

  return (
    <View style={styles.pageRoot}>
      <View style={styles.phoneStage}>
        <ImageBackground source={uiAssets.backgrounds.default} style={styles.backgroundLayer} imageStyle={styles.backgroundImage}>
          <View style={styles.worldOverlay}>
            <ScrollView style={styles.screenScroller} contentContainerStyle={styles.hudContent}>
              <View style={styles.heroPanel}>
                <Text style={styles.heroLabel}>STATS BOARD</Text>
                <Text style={styles.heroTitle}>STATS</Text>
                <Text style={styles.heroSubtitle}>Know your journey. Level up with insight.</Text>
              </View>

              <View style={styles.guideCard}>
                <Image source={uiAssets.guides.evie} style={styles.guideImage} resizeMode="contain" />
                <View style={styles.guideCopy}>
                  <Text style={styles.guideName}>Evie</Text>
                  <Text style={styles.guideText}>Stats help you spot patterns, track growth, and adjust your habits with intention.</Text>
                </View>
              </View>

              <ChestCard accent="gold" icon="🧰" title="WEEKLY SUMMARY" subtitle="See your most important weekly trends." onPress={() => setActivePanel("weekly")} />
              <ChestCard accent="green" icon="🎒" title="RANK PROGRESS" subtitle="Track steps, level, and next rank." onPress={() => setActivePanel("rank")} />
              <ChestCard accent="purple" icon="📦" title="BEHAVIOR" subtitle="Review routines, sleep, and cognitive habits." onPress={() => setActivePanel("behavior")} />
            </ScrollView>

            <BottomNav router={router} />

            {activePanel ? (
              <View style={styles.modalOverlay}>
                <View style={styles.modalPanel}>
                  <TouchableOpacity style={styles.closeButton} onPress={() => setActivePanel(null)}>
                    <Text style={styles.closeButtonText}>×</Text>
                  </TouchableOpacity>
                  <ScrollView contentContainerStyle={styles.modalContent}>
                    {activePanel === "weekly" ? <WeeklyPanel computed={computed} smallWin={smallWin} /> : null}
                    {activePanel === "rank" ? <RankPanel computed={computed} /> : null}
                    {activePanel === "behavior" ? <BehaviorPanel computed={computed} /> : null}
                    <TouchableOpacity style={styles.returnButton} onPress={() => setActivePanel(null)}>
                      <Text style={styles.returnButtonText}>RETURN</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </View>
            ) : null}
          </View>
        </ImageBackground>
      </View>
    </View>
  );
}

function ChestCard({ accent, icon, title, subtitle, onPress }: { accent: "gold" | "green" | "purple"; icon: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chestCard, styles[`${accent}Chest`]]} onPress={onPress} activeOpacity={0.82}>
      <View style={[styles.chestIconWrap, styles[`${accent}Glow`]]}><Text style={styles.chestIcon}>{icon}</Text></View>
      <View style={styles.chestCopy}>
        <Text style={styles.chestTitle}>{title}</Text>
        <Text style={[styles.chestSubtitle, styles[`${accent}Text`]]}>{subtitle}</Text>
      </View>
      <Text style={[styles.openCue, styles[`${accent}Text`]]}>›</Text>
    </TouchableOpacity>
  );
}

function StatCard({ label, value, accent = "#FBBF24" }: { label: string; value: string | number; accent?: string }) {
  return <View style={styles.statCard}><Text style={[styles.statValue, { color: accent }]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function WeeklyPanel({ computed, smallWin }: { computed: ComputedStats; smallWin: string }) {
  return (
    <>
      <Text style={styles.modalTitle}>WEEKLY SUMMARY</Text>
      <Text style={styles.modalSubtitle}>{weekRange()}</Text>
      <View style={styles.featureCard}>
        <View><Text style={styles.cardKicker}>LATEST CHECK-IN</Text><Text style={styles.bigNumber}>{computed.latestEnergy !== null ? `${computed.latestEnergy}/100` : "—/100"}</Text></View>
        <View style={styles.featureDivider} />
        <View><Text style={styles.cardKicker}>MODE</Text><Text style={computed.latestMode === "Recovery" ? styles.recoveryMode : styles.progressMode}>{formatValue(computed.latestMode)}</Text><Text style={styles.detailText}>Sleep: {formatValue(computed.latestSleep)} • Mood: {formatValue(computed.latestMood)} • Stress: {formatValue(computed.latestStress)}</Text></View>
      </View>
      <View style={styles.statsGrid}>
        <StatCard label="Quests Completed" value={computed.questsCompleted} />
        <StatCard label="Saved Thoughts" value={computed.quickThoughtCount} accent="#C084FC" />
        <StatCard label="Avg Energy" value={computed.averageEnergy ?? "—"} accent="#67E8F9" />
        <StatCard label="Progress Days" value={computed.progressDays} accent="#6EE7B7" />
        <StatCard label="Recovery Days" value={computed.recoveryDays} accent="#C084FC" />
        <StatCard label="Check-ins Logged" value={computed.checkInCount} />
        <StatCard label="Pre-sleep Intentions" value={computed.preSleepCount} accent="#A78BFA" />
        <StatCard label="Morning Reflections" value={computed.morningCount} accent="#FDE68A" />
        <StatCard label="Journal Entries" value={computed.journalCount} />
        <StatCard label="Dream Journal" value={computed.dreamJournalCount} accent="#93C5FD" />
        <StatCard label="Meditations" value={computed.meditationCount} accent="#C084FC" />
        <StatCard label="Reflections" value={computed.reflectionCount} accent="#86EFAC" />
      </View>
      <View style={styles.smallWinCard}><Text style={styles.smallWinTitle}>SMALL WIN</Text><Text style={styles.smallWinText}>{smallWin}</Text></View>
      <LunaNote text="You do not need a perfect week to learn something useful." />
    </>
  );
}

function RankPanel({ computed }: { computed: ComputedStats }) {
  return (
    <>
      <Text style={styles.modalTitle}>RANK PROGRESS</Text>
      <View style={styles.rankDuelCard}>
        <View style={styles.rankBlock}><Text style={styles.cardKicker}>CURRENT RANK</Text><Text style={styles.rankBadge}>🛡️</Text><Text style={styles.rankName}>{rankName(computed.currentLevel)}</Text><Text style={styles.levelText}>Level {computed.currentLevel}</Text></View>
        <Text style={styles.rankArrow}>»</Text>
        <View style={styles.rankBlock}><Text style={styles.cardKicker}>NEXT RANK</Text><Text style={styles.rankBadge}>💎</Text><Text style={styles.rankName}>{rankName(computed.currentLevel + 1)}</Text><Text style={styles.levelText}>Level {computed.currentLevel + 1}</Text></View>
      </View>
      <View style={styles.progressCard}><Text style={styles.cardKicker}>TOTAL STEPS</Text><Text style={styles.progressTotal}>{computed.totalSteps} / {computed.nextRankAt}</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${computed.percentToNextRank}%` }]} /></View><Text style={styles.progressCaption}>{computed.percentToNextRank}% to next rank • {computed.rankSize - computed.stepsIntoRank} steps remain</Text></View>
      <View style={styles.statsGrid}><StatCard label="Steps Gained This Week" value={computed.totalSteps} accent="#67E8F9" /><StatCard label="Quests This Week" value={computed.questsCompleted} accent="#C084FC" /><StatCard label="Consistency" value={`${computed.checkInCount} logs`} accent="#FBBF24" /><StatCard label="Next Unlock" value={rankName(computed.currentLevel + 1)} accent="#86EFAC" /></View>
      <View style={styles.smallWinCard}><Text style={styles.smallWinTitle}>NEXT UNLOCK PREVIEW</Text><Text style={styles.smallWinText}>Reach {computed.nextRankAt} total steps to open the {rankName(computed.currentLevel + 1)} tier.</Text></View>
      <LunaNote text="Progress builds quietly. Every step still counts." />
    </>
  );
}

function BehaviorPanel({ computed }: { computed: ComputedStats }) {
  const totalModeDays = computed.progressDays + computed.recoveryDays;
  const progressPercent = totalModeDays > 0 ? Math.round((computed.progressDays / totalModeDays) * 100) : 0;
  const recoveryPercent = totalModeDays > 0 ? 100 - progressPercent : 0;
  return (
    <>
      <Text style={styles.modalTitle}>BEHAVIOR</Text>
      <Text style={styles.modalSubtitle}>Patterns are information, not judgment.</Text>
      <View style={styles.balanceCard}><Text style={styles.cardKicker}>PROGRESS VS RECOVERY BALANCE</Text><View style={styles.balanceRow}><Text style={styles.progressMode}>{progressPercent}% Progress</Text><Text style={styles.recoveryMode}>{recoveryPercent}% Recovery</Text></View><View style={styles.progressTrack}><View style={[styles.progressFillGreen, { width: `${progressPercent}%` }]} /><View style={[styles.progressFillPurple, { width: `${recoveryPercent}%` }]} /></View></View>
      <View style={styles.statsGrid}><StatCard label="Progress Days" value={computed.progressDays} accent="#86EFAC" /><StatCard label="Recovery Days" value={computed.recoveryDays} accent="#C084FC" /><StatCard label="Average Wake Time" value={computed.averageWakeTime ?? "Not enough data yet"} accent="#FDE68A" /><StatCard label="Average Sleep Time" value={computed.averageSleepTime ?? "No sleep pattern yet"} accent="#93C5FD" /></View>
      <Text style={styles.sectionTitle}>COGNITIVE MARKERS</Text>
      <View style={styles.statsGrid}><StatCard label="Dream Journal Entries" value={computed.dreamJournalCount} accent="#93C5FD" /><StatCard label="Meditations" value={computed.meditationCount} accent="#C084FC" /><StatCard label="Reflections" value={computed.reflectionCount} accent="#86EFAC" /><StatCard label="Morning Reflections" value={computed.morningCount} accent="#FDE68A" /><StatCard label="Quick Thoughts" value={computed.quickThoughtCount} accent="#F472B6" /><StatCard label="Pre-sleep Intentions" value={computed.preSleepCount} accent="#A78BFA" /></View>
      <LunaNote text="Patterns are information, not judgment. Use them to choose your next honest step." />
    </>
  );
}

type ComputedStats = { latest: CheckIn | null; latestEnergy: number | null; latestMode: string; latestSleep: unknown; latestMood: unknown; latestStress: unknown; questsCompleted: number; quickThoughtCount: number; journalCount: number; dreamJournalCount: number; preSleepCount: number; morningCount: number; meditationCount: number; reflectionCount: number; averageEnergy: number | null; progressDays: number; recoveryDays: number; checkInCount: number; averageWakeTime: string | null; averageSleepTime: string | null; rankSize: number; totalSteps: number; currentLevel: number; stepsIntoRank: number; percentToNextRank: number; nextRankAt: number; };

function LunaNote({ text }: { text: string }) {
  return <View style={styles.lunaNote}><Image source={uiAssets.guides.luna} style={styles.lunaImage} resizeMode="contain" /><View style={styles.lunaCopy}><Text style={styles.lunaName}>Luna</Text><Text style={styles.lunaText}>{text}</Text></View></View>;
}

function BottomNav({ router }: { router: ReturnType<typeof useRouter> }) {
  return <View style={styles.bottomNav}><TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}><Text style={styles.navIcon}>🏠</Text><Text style={styles.navLabel}>HOME</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/sleep")}><Text style={styles.navIcon}>🌙</Text><Text style={styles.navLabel}>SLEEP</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/mind")}><Text style={styles.navIcon}>🧠</Text><Text style={styles.navLabel}>MIND</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/path")}><Text style={styles.navIcon}>🌲</Text><Text style={styles.navLabel}>PATH</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/calendar")}><Text style={styles.navIcon}>📅</Text><Text style={styles.navLabel}>CAL</Text></TouchableOpacity><TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={() => router.push("/stats")}><Text style={styles.navIcon}>🎒</Text><Text style={[styles.navLabel, styles.navLabelActive]}>BAG</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#02040A", alignItems: "center", justifyContent: "center" },
  phoneStage: { width: "100%", maxWidth: 520, flex: 1, alignSelf: "center", backgroundColor: "#050814", overflow: "hidden" },
  backgroundLayer: { flex: 1 },
  backgroundImage: { width: "100%", height: "100%" },
  worldOverlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.72)" },
  screenScroller: { flex: 1 },
  hudContent: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100 },
  heroPanel: { backgroundColor: "rgba(8, 17, 34, 0.9)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 20, padding: 16, marginBottom: 12 },
  heroLabel: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  heroTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 38, fontWeight: "900", letterSpacing: 3, marginTop: 4 },
  heroSubtitle: { color: "#CBD5E1", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  guideCard: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(8, 17, 34, 0.88)", borderWidth: 2, borderColor: "#38506F", borderRadius: 18, padding: 12, marginBottom: 14 },
  guideImage: { width: 82, height: 82, marginRight: 12 },
  guideCopy: { flex: 1 },
  guideName: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 18, fontWeight: "900", marginBottom: 4 },
  guideText: { color: "#F8FAFC", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  chestCard: { minHeight: 112, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(6, 15, 30, 0.94)", borderWidth: 3, borderRadius: 18, padding: 12, marginBottom: 12 },
  goldChest: { borderColor: "#FBBF24" }, greenChest: { borderColor: "#65A30D" }, purpleChest: { borderColor: "#A855F7" },
  chestIconWrap: { width: 80, height: 80, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 14 },
  goldGlow: { backgroundColor: "rgba(251,191,36,0.16)" }, greenGlow: { backgroundColor: "rgba(34,197,94,0.16)" }, purpleGlow: { backgroundColor: "rgba(168,85,247,0.16)" },
  chestIcon: { fontSize: 42 }, chestCopy: { flex: 1 },
  chestTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 23, fontWeight: "900", letterSpacing: 1 },
  chestSubtitle: { fontFamily: pixelFont, fontSize: 13, fontWeight: "900", lineHeight: 19, marginTop: 6 },
  goldText: { color: "#FBBF24" }, greenText: { color: "#86EFAC" }, purpleText: { color: "#C084FC" },
  openCue: { fontSize: 42, fontWeight: "900", marginLeft: 8 },
  bottomNav: { position: "absolute", bottom: 8, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(8,17,34,0.96)", borderWidth: 2, borderColor: "#334155", borderRadius: 16, padding: 6 },
  navButton: { flex: 1, alignItems: "center", borderRadius: 12, paddingVertical: 6, borderWidth: 1, borderColor: "transparent" },
  navButtonActive: { backgroundColor: "rgba(120, 53, 15, 0.55)", borderColor: "#FBBF24" },
  navIcon: { fontSize: 20 }, navLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginTop: 2 }, navLabelActive: { color: "#FBBF24" },
  modalOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 14, paddingVertical: 42, justifyContent: "center" },
  modalPanel: { maxHeight: "92%", backgroundColor: "rgba(8,17,34,0.98)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 22, overflow: "hidden" },
  modalContent: { padding: 16, paddingTop: 28 },
  closeButton: { position: "absolute", top: 8, right: 10, zIndex: 2, width: 34, height: 34, borderRadius: 8, borderWidth: 2, borderColor: "#FBBF24", alignItems: "center", justifyContent: "center" },
  closeButtonText: { color: "#FBBF24", fontSize: 28, lineHeight: 30, fontWeight: "900" },
  modalTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 30, fontWeight: "900", textAlign: "center", letterSpacing: 2 },
  modalSubtitle: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 14, fontWeight: "800" },
  featureCard: { flexDirection: "row", backgroundColor: "#071326", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 14, padding: 14, marginVertical: 14 },
  featureDivider: { width: 1, backgroundColor: "#475569", marginHorizontal: 14 },
  cardKicker: { color: "#E5E7EB", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  bigNumber: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 34, fontWeight: "900" },
  progressMode: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" }, recoveryMode: { color: "#C084FC", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" },
  detailText: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, marginTop: 6 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  statCard: { width: "48%", backgroundColor: "rgba(15, 23, 42, 0.95)", borderWidth: 2, borderColor: "#334155", borderRadius: 14, padding: 12, marginBottom: 10, minHeight: 86, justifyContent: "center" },
  statValue: { fontFamily: pixelFont, fontSize: 24, fontWeight: "900", textAlign: "center" }, statLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", textAlign: "center", marginTop: 6, lineHeight: 14 },
  smallWinCard: { borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69, 43, 8, 0.35)", borderRadius: 14, padding: 12, marginTop: 4, marginBottom: 12 },
  smallWinTitle: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginBottom: 6 }, smallWinText: { color: "#F8FAFC", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  lunaNote: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: "#A78BFA", backgroundColor: "rgba(49, 46, 129, 0.38)", borderRadius: 14, padding: 10, marginBottom: 12 },
  lunaImage: { width: 58, height: 58, marginRight: 10 }, lunaCopy: { flex: 1 }, lunaName: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" }, lunaText: { color: "#F8FAFC", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  returnButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 2 }, returnButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  rankDuelCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 2, borderColor: "#334155", backgroundColor: "#071326", borderRadius: 14, padding: 12, marginVertical: 14 },
  rankBlock: { flex: 1, alignItems: "center" }, rankBadge: { fontSize: 34 }, rankName: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 18, fontWeight: "900", textAlign: "center" }, levelText: { color: "#67E8F9", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", marginTop: 4 }, rankArrow: { color: "#FBBF24", fontSize: 30, fontWeight: "900", marginHorizontal: 8 },
  progressCard: { borderWidth: 2, borderColor: "#334155", backgroundColor: "#071326", borderRadius: 14, padding: 14, marginBottom: 12 }, progressTotal: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 28, fontWeight: "900", textAlign: "center" },
  progressTrack: { height: 16, borderRadius: 8, borderWidth: 1, borderColor: "#FBBF24", backgroundColor: "#0F172A", flexDirection: "row", overflow: "hidden", marginTop: 12 }, progressFill: { height: "100%", backgroundColor: "#FBBF24" }, progressFillGreen: { height: "100%", backgroundColor: "#22C55E" }, progressFillPurple: { height: "100%", backgroundColor: "#A855F7" }, progressCaption: { color: "#67E8F9", textAlign: "center", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginTop: 8 },
  balanceCard: { borderWidth: 2, borderColor: "#334155", backgroundColor: "#071326", borderRadius: 14, padding: 14, marginVertical: 14 }, balanceRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 }, sectionTitle: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", marginTop: 6, marginBottom: 10, letterSpacing: 1 },
});