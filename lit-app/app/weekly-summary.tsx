import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, ImageBackground, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";

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

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

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

function getNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function average(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  return Math.round(numbers.reduce((total, item) => total + item, 0) / numbers.length);
}

function formatValue(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
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

const emptySnapshot: WeeklySnapshot = {
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
};

export default function WeeklySummaryScreen() {
  const [snapshot, setSnapshot] = useState<WeeklySnapshot>(emptySnapshot);

  useEffect(() => {
    loadWeeklyData();
  }, []);

  async function loadWeeklyData() {
    const [latestCheckIn, checkIns, completedQuests, quickThoughts, journalEntries, dreamJournalEntries, preSleepIntentions, morningReflections, alternateMorningReflections, meditations, reflections] = await Promise.all([
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
    ]);

    setSnapshot({ latestCheckIn, checkIns: Array.isArray(checkIns) ? checkIns : [], completedQuests, quickThoughts, journalEntries, dreamJournalEntries, preSleepIntentions, morningReflections, alternateMorningReflections, meditations, reflections });
  }

  const computed = useMemo(() => {
    const latest = snapshot.latestCheckIn ?? snapshot.checkIns[snapshot.checkIns.length - 1] ?? null;
    const energies = snapshot.checkIns.map((checkIn: CheckIn) => getNumber(checkIn.energy)).filter((value: number | null): value is number => value !== null);
    const progressDays = snapshot.checkIns.filter((checkIn: CheckIn) => checkIn.mode === "Progress").length;
    const recoveryDays = snapshot.checkIns.filter((checkIn: CheckIn) => checkIn.mode === "Recovery").length;
    return {
      latestEnergy: getNumber(latest?.energy),
      latestMode: latest?.mode ?? "Not logged yet",
      latestSleep: latest?.sleep ?? latest?.hours,
      latestMood: latest?.mood,
      latestStress: latest?.stress,
      questsCompleted: countAny(snapshot.completedQuests),
      quickThoughts: countAny(snapshot.quickThoughts),
      averageEnergy: average(energies),
      progressDays,
      recoveryDays,
      preSleepIntentions: countAny(snapshot.preSleepIntentions),
      dreamJournalEntries: countAny(snapshot.dreamJournalEntries),
      meditations: countAny(snapshot.meditations),
      reflections: countAny(snapshot.reflections),
      morningReflections: countAny(snapshot.morningReflections) + countAny(snapshot.alternateMorningReflections),
      journalEntries: countAny(snapshot.journalEntries),
    };
  }, [snapshot]);

  const smallWin = computed.quickThoughts > 0
    ? "You saved quick thoughts instead of letting them disappear."
    : computed.progressDays + computed.recoveryDays > 0
    ? "You checked in this week. That gives you real data to work with."
    : "Starting with one honest check-in is enough.";

  return (
    <View style={styles.pageRoot}>
      <ImageBackground source={uiAssets.backgrounds.default} style={styles.backgroundLayer} imageStyle={styles.backgroundImage}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.heroPanel}>
              <Text style={styles.heroLabel}>STATS BOARD</Text>
              <Text style={styles.title}>WEEKLY SUMMARY</Text>
              <Text style={styles.subtitle}>{weekRange()} • Review the week. Reflect, don’t judge.</Text>
            </View>

            <View style={styles.lunaCard}>
              <Image source={uiAssets.guides.luna} style={styles.lunaImage} resizeMode="contain" />
              <View style={styles.lunaCopy}>
                <Text style={styles.lunaName}>Luna</Text>
                <Text style={styles.lunaText}>You do not need a perfect week to learn something useful.</Text>
              </View>
            </View>

            <View style={styles.latestCard}>
              <View style={styles.latestColumn}>
                <Text style={styles.cardKicker}>LATEST CHECK-IN</Text>
                <Text style={styles.bigNumber}>{computed.latestEnergy !== null ? `${computed.latestEnergy}/100` : "—/100"}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.latestColumn}>
                <Text style={styles.cardKicker}>LATEST MODE</Text>
                <Text style={computed.latestMode === "Recovery" ? styles.recoveryMode : styles.progressMode}>{formatValue(computed.latestMode)}</Text>
                <Text style={styles.detailText}>Sleep: {formatValue(computed.latestSleep)} • Mood: {formatValue(computed.latestMood)} • Stress: {formatValue(computed.latestStress)}</Text>
              </View>
            </View>

            <View style={styles.grid}>
              <StatCard label="Quests Completed" value={computed.questsCompleted} />
              <StatCard label="Saved Quick Thoughts" value={computed.quickThoughts} accent="#C084FC" />
              <StatCard label="Progress Days" value={computed.progressDays} accent="#86EFAC" />
              <StatCard label="Recovery Days" value={computed.recoveryDays} accent="#C084FC" />
              <StatCard label="Average Energy" value={computed.averageEnergy ?? "—"} accent="#67E8F9" />
              <StatCard label="Pre-sleep Intentions" value={computed.preSleepIntentions} accent="#A78BFA" />
            </View>

            <View style={styles.markerPanel}>
              <Text style={styles.sectionTitle}>COGNITIVE MARKERS</Text>
              <View style={styles.grid}>
                <StatCard label="Dream Journal" value={computed.dreamJournalEntries} accent="#93C5FD" />
                <StatCard label="Meditations" value={computed.meditations} accent="#C084FC" />
                <StatCard label="Reflections" value={computed.reflections} accent="#86EFAC" />
                <StatCard label="Morning Reflections" value={computed.morningReflections} accent="#FDE68A" />
                <StatCard label="Journal Entries" value={computed.journalEntries} />
                <StatCard label="Quick Thoughts" value={computed.quickThoughts} accent="#F472B6" />
              </View>
            </View>

            <View style={styles.smallWinCard}>
              <Text style={styles.smallWinTitle}>SMALL WIN</Text>
              <Text style={styles.smallWinText}>{smallWin}</Text>
            </View>

            <Link href="/" asChild>
              <TouchableOpacity style={styles.homeButton}>
                <Text style={styles.homeButtonText}>Back to Today</Text>
              </TouchableOpacity>
            </Link>
          </ScrollView>
        </View>
      </ImageBackground>
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

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#02040A" },
  backgroundLayer: { flex: 1 },
  backgroundImage: { width: "100%", height: "100%" },
  overlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.74)" },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },
  heroPanel: { backgroundColor: "rgba(8, 17, 34, 0.9)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 20, padding: 16, marginBottom: 12 },
  heroLabel: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 31, fontWeight: "900", letterSpacing: 2, marginTop: 4 },
  subtitle: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 13, lineHeight: 20, fontWeight: "800", marginTop: 6 },
  lunaCard: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(49, 46, 129, 0.38)", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 18, padding: 12, marginBottom: 12 },
  lunaImage: { width: 72, height: 72, marginRight: 12 },
  lunaCopy: { flex: 1 },
  lunaName: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 18, fontWeight: "900", marginBottom: 4 },
  lunaText: { color: "#F8FAFC", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  latestCard: { flexDirection: "row", backgroundColor: "rgba(7, 19, 38, 0.96)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 16, padding: 14, marginBottom: 12 },
  latestColumn: { flex: 1 },
  divider: { width: 1, backgroundColor: "#475569", marginHorizontal: 12 },
  cardKicker: { color: "#E5E7EB", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  bigNumber: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 34, fontWeight: "900" },
  progressMode: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" },
  recoveryMode: { color: "#C084FC", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" },
  detailText: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, marginTop: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  statCard: { width: "48%", backgroundColor: "rgba(15, 23, 42, 0.95)", borderWidth: 2, borderColor: "#334155", borderRadius: 14, padding: 12, marginBottom: 10, minHeight: 86, justifyContent: "center" },
  statValue: { fontFamily: pixelFont, fontSize: 25, fontWeight: "900", textAlign: "center" },
  statLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", textAlign: "center", marginTop: 6, lineHeight: 14 },
  markerPanel: { backgroundColor: "rgba(8, 17, 34, 0.78)", borderWidth: 2, borderColor: "#334155", borderRadius: 18, padding: 12, marginBottom: 12 },
  sectionTitle: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", marginBottom: 10, letterSpacing: 1 },
  smallWinCard: { borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69, 43, 8, 0.35)", borderRadius: 14, padding: 14, marginBottom: 12 },
  smallWinTitle: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginBottom: 6 },
  smallWinText: { color: "#F8FAFC", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  homeButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 2 },
  homeButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
});