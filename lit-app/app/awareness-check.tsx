import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
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

import { BottomNav } from "../components/BottomNav";
import { FormScreen } from "../components/FormScreen";
import { GuideInfoModal } from "../components/GuideInfoModal";
import { formPageContent, formStyles } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { persistProgressKeys } from "../lib/progressStore";
import { AWARENESS_CHECKS_KEY } from "../lib/storageKeys";
import { HistoryModal } from "../components/HistoryModal";
import { normalizeMeditationLogs } from "../lib/logHistory";
import { recordAgentEvent } from "../lib/mylitAgents";
import { SaveButton, type SaveState } from "../components/parchment/SaveButton";

const LUNA_MEDITATIONS_BULLETS = [
  "Meditation/Awareness is for grounding and honesty — not traditional seated meditation.",
  "Name your current mood, then say whatever is true for you right now.",
  "Honest answers are more useful than perfect ones.",
  "Use this after a work session, before bed, or any time you want clarity.",
];

/** "Tired" was renamed to "Faded" — see normalizeMeditationMood for the historic-data mapper
 *  that keeps old "tired" entries loading and displaying correctly under the new label. */
const MOOD_OPTIONS = ["Calm", "Faded", "Stressed", "Restless", "Hopeful", "Heavy", "Focused", "Unsure"];

/** Maps a stored mood value to what should actually be shown/selected in the UI — only "tired"
 *  (the old label) needs remapping; every other historic value already matches its option as-is. */
export function normalizeMeditationMood(value: string): string {
  return value.toLowerCase() === "tired" ? "Faded" : value;
}

type AwarenessCheck = {
  id: string;
  mood?: string;
  truth?: string;
  createdAt: string;
  // Legacy fields from the previous multi-question layout — kept only so old
  // entries still render; never written by new saves.
  attentionFocus?: string;
  automaticOrIntentional?: string;
  pulledAway?: string;
  broughtBack?: string;
};

// createdAt is stored as ISO (see saveAwarenessCheck) but legacy entries saved before this fix
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

