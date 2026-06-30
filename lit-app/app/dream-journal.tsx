import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { uiAssets } from "../constants/uiAssets";

type DreamEntry = {
  id: string;
  title: string;
  summary: string;
  feeling: string;
  createdAt: string;
};

const DREAM_JOURNAL_KEY = "lit_dream_journal";
const USER_STATS_KEY = "lit_user_stats";
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function formatDreamDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const FEELING_OPTIONS = [
  { emoji: "😊", label: "Happy" },
  { emoji: "😌", label: "Peaceful" },
  { emoji: "😃", label: "Excited" },
  { emoji: "😕", label: "Confused" },
  { emoji: "😨", label: "Scared" },
  { emoji: "😢", label: "Sad" },
  { emoji: "🌀", label: "Surreal" },
  { emoji: "🤔", label: "Unsettled" },
];

const theme = { accent: "#C4A7FF", glow: "#E9D5FF", panel: "rgba(18, 16, 34, 0.94)", soft: "#DDD6FE", active: "rgba(49, 46, 129, 0.94)" };

export default function DreamJournalScreen() {
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const [entries, setEntries] = useState<DreamEntry[]>([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [feeling, setFeeling] = useState("");

  const safeViewportWidth = Math.max(0, viewportWidth - 24);
  const safeViewportHeight = Math.max(0, viewportHeight - 24);
  const frameWidth = Math.min(MAX_FRAME_WIDTH, safeViewportWidth, safeViewportHeight * APP_FRAME_ASPECT_RATIO);
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [])
  );

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function lightHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function earnSteps(count: number) {
    const saved = await AsyncStorage.getItem(USER_STATS_KEY);
    const current: Record<string, unknown> = saved ? JSON.parse(saved) : {};
    await AsyncStorage.setItem(USER_STATS_KEY, JSON.stringify({ ...current, totalSteps: Number(current.totalSteps ?? 0) + count }));
  }

  async function loadEntries() {
    const saved = await AsyncStorage.getItem(DREAM_JOURNAL_KEY);

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      setEntries(Array.isArray(parsed) ? parsed : []);
    } catch {
      setEntries([]);
    }
  }

  async function saveEntries(nextEntries: DreamEntry[]) {
    setEntries(nextEntries);
    await AsyncStorage.setItem(DREAM_JOURNAL_KEY, JSON.stringify(nextEntries));
  }

  async function saveDream() {
    if (!title.trim() && !summary.trim()) return;

    const entry: DreamEntry = {
      id: String(Date.now()),
      title: title.trim(),
      summary: summary.trim(),
      feeling,
      createdAt: new Date().toISOString(),
    };

    await saveEntries([entry, ...entries]);
    await earnSteps(1);
    await successHaptic();

    setTitle("");
    setSummary("");
    setFeeling("");
  }

  async function clearDreams() {
    await lightHaptic();
    await saveEntries([]);
  }

  return (
    <View style={styles.pageRoot}>
      <View style={[styles.phoneStage, { width: frameWidth, height: frameHeight, borderColor: theme.accent }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.recovery} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView style={styles.screenScroller} contentContainerStyle={styles.hudContent} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={[styles.hero, { borderColor: theme.accent, backgroundColor: theme.panel }]}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroCopy}>
                  <Text style={[styles.heroKicker, { color: theme.glow }]}>DREAM LOG</Text>
                  <Text style={styles.title}>DREAM JOURNAL</Text>
                  <Text style={[styles.subtitle, { color: theme.soft }]}>Capture before the dream fades.</Text>
                </View>
                <Image source={uiAssets.guides.luna} style={[styles.guideAvatar, { borderColor: theme.accent }]} resizeMode="contain" />
              </View>
            </View>

            <View style={[styles.lunaCard, { borderColor: theme.accent }]}>
              <Text style={[styles.lunaName, { color: theme.glow }]}>🌙 Luna</Text>
              <Text style={styles.lunaText}>Most dreams fade within about 10 minutes. Write it down now, even just fragments — images, feelings, a single scene.</Text>
            </View>

            <View style={[styles.formCard, { borderColor: theme.accent }]}>
              <Text style={styles.label}>Dream title</Text>
              <TextInput style={styles.input} placeholder="Example: The train under the ocean" placeholderTextColor="#94A3B8" value={title} onChangeText={setTitle} />

              <Text style={styles.label}>Write your dream</Text>
              <TextInput style={[styles.textArea, { minHeight: 120 }]} multiline placeholder="Describe scenes, people, places, and details you remember." placeholderTextColor="#94A3B8" value={summary} onChangeText={setSummary} />

              <Text style={styles.label}>How did it feel?</Text>
              <View style={styles.chipRow}>
                {FEELING_OPTIONS.map((opt) => {
                  const selected = feeling === `${opt.emoji} ${opt.label}`;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.chip, selected && { backgroundColor: theme.active, borderColor: theme.accent }]}
                      onPress={() => setFeeling(selected ? "" : `${opt.emoji} ${opt.label}`)}
                    >
                      <Text style={selected ? [styles.chipText, { color: theme.glow }] : styles.chipText}>{opt.emoji} {opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={[styles.saveButton, { borderColor: theme.accent }]} onPress={saveDream}>
                <Text style={styles.saveButtonText}>Save Dream · +1 Step</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.historyCard, { borderColor: theme.accent }]}>
              <View style={styles.historyHeader}>
                <Text style={[styles.historyTitle, { color: theme.glow }]}>Dream History</Text>
                {entries.length > 0 ? (
                  <TouchableOpacity style={styles.clearButton} onPress={clearDreams}>
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {entries.length === 0 ? (
                <Text style={styles.emptyText}>No dreams logged yet. Add one fragment to start seeing patterns.</Text>
              ) : (
                entries.map((entry) => (
                  <View key={entry.id} style={styles.entryCard}>
                    <View style={styles.entryTopRow}>
                      <Text style={styles.entryTitle}>{entry.title || "Untitled dream"}</Text>
                      <Text style={styles.entryDate}>{formatDreamDate(entry.createdAt)}</Text>
                    </View>

                    {entry.summary ? <Text style={styles.entryText}>{entry.summary}</Text> : null}

                    {entry.feeling ? (
                      <View style={styles.tagRow}>
                        <Text style={styles.tag}>{entry.feeling}</Text>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
              <Text style={styles.backButtonText}>Back to Today</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#02040A",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#050814",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 0,
    shadowOffset: { width: 6, height: 6 },
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  worldOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 12, 0.16)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  hero: {
    borderWidth: 4,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroCopy: {
    flex: 1,
    marginRight: 12,
  },
  heroKicker: {
    fontFamily: pixelFont,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "900",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: pixelFont,
    fontSize: 26,
    fontWeight: "900",
    color: "#F9FAFB",
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "900",
    marginTop: 5,
  },
  guideAvatar: {
    height: 66,
    width: 66,
    borderRadius: 33,
    borderWidth: 3,
    backgroundColor: "rgba(8, 13, 24, 0.65)",
  },
  lunaCard: {
    backgroundColor: "rgba(8, 12, 20, 0.94)",
    borderRadius: 6,
    padding: 13,
    marginBottom: 10,
    borderWidth: 3,
  },
  lunaName: {
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  lunaText: {
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    color: "#F3F4F6",
    fontWeight: "700",
  },
  formCard: {
    backgroundColor: "rgba(8, 13, 24, 0.96)",
    borderRadius: 6,
    padding: 13,
    marginBottom: 10,
    borderWidth: 3,
  },
  label: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    color: "#E5E7EB",
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    lineHeight: 16,
  },
  input: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    padding: 12,
    fontSize: 15,
    color: "#F9FAFB",
    borderWidth: 2,
    borderColor: "#475569",
    fontFamily: pixelFont,
  },
  textArea: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    padding: 12,
    minHeight: 82,
    fontSize: 15,
    color: "#F9FAFB",
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#475569",
    fontFamily: pixelFont,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#334155",
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  chipText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
  },
  saveButton: {
    backgroundColor: "#312E81",
    padding: 14,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 14,
    borderWidth: 3,
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  historyCard: {
    backgroundColor: "rgba(8, 13, 24, 0.96)",
    borderRadius: 6,
    padding: 13,
    marginBottom: 10,
    borderWidth: 3,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  historyTitle: {
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  clearButton: {
    backgroundColor: "#111827",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#475569",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  clearButtonText: {
    color: "#FECACA",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  emptyText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  entryCard: {
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#334155",
    padding: 11,
    marginTop: 8,
  },
  entryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "flex-start",
  },
  entryTitle: {
    flex: 1,
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
  },
  entryDate: {
    color: "#94A3B8",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
  },
  entryText: {
    color: "#E5E7EB",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    fontWeight: "700",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tag: {
    color: "#F8F1D7",
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 7,
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
  },
  entryDetail: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    fontWeight: "700",
  },
  detailLabel: {
    color: "#FDE68A",
    fontWeight: "900",
  },
  backButton: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    padding: 12,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#334155",
  },
  backButtonText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});