import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { GuidePanel } from "../components/parchment/GuidePanel";
import { ParchmentField } from "../components/parchment/ParchmentField";
import { ParchmentSurface, parchmentTextStyles } from "../components/parchment/ParchmentSurface";
import { SaveButton, type SaveState } from "../components/parchment/SaveButton";
import { WorldChrome } from "../components/parchment/WorldChrome";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { hubPalettes } from "../constants/worldTokens";
import { uiAssets } from "../constants/uiAssets";
import { persistProgressKeys } from "../lib/progressStore";
import { JOURNAL_ENTRIES_KEY } from "../lib/storageKeys";
import { HistoryModal } from "../components/HistoryModal";
import { normalizeJournalLogs } from "../lib/logHistory";
import { recordAgentEvent } from "../lib/mylitAgents";

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
  updatedAt?: string;
};

const STORAGE_KEY = JOURNAL_ENTRIES_KEY;

// createdAt is stored as ISO (see saveJournalEntry) but legacy entries saved before this fix
// may still hold an already-human-readable locale string — display those as-is rather than
// running them through Date.parse a second time.
function formatEntryDate(createdAt: string): string {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return createdAt;
  return new Date(parsed).toLocaleString();
}

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const palette = hubPalettes.mind;

export default function JournalScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [entryType, setEntryType] = useState<"Morning" | "Evening">("Morning");
  const [showInfo, setShowInfo] = useState(false);
  const [mood, setMood] = useState("");
  const [content, setContent] = useState("");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
    };
  }, []);

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
    if (!hasEntry || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");

    try {
      let nextEntries: JournalEntry[];
      let relatedId: string;
      if (editingId) {
        nextEntries = entries.map((entry) =>
          entry.id === editingId ? { ...entry, type: entryType, mood, content: content.trim(), updatedAt: new Date().toISOString() } : entry
        );
        relatedId = editingId;
      } else {
        const newEntry: JournalEntry = {
          id: String(Date.now()),
          type: entryType,
          mood,
          content: content.trim(),
          thoughtPattern: "",
          thoughtImpact: "Neutral",
          honestReframe: "",
          mindLesson: "",
          createdAt: new Date().toISOString(),
        };
        nextEntries = [newEntry, ...entries];
        relatedId = newEntry.id;
      }

      await saveEntries(nextEntries);
      void recordAgentEvent({ type: "journal_saved", sourcePage: "journal", relatedItemId: relatedId, metadata: { entryType } });

      setSaveState("saved");
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
      savedTimeout.current = setTimeout(() => {
        setSaveState("idle");
        setContent("");
        setMood("");
        setEditingId(null);
      }, 800);
    } catch (error) {
      console.warn("saveJournalEntry error:", error);
      setSaveState("error");
    }
  }

  function startEditingEntry(entry: JournalEntry) {
    setEditingId(entry.id);
    setEntryType(entry.type);
    setMood(entry.mood);
    setContent(entry.content);
    setSaveState("idle");
  }

  function cancelEditingEntry() {
    setEditingId(null);
    setContent("");
    setMood("");
    setSaveState("idle");
  }

  async function clearEntries() {
    await saveEntries([]);
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: palette.edge }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <WorldChrome hub="mind" kicker="MIND LOG" title="JOURNAL" subtitle="Write what happened. Notice the pattern." style={styles.chrome} />

            <GuidePanel
              hub="mind"
              guideName="Luna"
              guideAvatar={uiAssets.guides.luna}
              message="Write what is actually happening. It does not need to sound perfect."
              onInfoPress={() => setShowInfo(true)}
            />

            <ParchmentSurface accent="mind" title="NEW ENTRY" style={styles.formCard}>
              <Text style={styles.label}>Entry Type</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleButton, entryType === "Morning" && { backgroundColor: palette.edge, borderColor: palette.chrome }]}
                  onPress={() => setEntryType("Morning")}
                >
                  <Text style={entryType === "Morning" ? styles.activeToggleText : styles.toggleText}>Morning</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleButton, entryType === "Evening" && { backgroundColor: palette.edge, borderColor: palette.chrome }]}
                  onPress={() => setEntryType("Evening")}
                >
                  <Text style={entryType === "Evening" ? styles.activeToggleText : styles.toggleText}>Evening</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Mood (1–10)</Text>
              <ParchmentField
                style={styles.input}
                keyboardType="numeric"
                placeholder="Optional"
                value={mood}
                onChangeText={setMood}
              />

              <Text style={styles.label}>Be honest and write whatever is on your mind</Text>
              <ParchmentField
                style={styles.largeTextArea}
                multiline
                scrollEnabled
                textAlignVertical="top"
                placeholder="Write freely. A moment, a feeling, a win, a mistake, or anything that stayed with you."
                value={content}
                onChangeText={setContent}
              />

              <View style={styles.saveRow}>
                {editingId ? (
                  <TouchableOpacity style={styles.cancelEditBtn} onPress={cancelEditingEntry} disabled={saveState === "saving"}>
                    <Text style={styles.cancelEditBtnText}>CANCEL</Text>
                  </TouchableOpacity>
                ) : null}
                <SaveButton
                  state={saveState}
                  onPress={saveJournalEntry}
                  idleLabel={editingId ? "UPDATE ENTRY" : "SAVE JOURNAL ENTRY"}
                  style={styles.saveButton}
                />
              </View>
            </ParchmentSurface>

            <TouchableOpacity style={[styles.backButton, { marginBottom: 8 }]} onPress={() => setShowHistory(true)}>
              <Text style={styles.backButtonText}>📖 Journal History</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>RECENT LOGS</Text>

            {entries.length === 0 ? (
              <ParchmentSurface accent="mind" style={styles.emptyCard}>
                <Text style={parchmentTextStyles.body}>No journal logs yet. Start with one honest sentence.</Text>
              </ParchmentSurface>
            ) : (
              entries.map((entry) => (
                <ParchmentSurface key={entry.id} accent="mind" edgeStrip style={styles.entryCard}>
                  <View style={styles.entryTopRow}>
                    <Text style={styles.entryType}>{entry.type} Log</Text>
                    <TouchableOpacity
                      style={styles.editBtn}
                      hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
                      onPress={() => startEditingEntry(entry)}
                      accessibilityLabel="Edit entry"
                    >
                      <Text style={styles.editBtnText}>✎</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={parchmentTextStyles.meta}>{formatEntryDate(entry.createdAt)}{entry.updatedAt ? " · edited" : ""}</Text>
                  <Text style={styles.entryMood}>
                    Mood: {entry.mood.trim() ? `${entry.mood}/10` : "Not entered"}
                  </Text>

                  {entry.content ? <Text style={[parchmentTextStyles.body, styles.entryText]}>{entry.content}</Text> : null}
                </ParchmentSurface>
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
            accentColor={palette.accent}
          />

          <HistoryModal
            visible={showHistory}
            onClose={() => setShowHistory(false)}
            title="Journal History"
            storageKey={JOURNAL_ENTRIES_KEY}
            normalize={normalizeJournalLogs}
            accent={palette.accent}
          />

          <BottomNav activeRoute="mind" bottomOffset={mobile.bottomNavOffset} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#140F0A",
  },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#1C1410",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
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
  hudContent: {
    paddingTop: 16,
    paddingHorizontal: 14,
  },
  chrome: { marginBottom: 12 },
  formCard: { marginTop: 12, marginBottom: 12 },
  label: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    color: "#7C5B2B",
    marginTop: 10,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: "#F4E8CE",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    alignItems: "center",
    paddingVertical: 10,
  },
  toggleText: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  activeToggleText: {
    color: "#FFFFFF",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  input: {
    marginBottom: 4,
  },
  largeTextArea: {
    minHeight: 160,
    maxHeight: 280,
    marginBottom: 8,
  },
  saveRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  saveButton: { flex: 1 },
  cancelEditBtn: {
    flex: 1,
    backgroundColor: "#3E2A1A",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelEditBtnText: { color: "#D8C9A3", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  sectionTitle: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  emptyCard: {},
  entryCard: { marginBottom: 10 },
  entryTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  entryType: {
    color: "#5B21B6",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#5C4425",
    backgroundColor: "#F4E8CE",
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnText: { color: "#4A3620", fontSize: 14, fontWeight: "900" },
  entryMood: {
    color: "#92610A",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 7,
  },
  entryText: {
    marginTop: 8,
  },
  clearButton: {
    backgroundColor: "#3E2A1A",
    borderWidth: 2,
    borderColor: "#5C4425",
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
    backgroundColor: "rgba(46,32,20, 0.94)",
    borderWidth: 2,
    borderColor: "#8B7BC7",
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  backButtonText: {
    color: "#ECE4FB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
});
