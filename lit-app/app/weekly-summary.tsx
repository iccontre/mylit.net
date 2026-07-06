import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, ImageBackground, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { WeeklyAgentReviewCard } from "../components/WeeklyAgentReviewCard";

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
};

type WeeklySnapshot = {
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
  totalSteps: number;
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
const USER_STATS_KEY = "lit_user_stats";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}

function countAny(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length;
  if (typeof value === "string") return value.trim() ? 1 : 0;
  return 0;
}

function getNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function average(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  return Math.round(numbers.reduce((t, n) => t + n, 0) / numbers.length);
}

function formatValue(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function weekRange(): string {
  const today = new Date(); const day = today.getDay();
  const monday = new Date(today); monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

const emptySnapshot: WeeklySnapshot = {
  latestCheckIn: null, checkIns: [], completedQuests: [], quickThoughts: [],
  journalEntries: [], dreamJournalEntries: [], preSleepIntentions: [],
  morningReflections: [], alternateMorningReflections: [], meditations: [], reflections: [], totalSteps: 0,
};

export default function WeeklySummaryScreen() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<WeeklySnapshot>(emptySnapshot);

  useEffect(() => { loadWeeklyData(); }, []);

  async function loadWeeklyData() {
    const [latestCheckIn, checkIns, completedQuests, quickThoughts, journalEntries, dreamJournalEntries,
      preSleepIntentions, morningReflections, alternateMorningReflections, meditations, reflections, userStats] = await Promise.all([
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
      readJson<Record<string, unknown>>(USER_STATS_KEY, {}),
    ]);
    const rawSteps = userStats.totalSteps ?? userStats.baseSteps ?? userStats.completedSteps ?? 0;
    const totalSteps = Number.isFinite(Number(rawSteps)) && Number(rawSteps) >= 0 ? Number(rawSteps) : 0;
    setSnapshot({ latestCheckIn, checkIns: Array.isArray(checkIns) ? checkIns : [], completedQuests, quickThoughts, journalEntries, dreamJournalEntries, preSleepIntentions, morningReflections, alternateMorningReflections, meditations, reflections, totalSteps });
  }

  const computed = useMemo(() => {
    const latest = snapshot.latestCheckIn ?? snapshot.checkIns[snapshot.checkIns.length - 1] ?? null;
    const energies = snapshot.checkIns.map((c: CheckIn) => getNumber(c.energy)).filter((v): v is number => v !== null);
    const progressDays = snapshot.checkIns.filter((c: CheckIn) => c.mode === "Progress").length;
    const recoveryDays = snapshot.checkIns.filter((c: CheckIn) => c.mode === "Recovery").length;
    const completedQuickThoughts = Array.isArray(snapshot.quickThoughts) ? snapshot.quickThoughts.filter((i: unknown) => Boolean((i as Record<string, unknown>).completedAt)).length : 0;
    return {
      latestEnergy: getNumber(latest?.energy), latestMode: latest?.mode ?? "Not logged yet",
      latestSleep: latest?.sleep ?? latest?.hours, latestMood: latest?.mood, latestStress: latest?.stress,
      questsCompleted: countAny(snapshot.completedQuests), quickThoughtCount: countAny(snapshot.quickThoughts),
      completedQuickThoughts, averageEnergy: average(energies), progressDays, recoveryDays,
      preSleepCount: countAny(snapshot.preSleepIntentions), dreamJournalCount: countAny(snapshot.dreamJournalEntries),
      meditationCount: countAny(snapshot.meditations), reflectionCount: countAny(snapshot.reflections),
      morningCount: countAny(snapshot.morningReflections) + countAny(snapshot.alternateMorningReflections),
      journalCount: countAny(snapshot.journalEntries), totalSteps: snapshot.totalSteps,
    };
  }, [snapshot]);

  const smallWin = computed.completedQuickThoughts > 0
    ? "You completed a scheduled quest this week."
    : computed.questsCompleted > 0 ? "You finished at least one quest. That's a real step forward."
    : computed.progressDays + computed.recoveryDays > 0 ? "You checked in this week. That gives you real data to work with."
    : "Starting with one honest check-in is enough.";

  return (
    <View style={styles.pageRoot}>
      <View style={styles.phoneStage}>
        <ImageBackground source={uiAssets.backgrounds.default} style={styles.backgroundLayer} imageStyle={styles.backgroundImage}>
          <View style={styles.overlay}>
            <ScrollView style={styles.scroller} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} bounces={false}>

              <View style={styles.heroPanel}>
                <View style={styles.bannerIconWrap}><Text style={styles.bannerIconText}>🎒</Text></View>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroLabel}>STATS BOARD</Text>
                  <Text style={styles.heroTitle}>WEEKLY SUMMARY</Text>
                  <Text style={styles.heroSubtitle}>{weekRange()} · Review your week honestly.</Text>
                </View>
              </View>

              <View style={styles.evieCard}>
                <Image source={uiAssets.guides.evie} style={styles.evieImage} resizeMode="contain" />
                <View style={styles.evieCopy}>
                  <Text style={styles.evieName}>EVIE</Text>
                  <Text style={styles.evieText}>You do not need a perfect week to learn something useful.</Text>
                </View>
              </View>

              <WeeklyAgentReviewCard />

              <View style={styles.stepsCard}>
                <Text style={styles.cardKicker}>TOTAL STEPS</Text>
                <Text style={styles.stepsNumber}>{computed.totalSteps}</Text>
                <Text style={styles.stepsCaption}>All time — from quests, habits & saved thoughts</Text>
              </View>

              <View style={styles.latestCard}>
                <View style={styles.latestHalf}>
                  <Text style={styles.cardKicker}>ENERGY</Text>
                  <Text style={styles.bigNumber}>{computed.latestEnergy !== null ? `${computed.latestEnergy}` : "—"}</Text>
                  <Text style={styles.bigUnit}>/100</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.latestHalf}>
                  <Text style={styles.cardKicker}>MODE</Text>
                  <Text style={computed.latestMode === "Recovery" ? styles.recoveryMode : styles.progressMode}>{formatValue(computed.latestMode)}</Text>
                  <Text style={styles.detailText}>Sleep: {formatValue(computed.latestSleep)} · Mood: {formatValue(computed.latestMood)}</Text>
                </View>
              </View>

              <View style={styles.grid}>
                <StatCard label="Quests Completed" value={computed.questsCompleted} />
                <StatCard label="Scheduled Quests Done" value={computed.completedQuickThoughts} accent="#C084FC" />
                <StatCard label="Progress Days" value={computed.progressDays} accent="#86EFAC" />
                <StatCard label="Recovery Days" value={computed.recoveryDays} accent="#C084FC" />
                <StatCard label="Avg Energy" value={computed.averageEnergy ?? "—"} accent="#67E8F9" />
                <StatCard label="Pre-sleep Intentions" value={computed.preSleepCount} accent="#A78BFA" />
              </View>

              <Text style={styles.sectionTitle}>COGNITIVE MARKERS</Text>
              <View style={styles.grid}>
                <StatCard label="Dream Journal" value={computed.dreamJournalCount} accent="#93C5FD" />
                <StatCard label="Meditations" value={computed.meditationCount} accent="#C084FC" />
                <StatCard label="Reflections" value={computed.reflectionCount} accent="#86EFAC" />
                <StatCard label="Morning Reflections" value={computed.morningCount} accent="#FDE68A" />
                <StatCard label="Journal Entries" value={computed.journalCount} />
                <StatCard label="Quests Saved" value={computed.quickThoughtCount} accent="#F472B6" />
              </View>

              <View style={styles.smallWinCard}>
                <Text style={styles.smallWinTitle}>SMALL WIN</Text>
                <Text style={styles.smallWinText}>{smallWin}</Text>
              </View>

              <TouchableOpacity style={styles.returnButton} onPress={() => router.push("/stats")}>
                <Text style={styles.returnButtonText}>VIEW FULL STATS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/")}>
                <Text style={styles.homeButtonText}>BACK TO HOME</Text>
              </TouchableOpacity>

            </ScrollView>
            <BottomNav router={router} />
          </View>
        </ImageBackground>
      </View>
    </View>
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

