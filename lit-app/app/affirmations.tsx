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
import { HistoryModal } from "../components/HistoryModal";
import { formPageContent, formStyles } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { normalizeAffirmationLogs } from "../lib/logHistory";
import { recordAgentEvent } from "../lib/mylitAgents";
import { persistProgressKeys } from "../lib/progressStore";
import { AFFIRMATIONS_KEY } from "../lib/storageKeys";

const LUNA_AFFIRMATIONS_BULLETS = [
  "Affirmations are for reaffirming yourself, not performing positivity.",
  "Write whatever is true and supportive for you right now — short is enough.",
  "Saving one affirmation earns +1 step, once per affirmation.",
  "Come back any time you feel inspired or unmotivated.",
];

type AffirmationEntry = {
  id: string;
  text: string;
  createdAt: string;
};

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function AffirmationsScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  const [text, setText] = useState("");
  const [affirmations, setAffirmations] = useState<AffirmationEntry[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (justSavedTimeout.current) clearTimeout(justSavedTimeout.current);
    };
  }, []);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadAffirmations();
  }, []);

  async function loadAffirmations() {
    const saved = await AsyncStorage.getItem(AFFIRMATIONS_KEY);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setAffirmations(parsed);
      } catch {
        // Ignore malformed data — keeps the page usable rather than crashing.
      }
    }
  }

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  /**
   * +1 step per saved affirmation is NOT written here — it's derived the same way checklist/quest
   * steps are: Home/Stats count the affirmations array length via computeTotalEarnedSteps
   * (questProgress.ts), ratcheted by the existing monotonic steps floor. That means a genuinely
   * new saved affirmation (a new id in this array) always earns exactly +1 the next time the
   * total is computed, while edits (there are none — this page only appends), reloads, sync
   * replays of the same id, and clearing history can never award twice or subtract steps already
   * earned.
   */
  async function saveAffirmation() {
    if (!text.trim() || justSaved) return;

    const newEntry: AffirmationEntry = {
      id: `affirmation-${Date.now()}`,
      text: text.trim(),
      createdAt: new Date().toLocaleString(),
    };

    const next = [newEntry, ...affirmations];

    setAffirmations(next);
    await persistProgressKeys({ [AFFIRMATIONS_KEY]: JSON.stringify(next) });
    void recordAgentEvent({ type: "affirmation_saved", sourcePage: "affirmations", relatedItemId: newEntry.id });

    setText("");

    await successHaptic();

    setJustSaved(true);
    if (justSavedTimeout.current) clearTimeout(justSavedTimeout.current);
    justSavedTimeout.current = setTimeout(() => setJustSaved(false), 2500);
  }

  async function clearAffirmations() {
    setAffirmations([]);
    await persistProgressKeys({ [AFFIRMATIONS_KEY]: JSON.stringify([]) });
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
              <Text style={[styles.title, { fontSize: 34, letterSpacing: 3 }]}>AFFIRMATIONS</Text>
              <Text style={styles.subtitle}>Reaffirm yourself, in your own words.</Text>
            </View>

            <View style={styles.lunaCard}>
              <Image source={uiAssets.guides.luna} style={styles.lunaAvatar} resizeMode="contain" />
              <View style={styles.lunaCopy}>
                <Text style={styles.lunaName}>Luna</Text>
                <Text style={styles.lunaText}>
                  Use this space to reaffirm yourself when you feel inspired or unmotivated.
                </Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Write an affirmation:</Text>
              <TextInput
                style={[formStyles.textArea, styles.largeTextArea]}
                multiline
                scrollEnabled
                textAlignVertical="top"
                placeholder="I am…"
                placeholderTextColor="#94A3B8"
                value={text}
                onChangeText={setText}
              />

              <TouchableOpacity style={[styles.saveButton, (!text.trim() || justSaved) && styles.saveButtonDisabled]} disabled={!text.trim() || justSaved} onPress={saveAffirmation}>
                <Text style={styles.saveButtonText}>{justSaved ? "Saved" : "Save Affirmation"}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>RECENT AFFIRMATIONS</Text>

            {affirmations.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No affirmations yet. Write one whenever you need it.</Text>
              </View>
            ) : (
              affirmations.map((entry) => (
                <View key={entry.id} style={styles.entryCard}>
                  <Text style={styles.entryDate}>{entry.createdAt}</Text>
                  <Text style={styles.entryText}>{entry.text}</Text>
                </View>
              ))
            )}

            {affirmations.length > 0 && (
              <TouchableOpacity style={styles.clearButton} onPress={clearAffirmations}>
                <Text style={styles.clearButtonText}>Clear Affirmations</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.homeButton, { marginBottom: 8 }]} onPress={() => setShowHistory(true)}>
              <Text style={styles.homeButtonText}>✦ Affirmation History</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/mind")}>
              <Text style={styles.homeButtonText}>← Back to Mind Hub</Text>
            </TouchableOpacity>
          </FormScreen>

          <HistoryModal
            visible={showHistory}
            onClose={() => setShowHistory(false)}
            title="Affirmation History"
            storageKey={AFFIRMATIONS_KEY}
            normalize={normalizeAffirmationLogs}
            accent="#C4A7FF"
          />

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Affirmations Work"
            bullets={LUNA_AFFIRMATIONS_BULLETS}
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
  saveButton: {
    backgroundColor: "#A78BFA",
    borderWidth: 3,
    borderColor: "#E9D5FF",
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonDisabled: {
    backgroundColor: "#5C4425",
    borderColor: "#475569",
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
  entryDate: {
    color: "#7C5B2B",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
  },
  entryText: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
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
});
