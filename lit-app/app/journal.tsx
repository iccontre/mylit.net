import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { FormScreen } from "../components/FormScreen";
import { BottomNav } from "../components/BottomNav";
import { GuideInfoModal } from "../components/GuideInfoModal";
import { formPageContent, formStyles } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { persistProgressKeys } from "../lib/progressStore";
import { JOURNAL_ENTRIES_KEY } from "../lib/storageKeys";
import { HistoryModal } from "../components/HistoryModal";
import { normalizeJournalLogs } from "../lib/logHistory";

const LUNA_JOURNAL_BULLETS = [
  "Journal is for honest notes and thought patterns — not perfection.",
  "Write what happened, what mood or pattern showed up, and what to remember.",
  "One honest sentence is enough to start.",
  "Honest entries help MYLIT reveal patterns in your thinking over time.",
  "Morning and Evening entries track how the day opened and closed.",
];

type JournalEntry = {
  id: string;
  type: "Morning" | "Evening";
  mood: string;
  content: string;
  thoughtPattern: string;
  thoughtImpact: "Helpful" | "Harmful" | "Neutral";
  honestReframe: string;
  mindLesson: string;
  createdAt: string;
};

const STORAGE_KEY = JOURNAL_ENTRIES_KEY;

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function JournalScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [entryType, setEntryType] = useState<"Morning" | "Evening">("Morning");
  const [showInfo, setShowInfo] = useState(false);
  const [mood, setMood] = useState("");
  const [content, setContent] = useState("");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) {
      setEntries(JSON.parse(saved));
    }
  }

  async function saveEntries(nextEntries: JournalEntry[]) {
    setEntries(nextEntries);
    await persistProgressKeys({ [STORAGE_KEY]: JSON.stringify(nextEntries) });
  }

  async function saveJournalEntry() {
    const hasEntry = content.trim() || mood.trim();

    if (!hasEntry) return;

    const newEntry: JournalEntry = {
      id: String(Date.now()),
      type: entryType,
      mood,
      content: content.trim(),
      thoughtPattern: "",
      thoughtImpact: "Neutral",
      honestReframe: "",
      mindLesson: "",
      createdAt: new Date().toLocaleString(),
    };

    const nextEntries = [newEntry, ...entries];
    await saveEntries(nextEntries);

    setContent("");
    setMood("");
  }

  async function clearEntries() {
    await saveEntries([]);
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
              <Text style={styles.heroKicker}>MIND LOG</Text>
              <Text style={styles.title}>JOURNAL</Text>
              <Text style={styles.subtitle}>Write what happened. Notice the pattern.</Text>
            </View>

            <View style={styles.lunaCard}>
              <Image source={uiAssets.guides.luna} style={styles.lunaAvatar} resizeMode="contain" />
              <View style={styles.lunaCopy}>
                <Text style={styles.lunaName}>Luna</Text>
                <Text style={styles.lunaText}>
                  Write what is actually happening. It does not need to sound perfect.
                </Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.panel}>
              <Text style={styles.pageLabel}>Entry Type</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleButton, entryType === "Morning" && styles.activeToggle]}
                  onPress={() => setEntryType("Morning")}
                >
                  <Text style={entryType === "Morning" ? styles.activeToggleText : styles.toggleText}>
                    Morning
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleButton, entryType === "Evening" && styles.activeToggle]}
                  onPress={() => setEntryType("Evening")}
                >
                  <Text style={entryType === "Evening" ? styles.activeToggleText : styles.toggleText}>
                    Evening
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.pageLabel}>Mood (1–10)</Text>
              <TextInput
                style={[formStyles.input, styles.input]}
                keyboardType="numeric"
                placeholder="Optional"
                placeholderTextColor="#94A3B8"
                value={mood}
                onChangeText={setMood}
              />

              <Text style={styles.pageLabel}>Be honest and write whatever is on your mind</Text>
              <TextInput
                style={[formStyles.textArea, styles.largeTextArea]}
                multiline
                scrollEnabled
                textAlignVertical="top"
                placeholder="Write freely. A moment, a feeling, a win, a mistake, or anything that stayed with you."
                placeholderTextColor="#94A3B8"
                value={content}
                onChangeText={setContent}
              />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={saveJournalEntry}>
              <Text style={styles.saveButtonText}>Save Journal Entry</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => setShowHistory(true)}>
              <Text style={styles.backButtonText}>📖 Journal History</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>RECENT LOGS</Text>

            {entries.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No journal logs yet. Start with one honest sentence.</Text>
              </View>
            ) : (
              entries.map((entry) => (
                <View key={entry.id} style={styles.entryCard}>
                  <Text style={styles.entryType}>{entry.type} Log</Text>
                  <Text style={styles.entryDate}>{entry.createdAt}</Text>
                  <Text style={styles.entryMood}>
                    Mood: {entry.mood.trim() ? `${entry.mood}/10` : "Not entered"}
                  </Text>

                  {entry.content ? <Text style={styles.entryText}>{entry.content}</Text> : null}
                </View>
              ))
            )}

            {entries.length > 0 && (
              <TouchableOpacity style={styles.clearButton} onPress={clearEntries}>
                <Text style={styles.clearButtonText}>Clear Journal Logs</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/mind")}>
              <Text style={styles.backButtonText}>← Back to Mind Hub</Text>
            </TouchableOpacity>
          </FormScreen>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Journal Works"
            bullets={LUNA_JOURNAL_BULLETS}
            accentColor="#C4A7FF"
          />

          <HistoryModal
            visible={showHistory}
            onClose={() => setShowHistory(false)}
            title="Journal History"
            storageKey={JOURNAL_ENTRIES_KEY}
            normalize={normalizeJournalLogs}
            accent="#C4A7FF"
          />

          <BottomNav activeRoute="mind" theme="purple" bottomOffset={mobile.bottomNavOffset} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#02040A",
  },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#050814",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "rgba(251, 191, 36, 0.64)",
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 0,
    shadowOffset: { width: 6, height: 6 },
  },
  phoneStageFullscreen: {
    borderWidth: 0,
    maxWidth: undefined,
    aspectRatio: undefined,
    shadowOpacity: 0,
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
    backgroundColor: "rgba(4, 8, 14, 0.16)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    paddingTop: 8,
  },
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
  heroKicker: {
    color: "#C4A7FF",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 1,
    lineHeight: 38,
    textAlign: "center",
  },
  subtitle: {
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 8,
  },
  lunaCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  lunaAvatar: {
    height: 58,
    width: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: "#C4A7FF",
    backgroundColor: "rgba(49, 46, 129, 0.72)",
    marginRight: 12,
  },
  lunaCopy: {
    flex: 1,
  },
  lunaName: {
    color: "#F0ABFC",
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  lunaText: {
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  panel: {
    backgroundColor: "rgba(8, 13, 24, 0.96)",
    borderWidth: 4,
    borderColor: "#FBBF24",
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  pageLabel: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    alignItems: "center",
    paddingVertical: 12,
  },
  activeToggle: {
    backgroundColor: "rgba(49, 46, 129, 0.96)",
    borderColor: "#A78BFA",
  },
  toggleText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  activeToggleText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  input: {
    marginBottom: 4,
  },
  largeTextArea: {
    minHeight: 200,
    maxHeight: 320,
    marginBottom: 4,
  },
  saveButton: {
    backgroundColor: "#A78BFA",
    borderWidth: 3,
    borderColor: "#E9D5FF",
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  saveButtonText: {
    color: "#0F172A",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    padding: 12,
  },
  emptyText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  entryCard: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  entryType: {
    color: "#E9D5FF",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  entryDate: {
    color: "#94A3B8",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
  },
  entryMood: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 7,
  },
  entryText: {
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8,
  },
  clearButton: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 8,
  },
  clearButtonText: {
    color: "#FECACA",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  backButton: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  backButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  infoBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#A78BFA",
    backgroundColor: "rgba(49,46,129,0.72)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  infoBtnText: {
    color: "#C4A7FF",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },
  bottomNav: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    height: 62,
    backgroundColor: "rgba(4, 8, 16, 0.98)",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 5,
    padding: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#3A4558",
    borderRadius: 3,
    paddingVertical: 4,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonActive: {
    backgroundColor: "#162314",
    borderColor: "#FDE68A",
  },
  navText: {
    color: "#E2E8F0",
    fontSize: 17,
    fontWeight: "900",
  },
  navTextActive: {
    color: "#FDE68A",
    fontSize: 17,
    fontWeight: "900",
  },
  navLabel: {
    color: "#CBD5E1",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
    fontFamily: pixelFont,
  },
  navLabelActive: {
    color: "#FDE68A",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
    fontFamily: pixelFont,
  },
});