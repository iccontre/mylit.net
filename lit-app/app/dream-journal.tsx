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
  emotions: string;
  symbols: string;
  lucid: "yes" | "no";
  pattern: string;
  tomorrowIntention?: string;
  createdAt: string;
};

type CheckIn = {
  energy: number;
  mode: "Recovery" | "Progress";
  createdAt?: string;
};

type ModeState = "Recovery" | "Progress" | "Neutral";

const DREAM_JOURNAL_KEY = "lit_dream_journal";
const CHECKIN_KEY = "lit_latest_checkin";
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

export default function DreamJournalScreen() {
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const [entries, setEntries] = useState<DreamEntry[]>([]);
  const [currentMode, setCurrentMode] = useState<ModeState>("Neutral");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [emotions, setEmotions] = useState("");
  const [symbols, setSymbols] = useState("");
  const [lucid, setLucid] = useState<"yes" | "no">("no");
  const [pattern, setPattern] = useState("");
  const [tomorrowIntention, setTomorrowIntention] = useState("");

  const safeViewportWidth = Math.max(0, viewportWidth - 24);
  const safeViewportHeight = Math.max(0, viewportHeight - 24);
  const frameWidth = Math.min(MAX_FRAME_WIDTH, safeViewportWidth, safeViewportHeight * APP_FRAME_ASPECT_RATIO);
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

  const isProgress = currentMode === "Progress";
  const isRecovery = currentMode === "Recovery";
  const currentBackground = isRecovery
    ? uiAssets.backgrounds.recovery
    : isProgress
      ? uiAssets.backgrounds.progress
      : uiAssets.backgrounds.neutral;
  const theme = isProgress
    ? { accent: "#FBBF24", glow: "#FEF3C7", panel: "rgba(18, 16, 12, 0.94)", soft: "#FDE68A", active: "rgba(58, 42, 10, 0.94)" }
    : { accent: "#C4A7FF", glow: "#E9D5FF", panel: "rgba(18, 16, 34, 0.94)", soft: "#DDD6FE", active: "rgba(49, 46, 129, 0.94)" };

  useFocusEffect(
    useCallback(() => {
      loadEntries();
      loadLatestMode();
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

  async function loadLatestMode() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);

    if (!saved) {
      setCurrentMode("Neutral");
      return;
    }

    try {
      const parsed = JSON.parse(saved) as CheckIn;
      const checkInDay = parsed.createdAt ? new Date(parsed.createdAt).toLocaleDateString("en-CA") : null;

      if ((parsed.mode === "Recovery" || parsed.mode === "Progress") && checkInDay === getTodayKey()) {
        setCurrentMode(parsed.mode);
      } else {
        setCurrentMode("Neutral");
      }
    } catch {
      setCurrentMode("Neutral");
    }
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
    const hasDreamData = title.trim() || summary.trim() || emotions.trim() || symbols.trim() || pattern.trim() || tomorrowIntention.trim();

    if (!hasDreamData) return;

    const entry: DreamEntry = {
      id: String(Date.now()),
      title: title.trim(),
      summary: summary.trim(),
      emotions: emotions.trim(),
      symbols: symbols.trim(),
      lucid,
      pattern: pattern.trim(),
      tomorrowIntention: tomorrowIntention.trim(),
      createdAt: new Date().toISOString(),
    };

    await saveEntries([entry, ...entries]);
    await successHaptic();

    setTitle("");
    setSummary("");
    setEmotions("");
    setSymbols("");
    setLucid("no");
    setPattern("");
    setTomorrowIntention("");
  }

  async function clearDreams() {
    await lightHaptic();
    await saveEntries([]);
  }

  return (
    <View style={styles.pageRoot}>
      <View style={[styles.phoneStage, { width: frameWidth, height: frameHeight, borderColor: theme.accent }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={currentBackground} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView style={styles.screenScroller} contentContainerStyle={styles.hudContent} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={[styles.hero, { borderColor: theme.accent, backgroundColor: theme.panel }]}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroCopy}>
                  <Text style={[styles.heroKicker, { color: theme.glow }]}>SLEEP LOG</Text>
                  <Text style={styles.title}>DREAM JOURNAL</Text>
                  <Text style={[styles.subtitle, { color: theme.soft }]}>Capture symbols, emotion, lucidity, and tomorrow’s signal.</Text>
                </View>
                <Image source={uiAssets.guides.luna} style={[styles.guideAvatar, { borderColor: theme.accent }]} resizeMode="contain" />
              </View>
            </View>

            <View style={[styles.lunaCard, { borderColor: theme.accent }]}>
              <Text style={[styles.lunaName, { color: theme.glow }]}>🌙 Luna</Text>
              <Text style={styles.lunaText}>Write it down before the dream fades. Fragments count. Images count. A single feeling can be useful data.</Text>
            </View>

            <View style={[styles.formCard, { borderColor: theme.accent }]}>
              <Text style={styles.label}>Dream title</Text>
              <TextInput style={styles.input} placeholder="Example: The train under the ocean" placeholderTextColor="#94A3B8" value={title} onChangeText={setTitle} />

              <Text style={styles.label}>What happened in the dream?</Text>
              <TextInput style={styles.textArea} multiline placeholder="Capture the scenes, people, places, and weird details you remember." placeholderTextColor="#94A3B8" value={summary} onChangeText={setSummary} />

              <Text style={styles.label}>Emotions</Text>
              <TextInput style={styles.input} placeholder="Example: calm, chased, curious, relieved" placeholderTextColor="#94A3B8" value={emotions} onChangeText={setEmotions} />

              <Text style={styles.label}>Symbols / repeated images</Text>
              <TextInput style={styles.input} placeholder="Example: water, locked doors, blue light, school" placeholderTextColor="#94A3B8" value={symbols} onChangeText={setSymbols} />

              <Text style={styles.label}>Was it lucid?</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity style={[styles.toggleButton, lucid === "no" && { backgroundColor: theme.active, borderColor: theme.accent }]} onPress={() => setLucid("no")}>
                  <Text style={lucid === "no" ? [styles.activeToggleText, { color: theme.glow }] : styles.toggleText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toggleButton, lucid === "yes" && { backgroundColor: theme.active, borderColor: theme.accent }]} onPress={() => setLucid("yes")}>
                  <Text style={lucid === "yes" ? [styles.activeToggleText, { color: theme.glow }] : styles.toggleText}>Yes</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Pattern or possible meaning</Text>
              <TextInput style={styles.textArea} multiline placeholder="Example: I keep dreaming about being unprepared when I avoid decisions." placeholderTextColor="#94A3B8" value={pattern} onChangeText={setPattern} />

              <Text style={styles.label}>Tomorrow intention from this dream</Text>
              <TextInput style={styles.textArea} multiline placeholder="Example: Ask for help early instead of trying to solve everything alone." placeholderTextColor="#94A3B8" value={tomorrowIntention} onChangeText={setTomorrowIntention} />

              <TouchableOpacity style={[styles.saveButton, { borderColor: theme.accent }]} onPress={saveDream}>
                <Text style={styles.saveButtonText}>Save Dream</Text>
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

                    <View style={styles.tagRow}>
                      <Text style={styles.tag}>Lucid: {entry.lucid === "yes" ? "Yes" : "No"}</Text>
                      {entry.emotions ? <Text style={styles.tag}>Mood: {entry.emotions}</Text> : null}
                    </View>

                    {entry.symbols ? <Text style={styles.entryDetail}><Text style={styles.detailLabel}>Symbols: </Text>{entry.symbols}</Text> : null}
                    {entry.pattern ? <Text style={styles.entryDetail}><Text style={styles.detailLabel}>Pattern: </Text>{entry.pattern}</Text> : null}
                    {entry.tomorrowIntention ? <Text style={styles.entryDetail}><Text style={styles.detailLabel}>Tomorrow: </Text>{entry.tomorrowIntention}</Text> : null}
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
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  toggleButton: {
    width: "48%",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#334155",
    paddingVertical: 11,
    alignItems: "center",
  },
  toggleText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  activeToggleText: {
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
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