function BottomNav({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={styles.bottomNav}>
      <TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}><Text style={styles.navIcon}>🏠</Text><Text style={styles.navLabel}>HOME</Text></TouchableOpacity>
      <TouchableOpacity style={styles.navButton} onPress={() => router.push("/sleep")}><Text style={styles.navIcon}>🌙</Text><Text style={styles.navLabel}>SLEEP</Text></TouchableOpacity>
      <TouchableOpacity style={styles.navButton} onPress={() => router.push("/mind")}><Text style={styles.navIcon}>🧠</Text><Text style={styles.navLabel}>MIND</Text></TouchableOpacity>
      <TouchableOpacity style={styles.navButton} onPress={() => router.push("/path")}><Text style={styles.navIcon}>🌲</Text><Text style={styles.navLabel}>PATH</Text></TouchableOpacity>
      <TouchableOpacity style={styles.navButton} onPress={() => router.push("/calendar")}><Text style={styles.navIcon}>📅</Text><Text style={styles.navLabel}>CAL</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={() => router.push("/stats")}><Text style={styles.navIcon}>🎒</Text><Text style={[styles.navLabel, styles.navLabelActive]}>BAG</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#02040A", alignItems: "center", justifyContent: "center" },
  phoneStage: { width: "100%", maxWidth: 520, flex: 1, alignSelf: "center", backgroundColor: "#050814", overflow: "hidden", position: "relative" },
  backgroundLayer: { flex: 1 },
  backgroundImage: { width: "100%", height: "100%" },
  overlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.72)" },
  scroller: { flex: 1 },
  content: { paddingTop: 18, paddingHorizontal: 14, paddingBottom: 90 },
  heroPanel: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(5,12,24,0.94)", borderWidth: 3, borderColor: "#D99B2B", borderRadius: 8, padding: 12, marginBottom: 10 },
  bannerIconWrap: { width: 46, height: 66, backgroundColor: "rgba(70,28,112,0.86)", borderWidth: 2, borderColor: "#FDE047", alignItems: "center", justifyContent: "center", marginRight: 12, borderRadius: 4 },
  bannerIconText: { fontSize: 26 },
  heroCopy: { flex: 1 },
  heroLabel: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 22, fontWeight: "900", letterSpacing: 2, marginTop: 2, textAlign: "center" },
  heroSubtitle: { color: "#F8E7A1", fontSize: 12, fontWeight: "800", lineHeight: 17, marginTop: 2 },
  evieCard: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(8,13,24,0.95)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, padding: 10, marginBottom: 10 },
  evieImage: { width: 50, height: 58, marginRight: 10 },
  evieCopy: { flex: 1 },
  evieName: { color: "#FDE047", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  evieText: { color: "#CBD5E1", fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  stepsCard: { backgroundColor: "rgba(5,12,24,0.96)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 8, padding: 14, marginBottom: 10, alignItems: "center" },
  stepsNumber: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 44, fontWeight: "900", marginTop: 4 },
  stepsCaption: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginTop: 4, textAlign: "center" },
  latestCard: { flexDirection: "row", backgroundColor: "rgba(7,19,38,0.96)", borderWidth: 2, borderColor: "#334155", borderRadius: 8, padding: 12, marginBottom: 10 },
  latestHalf: { flex: 1 },
  divider: { width: 1, backgroundColor: "#475569", marginHorizontal: 10 },
  cardKicker: { color: "#E5E7EB", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, marginBottom: 4 },
  bigNumber: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 28, fontWeight: "900" },
  bigUnit: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  progressMode: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 15, fontWeight: "900" },
  recoveryMode: { color: "#C084FC", fontFamily: pixelFont, fontSize: 15, fontWeight: "900" },
  detailText: { color: "#CBD5E1", fontSize: 11, lineHeight: 15, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 4 },
  statCard: { width: "48%", backgroundColor: "rgba(15,23,42,0.96)", borderWidth: 2, borderColor: "#334155", borderRadius: 8, padding: 10, marginBottom: 8, minHeight: 68, justifyContent: "center" },
  statValue: { fontFamily: pixelFont, fontSize: 20, fontWeight: "900", textAlign: "center" },
  statLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", textAlign: "center", marginTop: 4, lineHeight: 12 },
  sectionTitle: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginBottom: 8, letterSpacing: 1 },
  smallWinCard: { borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.35)", borderRadius: 8, padding: 10, marginBottom: 10 },
  smallWinTitle: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginBottom: 4 },
  smallWinText: { color: "#F8FAFC", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  returnButton: { backgroundColor: "#1C3A5E", borderWidth: 2, borderColor: "#60A5FA", borderRadius: 6, paddingVertical: 11, alignItems: "center", marginBottom: 8 },
  returnButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  homeButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", borderRadius: 6, paddingVertical: 11, alignItems: "center" },
  homeButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  bottomNav: { position: "absolute", bottom: 8, left: 8, right: 8, height: 62, flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(4,8,16,0.98)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 5, padding: 4 },
  navButton: { flex: 1, backgroundColor: "#111827", borderWidth: 2, borderColor: "#3A4558", borderRadius: 3, paddingVertical: 4, marginHorizontal: 2, alignItems: "center", justifyContent: "center" },
  navButtonActive: { backgroundColor: "#162314", borderColor: "#FBBF24" },
  navIcon: { fontSize: 18 },
  navLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 1 },
  navLabelActive: { color: "#FDE68A" },
});