export default function AwarenessCheckScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  const [mood, setMood] = useState("");
  const [truth, setTruth] = useState("");
  const [checks, setChecks] = useState<AwarenessCheck[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
    };
  }, []);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadChecks();
  }, []);

  async function loadChecks() {
    const saved = await AsyncStorage.getItem(AWARENESS_CHECKS_KEY);

    if (saved) {
      setChecks(JSON.parse(saved));
    }
  }

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function saveAwarenessCheck() {
    if (!truth.trim() || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");

    const newCheck: AwarenessCheck = {
      id: String(Date.now()),
      mood,
      truth: truth.trim(),
      createdAt: new Date().toISOString(),
    };

    const nextChecks = [newCheck, ...checks];

    try {
      // Persist first — the visible history list only ever shows a record that's actually
      // confirmed saved, never an optimistic row inserted ahead of persistence.
      await persistProgressKeys({ [AWARENESS_CHECKS_KEY]: JSON.stringify(nextChecks) });
      void recordAgentEvent({ type: "meditation_saved", sourcePage: "awareness-check", relatedItemId: newCheck.id, metadata: { mood } });

      setChecks(nextChecks);
      setMood("");
      setTruth("");

      await successHaptic();

      setSaveState("saved");
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
      savedTimeout.current = setTimeout(() => setSaveState("idle"), 2500);
    } catch (error) {
      console.warn("saveAwarenessCheck error:", error);
      // Input stays exactly as entered — no optimistic row was ever inserted, so there's
      // nothing to roll back besides showing the retry affordance.
      setSaveState("error");
    }
  }

  async function clearChecks() {
    setChecks([]);
    await persistProgressKeys({ [AWARENESS_CHECKS_KEY]: JSON.stringify([]) });
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
              <Text style={styles.heroLabel}>MIND HUB</Text>
              <Text style={[styles.title, { fontSize: 34, letterSpacing: 3 }]}>MEDITATIONS</Text>
              <Text style={styles.subtitle}>Notice attention. Come back gently.</Text>
            </View>

            <View style={styles.lunaCard}>
              <Image source={uiAssets.guides.luna} style={styles.lunaAvatar} resizeMode="contain" />
              <View style={styles.lunaCopy}>
                <Text style={styles.lunaName}>Luna</Text>
                <Text style={styles.lunaText}>
                  Name what had your focus, what pulled you away, and what helped you return.
                </Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Current mood:</Text>
              <View style={styles.optionRow}>
                {MOOD_OPTIONS.map((option) => {
                  const isSelected = mood === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.option, isSelected && styles.selectedOption]}
                      onPress={() => setMood(isSelected ? "" : option)}
                    >
                      <Text style={isSelected ? styles.selectedOptionText : styles.optionText}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Be as honest as you want. Express your truth:</Text>
              <TextInput
                style={[formStyles.textArea, styles.largeTextArea]}
                multiline
                scrollEnabled
                textAlignVertical="top"
                placeholder="Express your truth…"
                placeholderTextColor="#94A3B8"
                value={truth}
                onChangeText={setTruth}
              />

              <SaveButton
                state={saveState}
                onPress={saveAwarenessCheck}
                disabled={!truth.trim()}
                idleLabel="SAVE MEDITATION"
                style={styles.saveButton}
              />
            </View>

            <Text style={styles.sectionTitle}>RECENT MEDITATIONS</Text>

            {checks.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No meditations yet. Start with one honest observation.</Text>
              </View>
            ) : (
              checks.map((check) => (
                <View key={check.id} style={styles.entryCard}>
                  <Text style={styles.entryTitle}>{(check.mood ? normalizeMeditationMood(check.mood) : "") || check.automaticOrIntentional || "Meditation"}</Text>
                  <Text style={styles.entryDate}>{formatEntryDate(check.createdAt)}</Text>

                  {check.truth ? (
                    <Text style={styles.entryText}>{check.truth}</Text>
                  ) : (
                    <>
                      {check.attentionFocus ? (
                        <Text style={styles.entryText}>Attention: {check.attentionFocus}</Text>
                      ) : null}
                      {check.pulledAway ? (
                        <Text style={styles.entryText}>Pulled away: {check.pulledAway}</Text>
                      ) : null}
                      {check.broughtBack ? (
                        <Text style={styles.entryText}>Came back: {check.broughtBack}</Text>
                      ) : null}
                    </>
                  )}
                </View>
              ))
            )}

            {checks.length > 0 && (
              <TouchableOpacity style={styles.clearButton} onPress={clearChecks}>
                <Text style={styles.clearButtonText}>Clear Meditations</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.homeButton, { marginBottom: 8 }]} onPress={() => setShowHistory(true)}>
              <Text style={styles.homeButtonText}>🧘 Meditation History</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/mind")}>
              <Text style={styles.homeButtonText}>← Back to Mind Hub</Text>
            </TouchableOpacity>
          </FormScreen>

          <HistoryModal
            visible={showHistory}
            onClose={() => setShowHistory(false)}
            title="Meditation History"
            storageKey={AWARENESS_CHECKS_KEY}
            normalize={normalizeMeditationLogs}
            accent="#C4A7FF"
          />

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Meditations Work"
            bullets={LUNA_MEDITATIONS_BULLETS}
            accentColor="#C4A7FF"
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
    flexGrow: 1,
    paddingTop: 24,
    paddingHorizontal: 14,
  },
  hero: {
    backgroundColor: "#EAD9B6",
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
  heroLabel: {
    color: "#C4A7FF",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 38,
    textAlign: "center",
  },
  subtitle: {
    color: "#7C5B2B",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 8,
  },
  lunaCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAD9B6",
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
    color: "#7C3AED",
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  lunaText: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  card: {
    backgroundColor: "#EAD9B6",
    borderWidth: 4,
    borderColor: "#A78BFA",
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  label: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  largeTextArea: {
    marginBottom: 4,
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  option: {
    backgroundColor: "rgba(46,32,20, 0.96)",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  selectedOption: {
    backgroundColor: "rgba(49, 46, 129, 0.96)",
    borderColor: "#A78BFA",
  },
  optionText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
  },
  selectedOptionText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
  },
  saveButton: {
    marginTop: 16,
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
    backgroundColor: "#EAD9B6",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    padding: 12,
  },
  emptyText: {
    color: "#7C5B2B",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  entryCard: {
    backgroundColor: "#EAD9B6",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  entryTitle: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  entryDate: {
    color: "#7C5B2B",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
  },
  entryText: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8,
  },
  clearButton: {
    backgroundColor: "rgba(46,32,20, 0.94)",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 6,
  },
  clearButtonText: {
    color: "#FECACA",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  homeButton: {
    backgroundColor: "rgba(46,32,20, 0.94)",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  homeButtonText: {
    color: "#E2E8F0",
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
    backgroundColor: "#3E2A1A",
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