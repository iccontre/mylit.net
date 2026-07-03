import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomNav } from "../components/BottomNav";
import { FormScreen } from "../components/FormScreen";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { LOG_HISTORY_KEYS } from "../lib/storageKeys";

// Read-only history view. It reads the same synced, array-merged keys the entry pages
// write to (see LOG_HISTORY_KEYS), so logs restore across devices after login. We never
// log the private journal/dream/reflection/meditation text to the console.

type LogType = "journal" | "reflection" | "meditation" | "dream" | "pre_sleep_intention";

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

const SECTIONS: { type: LogType; title: string; icon: string }[] = [
  { type: "journal", title: "Journal", icon: "📓" },
  { type: "reflection", title: "Reflections", icon: "🔍" },
  { type: "meditation", title: "Meditations", icon: "🧘" },
  { type: "dream", title: "Dream Journal", icon: "🌙" },
  { type: "pre_sleep_intention", title: "Pre-Sleep Intentions", icon: "✨" },
];

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

export default function LogHistoryScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  const [entriesByType, setEntriesByType] = useState<Record<LogType, LogEntry[]>>({
    journal: [],
    reflection: [],
    meditation: [],
    dream: [],
    pre_sleep_intention: [],
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadLogs = useCallback(async () => {
    const [journalRaw, reflectionRaw, meditationRaw, dreamRaw, preSleepRaw] = await Promise.all([
      AsyncStorage.getItem(LOG_HISTORY_KEYS.journal),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.reflection),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.meditation),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.dream),
      AsyncStorage.getItem(LOG_HISTORY_KEYS.preSleepIntention),
    ]);

    const sortDesc = (list: LogEntry[]) => [...list].sort((a, b) => b.sortAt - a.sortAt);

    setEntriesByType({
      journal: sortDesc(normalizeJournal(readArray(journalRaw))),
      reflection: sortDesc(normalizeReflection(readArray(reflectionRaw))),
      meditation: sortDesc(normalizeMeditation(readArray(meditationRaw))),
      dream: sortDesc(normalizeDream(readArray(dreamRaw))),
      pre_sleep_intention: sortDesc(normalizePreSleep(readArray(preSleepRaw))),
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLogs();
    }, [loadLogs])
  );

  const totalCount = SECTIONS.reduce((sum, section) => sum + entriesByType[section.type].length, 0);

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>YOUR ACCOUNT</Text>
              <Text style={styles.title}>LOG HISTORY</Text>
              <Text style={styles.subtitle}>Everything you&apos;ve saved, synced to your account and restored on any device.</Text>
            </View>

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
                    entries.map((entry) => {
                      const isOpen = Boolean(expanded[entry.id]);
                      return (
                        <TouchableOpacity
                          key={entry.id}
                          style={styles.entryCard}
                          activeOpacity={0.85}
                          onPress={() => toggle(entry.id)}
                        >
                          <View style={styles.entryTopRow}>
                            <Text style={styles.entryLabel} numberOfLines={1}>{entry.label}</Text>
                            <Text style={styles.entryWhen}>{entry.when}</Text>
                          </View>
                          {entry.meta ? <Text style={styles.entryMeta} numberOfLines={isOpen ? undefined : 1}>{entry.meta}</Text> : null}
                          {entry.body ? (
                            <Text style={styles.entryBody} numberOfLines={isOpen ? undefined : 2}>
                              {isOpen ? entry.body : entry.preview}
                            </Text>
                          ) : null}
                          <Text style={styles.entryCue}>{isOpen ? "Tap to collapse ▲" : "Tap to read ▾"}</Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              );
            })}

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/stats")}>
              <Text style={styles.backButtonText}>← Back to Stats</Text>
            </TouchableOpacity>
          </FormScreen>

          <BottomNav activeRoute="stats" theme="purple" bottomOffset={mobile.bottomNavOffset} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#02040A" },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#050814",
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
  hero: {
    backgroundColor: "rgba(31, 27, 75, 0.95)",
    borderWidth: 4,
    borderColor: "#A78BFA",
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  heroKicker: { color: "#C4A7FF", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  title: { color: "#F9FAFB", fontFamily: pixelFont, fontSize: 30, fontWeight: "900", letterSpacing: 1, lineHeight: 36 },
  subtitle: { color: "#F8F1D7", fontFamily: pixelFont, fontSize: 12, fontWeight: "800", lineHeight: 18, marginTop: 8 },
  emptyCard: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
  },
  emptyText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 12, lineHeight: 18, fontWeight: "800" },
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
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  entryTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  entryLabel: { flex: 1, color: "#E9D5FF", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  entryWhen: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, fontWeight: "800" },
  entryMeta: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 6 },
  entryBody: { color: "#F8F1D7", fontFamily: pixelFont, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 7 },
  entryCue: { color: "#64748B", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  backButton: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  backButtonText: { color: "#F9FAFB", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
});
