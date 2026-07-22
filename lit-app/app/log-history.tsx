import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomNav } from "../components/BottomNav";
import { FeedToGuideButton } from "../components/parchment/FeedToGuideButton";
import { WorldChrome } from "../components/parchment/WorldChrome";
import { FormScreen } from "../components/FormScreen";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { hubPalettes } from "../constants/worldTokens";
import { LOG_HISTORY_HEADING, uiAssets } from "../constants/uiAssets";
import type { GuideContextSourceType } from "../lib/agentTypes";
import { LOG_HISTORY_KEYS } from "../lib/storageKeys";

const palette = hubPalettes.mind;

// Read-only history view. It reads the same synced, array-merged keys the entry pages
// write to (see LOG_HISTORY_KEYS), so logs restore across devices after login. We never
// log the private journal/dream/reflection/meditation text to the console.

type LogType =
  | "journal"
  | "reflection"
  | "meditation"
  | "dream"
  | "pre_sleep_intention"
  | "affirmation"
  | "morning_reflection"
  | "sleep_checkin"
  | "food_log"
  | "quick_thought";

type LogEntry = {
  id: string;
  type: LogType;
  label: string;
  preview: string;
  body: string;
  meta?: string;
  when: string;
  sortAt: number;
};

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

/** Every Log History entry is a Mind/Sleep entry — Luna owns emotional/mental support and
 *  sleep/recovery, so these all offer "Feed to Luna" only (see components/FeedToGuideModal). */
const LOG_TYPE_TO_GUIDE_SOURCE: Record<LogType, GuideContextSourceType> = {
  journal: "journal",
  reflection: "reflection",
  meditation: "awarenessCheck",
  dream: "dream",
  pre_sleep_intention: "preSleepIntention",
  affirmation: "affirmation",
  morning_reflection: "morningIntentionReflection",
  sleep_checkin: "sleepCheckIn",
  food_log: "foodLog",
  quick_thought: "quickThought",
};

const SECTIONS: { type: LogType; title: string; icon: string }[] = [
  { type: "journal", title: "Journal", icon: "📓" },
  { type: "reflection", title: "Reflections", icon: "🔍" },
  { type: "meditation", title: "Meditations", icon: "🧘" },
  { type: "dream", title: "Dream Journal", icon: "🌙" },
  { type: "pre_sleep_intention", title: "Pre-Sleep Intentions", icon: "✨" },
  { type: "affirmation", title: "Affirmations", icon: "💫" },
  { type: "morning_reflection", title: "Morning Reflections", icon: "🌄" },
  { type: "sleep_checkin", title: "Sleep Check-Ins", icon: "🌤️" },
  { type: "food_log", title: "Food Log Notes", icon: "🍽️" },
  { type: "quick_thought", title: "Quick Thoughts", icon: "💭" },
];

/** Left-edge accent per entry type — pure presentation, not tied to any behavior. */
const SECTION_ACCENT: Record<LogType, string> = {
  journal: "#A78BFA",
  reflection: "#FBBF24",
  meditation: "#22C55E",
  dream: "#F472B6",
  pre_sleep_intention: "#A78BFA",
  affirmation: "#FDE68A",
  morning_reflection: "#FDBA74",
  sleep_checkin: "#7DD3FC",
  food_log: "#86EFAC",
  quick_thought: "#818CF8",
};

function readArray(raw: string | null): Record<string, unknown>[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function toSortMs(createdAt: unknown, id: unknown): number {
  const raw = str(createdAt);
  if (raw) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const idNum = Number(id);
  return Number.isFinite(idNum) ? idNum : 0;
}

function whenLabel(createdAt: unknown): string {
  const raw = str(createdAt);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  return raw; // already a locale string (e.g. journal/meditation entries)
}

function clip(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}…`;
}

function normalizeJournal(items: Record<string, unknown>[]): LogEntry[] {
  return items
    .map((it, index): LogEntry | null => {
      const content = str(it.content);
      const mood = str(it.mood);
      const type = str(it.type) || "Journal";
      if (!content && !mood) return null;
      return {
        id: `journal-${str(it.id) || index}`,
        type: "journal" as const,
        label: `${type} Journal`,
        preview: clip(content || `Mood ${mood}/10`),
        body: content,
        meta: mood ? `Mood: ${mood}/10` : undefined,
        when: whenLabel(it.createdAt),
        sortAt: toSortMs(it.createdAt, it.id),
      };
    })
    .filter((e): e is LogEntry => e !== null);
}

function normalizeReflection(items: Record<string, unknown>[]): LogEntry[] {
  return items.map((it, index): LogEntry => {
    const quest = str(it.quest);
    const gotInTheWay = str(it.whatGotInTheWay);
    const wasOff = str(it.whatWasOff);
    const smaller = str(it.smallerVersion);
    const parts: string[] = [];
    if (gotInTheWay) parts.push(`What got in the way: ${gotInTheWay}`);
    if (wasOff) parts.push(`Was the step too big: ${wasOff}`);
    if (smaller) parts.push(`Smaller next step: ${smaller}`);
    const body = parts.join("\n\n") || "Reflected on this quest.";
    return {
      id: `reflection-${str(it.id) || index}`,
      type: "reflection" as const,
      label: "Reflection",
      preview: clip(gotInTheWay || smaller || quest || "Reflection"),
      body,
      meta: quest ? `On: ${quest}` : undefined,
      when: whenLabel(it.createdAt),
      sortAt: toSortMs(it.createdAt, it.id),
    };
  });
}

function normalizeMeditation(items: Record<string, unknown>[]): LogEntry[] {
  return items
    .map((it, index): LogEntry | null => {
      const truth = str(it.truth);
      const mood = str(it.mood);
      // Fall back to the legacy multi-question layout so old entries still render.
      const legacy = [it.attentionFocus, it.automaticOrIntentional, it.pulledAway, it.broughtBack]
        .map(str)
        .filter(Boolean)
        .join("\n\n");
      const body = truth || legacy;
      if (!body && !mood) return null;
      return {
        id: `meditation-${str(it.id) || index}`,
        type: "meditation" as const,
        label: "Meditation",
        preview: clip(body || (mood ? `Mood: ${mood}` : "")),
        body,
        meta: mood ? `Mood: ${mood}` : undefined,
        when: whenLabel(it.createdAt),
        sortAt: toSortMs(it.createdAt, it.id),
      };
    })
    .filter((e): e is LogEntry => e !== null);
}

function normalizeDream(items: Record<string, unknown>[]): LogEntry[] {
  return items
    .map((it, index): LogEntry | null => {
      const title = str(it.title);
      const summary = str(it.summary);
      const feeling = str(it.feeling);
      if (!title && !summary) return null;
      return {
        id: `dream-${str(it.id) || index}`,
        type: "dream" as const,
        label: title || "Dream",
        preview: clip(summary || title),
        body: summary,
        meta: feeling || undefined,
        when: whenLabel(it.createdAt),
        sortAt: toSortMs(it.createdAt, it.id),
      };
    })
    .filter((e): e is LogEntry => e !== null);
}

function normalizePreSleep(items: Record<string, unknown>[]): LogEntry[] {
  return items
    .map((it, index): LogEntry | null => {
      const intention = str(it.intention);
      if (!intention) return null;
      const feeling = str(it.feeling);
      const support = Array.isArray(it.support) ? (it.support as unknown[]).map(str).filter(Boolean) : [];
      const metaParts = [feeling, support.join(", ")].filter(Boolean);
      return {
        id: `pre_sleep-${str(it.id) || index}`,
        type: "pre_sleep_intention" as const,
        label: "Pre-Sleep Intention",
        preview: clip(intention),
        body: intention,
        meta: metaParts.length ? metaParts.join(" · ") : undefined,
        when: whenLabel(it.createdAt),
        sortAt: toSortMs(it.createdAt, it.id),
      };
    })
    .filter((e): e is LogEntry => e !== null);
}

function normalizeAffirmation(items: Record<string, unknown>[]): LogEntry[] {
  return items
    .map((it, index): LogEntry | null => {
      const text = str(it.text);
      if (!text) return null;
      return {
        id: `affirmation-${str(it.id) || index}`,
        type: "affirmation" as const,
        label: "Affirmation",
        preview: clip(text),
        body: text,
        when: whenLabel(it.createdAt),
        sortAt: toSortMs(it.createdAt, it.id),
      };
    })
    .filter((e): e is LogEntry => e !== null);
}

function normalizeMorningReflection(items: Record<string, unknown>[]): LogEntry[] {
  return items
    .map((it, index): LogEntry | null => {
      const reflectionText = str(it.reflectionText);
      if (!reflectionText) return null;
      const sleepMinutes = typeof it.effectiveSleepMinutes === "number" ? it.effectiveSleepMinutes : undefined;
      const meta = sleepMinutes ? `Slept ~${Math.round(sleepMinutes / 60)}h ${sleepMinutes % 60}m` : undefined;
      return {
        id: `morning_reflection-${str(it.id) || index}`,
        type: "morning_reflection" as const,
        label: "Morning Reflection",
        preview: clip(reflectionText),
        body: reflectionText,
        meta,
        when: whenLabel(it.createdAt),
        sortAt: toSortMs(it.createdAt, it.id),
      };
    })
    .filter((e): e is LogEntry => e !== null);
}

/** Sleep check-ins are mostly structured data, not free text — the shareable "body" is a short,
 *  human-readable summary of the mood/stress signals Luna cares about, built fresh here rather
 *  than stored, so it's never a second source of truth for the check-in record itself. Only
 *  check-ins with an actual mood/stress signal are shown — a bare energy/mode check-in with
 *  neither has nothing meaningful for Luna to receive. */
function normalizeSleepCheckIn(items: Record<string, unknown>[]): LogEntry[] {
  return items
    .map((it, index): LogEntry | null => {
      const mood = str(it.mood);
      const stress = str(it.stress);
      if (!mood && !stress) return null;
      const parts: string[] = [];
      if (mood) parts.push(`Mood: ${mood}`);
      if (stress) parts.push(`Stress: ${stress}`);
      if (typeof it.energy === "number") parts.push(`Energy: ${it.energy}`);
      if (typeof it.mode === "string" && it.mode) parts.push(`Mode: ${it.mode}`);
      const body = parts.join(" · ");
      return {
        id: `sleep_checkin-${str(it.id) || index}`,
        type: "sleep_checkin" as const,
        label: "Sleep Check-In",
        preview: clip(body),
        body,
        when: whenLabel(it.createdAt),
        sortAt: toSortMs(it.createdAt, it.id),
      };
    })
    .filter((e): e is LogEntry => e !== null);
}

/** Only entries with an actual note are shareable — a bare meal-time log with no note has
 *  nothing relevant to energy/recovery for Luna to receive. */
function normalizeFoodLog(items: Record<string, unknown>[]): LogEntry[] {
  return items
    .map((it, index): LogEntry | null => {
      const note = str(it.note);
      if (!note) return null;
      const entryType = str(it.entryType);
      return {
        id: `food_log-${str(it.id) || index}`,
        type: "food_log" as const,
        label: "Food Log Note",
        preview: clip(note),
        body: note,
        meta: entryType || undefined,
        when: whenLabel(it.createdAt ?? it.eatenAt),
        sortAt: toSortMs(it.createdAt ?? it.eatenAt, it.id),
      };
    })
    .filter((e): e is LogEntry => e !== null);
}

function normalizeQuickThought(items: Record<string, unknown>[]): LogEntry[] {
  return items
    .map((it, index): LogEntry | null => {
      const title = str(it.title);
      const body = str(it.body);
      if (!title && !body) return null;
      return {
        id: `quick_thought-${str(it.id) || index}`,
        type: "quick_thought" as const,
        label: title || "Quick Thought",
        preview: clip(body || title),
        body: body || title,
        when: whenLabel(it.createdAt),
        sortAt: toSortMs(it.createdAt, it.id),
      };
    })
    .filter((e): e is LogEntry => e !== null);
}

export default function LogHistoryScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  const [entriesByType, setEntriesByType] = useState<Record<LogType, LogEntry[]>>({
    journal: [],
    reflection: [],
    meditation: [],
    dream: [],
    pre_sleep_intention: [],
    affirmation: [],
    morning_reflection: [],
    sleep_checkin: [],
    food_log: [],
    quick_thought: [],
  });
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);

  const loadLogs = useCallback(async () => {
    const [
      journalRaw,
      reflectionRaw,
      meditationRaw,
      dreamRaw,
      preSleepRaw,
      affirmationRaw,
      morningReflectionRaw,
      sleepCheckInRaw,
      foodLogRaw,
      quickThoughtRaw,
    ] = await Promise.all([
      AsyncStorage.getItem(LOG_HISTORY_KEYS.journal),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.reflection),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.meditation),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.dream),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.preSleepIntention),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.affirmation),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.morningReflection),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.sleepCheckIn),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.foodLog),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.quickThought),
    ]);

    const sortDesc = (list: LogEntry[]) => [...list].sort((a, b) => b.sortAt - a.sortAt);

    setEntriesByType({
      journal: sortDesc(normalizeJournal(readArray(journalRaw))),
      reflection: sortDesc(normalizeReflection(readArray(reflectionRaw))),
      meditation: sortDesc(normalizeMeditation(readArray(meditationRaw))),
      dream: sortDesc(normalizeDream(readArray(dreamRaw))),
      pre_sleep_intention: sortDesc(normalizePreSleep(readArray(preSleepRaw))),
      affirmation: sortDesc(normalizeAffirmation(readArray(affirmationRaw))),
      morning_reflection: sortDesc(normalizeMorningReflection(readArray(morningReflectionRaw))),
      sleep_checkin: sortDesc(normalizeSleepCheckIn(readArray(sleepCheckInRaw))),
      food_log: sortDesc(normalizeFoodLog(readArray(foodLogRaw))),
      quick_thought: sortDesc(normalizeQuickThought(readArray(quickThoughtRaw))),
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLogs();
    }, [loadLogs])
  );

  const totalCount = SECTIONS.reduce((sum, section) => sum + entriesByType[section.type].length, 0);

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <WorldChrome
              hub="mind"
              kicker="YOUR ACCOUNT"
              title={LOG_HISTORY_HEADING}
              subtitle="Everything you've saved, synced to your account and restored on any device."
              style={styles.hero}
            />

            {totalCount === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  No logs yet. Save a Journal, Reflection, Meditation, Dream, or Pre-Sleep Intention and it will appear here.
                </Text>
              </View>
            ) : null}

            {SECTIONS.map((section) => {
              const entries = entriesByType[section.type];
              return (
                <View key={section.type} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{section.icon} {section.title}</Text>
                    <Text style={styles.sectionCount}>{entries.length}</Text>
                  </View>

                  {entries.length === 0 ? (
                    <Text style={styles.sectionEmpty}>No entries yet.</Text>
                  ) : (
                    entries.map((entry) => (
                      <TouchableOpacity
                        key={entry.id}
                        style={[styles.entryCard, { borderLeftWidth: 6, borderLeftColor: SECTION_ACCENT[section.type] }]}
                        activeOpacity={0.85}
                        onPress={() => setSelectedEntry(entry)}
                      >
                        <View style={styles.entryTopRow}>
                          <Text style={styles.entryLabel} numberOfLines={1}>{section.icon} {entry.label}</Text>
                          <Text style={styles.entryWhen}>{entry.when}</Text>
                        </View>
                        {entry.meta ? <Text style={styles.entryMeta} numberOfLines={1}>{entry.meta}</Text> : null}
                        {entry.preview ? (
                          <Text style={styles.entryBody} numberOfLines={2}>
                            {entry.preview}
                          </Text>
                        ) : null}
                        <Text style={styles.entryCue}>Tap to read ▾</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              );
            })}

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/stats")}>
              <Text style={styles.backButtonText}>← Back to Stats</Text>
            </TouchableOpacity>
          </FormScreen>

          <Modal visible={selectedEntry !== null} transparent animationType="fade" onRequestClose={() => setSelectedEntry(null)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalPanel}>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel} numberOfLines={1}>{selectedEntry?.label}</Text>
                    <Text style={styles.modalWhen}>{selectedEntry?.when}</Text>
                  </View>
                  <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedEntry(null)}>
                    <Text style={styles.modalCloseBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  {selectedEntry?.meta ? <Text style={styles.modalMeta}>{selectedEntry.meta}</Text> : null}
                  <Text style={styles.modalBody}>{selectedEntry?.body || selectedEntry?.preview}</Text>
                </ScrollView>
                {selectedEntry ? (
                  <View style={styles.feedToLunaRow}>
                    <FeedToGuideButton
                      guide="luna"
                      sourceType={LOG_TYPE_TO_GUIDE_SOURCE[selectedEntry.type]}
                      sourceId={selectedEntry.id}
                      sourceText={selectedEntry.body || selectedEntry.preview}
                    />
                  </View>
                ) : null}
                <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setSelectedEntry(null)}>
                  <Text style={styles.modalDoneBtnText}>DONE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <BottomNav activeRoute="stats" bottomOffset={mobile.bottomNavOffset} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#140F0A" },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#1C1410",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "rgba(167, 139, 250, 0.64)",
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 0,
    shadowOffset: { width: 6, height: 6 },
  },
  phoneStageFullscreen: { borderWidth: 0, maxWidth: undefined, aspectRatio: undefined, shadowOpacity: 0 },
  backgroundLayer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  backgroundImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  worldOverlay: { flex: 1, backgroundColor: "rgba(4, 8, 14, 0.22)" },
  hudContent: { paddingTop: 8 },
  hero: { marginBottom: 14 },
  emptyCard: {
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  emptyText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  section: { marginBottom: 18 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  sectionCount: {
    color: "#0F172A",
    backgroundColor: "#C4A7FF",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 22,
    textAlign: "center",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: "hidden",
  },
  sectionEmpty: { color: "#64748B", fontFamily: pixelFont, fontSize: 11, fontWeight: "800", marginBottom: 4 },
  entryCard: {
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  entryTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  entryLabel: { flex: 1, color: "#5B21B6", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  entryWhen: { color: "#8A7554", fontFamily: pixelFont, fontSize: 10, fontWeight: "800" },
  entryMeta: { color: "#92610A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 6 },
  entryBody: { color: "#3D2C18", fontFamily: pixelFont, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 7 },
  entryCue: { color: "#7C5B2B", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.82)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalPanel: { width: "100%", maxWidth: 380, maxHeight: "82%", backgroundColor: "#EAD9B6", borderWidth: 3, borderColor: "#5C4425", borderRadius: 8, padding: 14, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 4, height: 4 } },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 10 },
  modalLabel: { color: "#5B21B6", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  modalWhen: { color: "#8A7554", fontFamily: pixelFont, fontSize: 11, fontWeight: "800", marginTop: 4 },
  modalCloseBtn: { width: 30, height: 30, borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#E7D3A9" },
  modalCloseBtnText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  modalScroll: { maxHeight: 420 },
  modalMeta: { color: "#92610A", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginBottom: 10 },
  modalBody: { color: "#3D2C18", fontFamily: pixelFont, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  modalDoneBtn: { marginTop: 12, borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, paddingVertical: 12, alignItems: "center", backgroundColor: "#E7D3A9" },
  modalDoneBtnText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  feedToLunaRow: { marginTop: 12 },
  backButton: {
    backgroundColor: "rgba(46,32,20, 0.94)",
    borderWidth: 2,
    borderColor: "#7C3AED",
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  backButtonText: { color: "#ECE4FB", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
});
