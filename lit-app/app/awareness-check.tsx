import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

import { GuideInfoModal } from "../components/GuideInfoModal";
import { uiAssets } from "../constants/uiAssets";

const LUNA_MEDITATIONS_BULLETS = [
  "Meditation/Awareness is for grounding and attention — not traditional seated meditation.",
  "Name where focus went, what pulled it away, and what helped you return.",
  "Honest answers are more useful than perfect ones.",
  "Patterns in what pulls you away reveal important data about your environment.",
  "Use this after a work session, before bed, or any time you want clarity.",
];

type AwarenessCheck = {
  id: string;
  attentionFocus: string;
  automaticOrIntentional: "Mostly automatic" | "Mixed" | "Mostly intentional";
  pulledAway: string;
  broughtBack: string;
  presentMoment: string;
  createdAt: string;
};

const AWARENESS_CHECKS_KEY = "lit_awareness_checks";
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function AwarenessCheckScreen() {
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const [attentionFocus, setAttentionFocus] = useState("");
  const [automaticOrIntentional, setAutomaticOrIntentional] =
    useState<"Mostly automatic" | "Mixed" | "Mostly intentional">("Mixed");
  const [pulledAway, setPulledAway] = useState("");
  const [broughtBack, setBroughtBack] = useState("");
  const [checks, setChecks] = useState<AwarenessCheck[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  const safeViewportWidth = Math.max(0, viewportWidth - 24);
  const safeViewportHeight = Math.max(0, viewportHeight - 24);
  const frameWidth = Math.min(
    MAX_FRAME_WIDTH,
    safeViewportWidth,
    safeViewportHeight * APP_FRAME_ASPECT_RATIO
  );
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

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
    const hasEntry = attentionFocus.trim() || pulledAway.trim() || broughtBack.trim();

    if (!hasEntry) return;

    const newCheck: AwarenessCheck = {
      id: String(Date.now()),
      attentionFocus: attentionFocus.trim(),
      automaticOrIntentional,
      pulledAway: pulledAway.trim(),
      broughtBack: broughtBack.trim(),
      presentMoment: "",
      createdAt: new Date().toLocaleString(),
    };

    const nextChecks = [newCheck, ...checks];

    setChecks(nextChecks);
    await AsyncStorage.setItem(AWARENESS_CHECKS_KEY, JSON.stringify(nextChecks));

    setAttentionFocus("");
    setAutomaticOrIntentional("Mixed");
    setPulledAway("");
    setBroughtBack("");

    await successHaptic();
  }

  async function clearChecks() {
    setChecks([]);
    await AsyncStorage.setItem(AWARENESS_CHECKS_KEY, JSON.stringify([]));
  }

  const intentionOptions: AwarenessCheck["automaticOrIntentional"][] = [
    "Mostly automatic",
    "Mixed",
    "Mostly intentional",
  ];

  return (
    <View style={styles.pageRoot}>
      <View style={[styles.phoneStage, { width: frameWidth, height: frameHeight }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView
            style={styles.screenScroller}
            contentContainerStyle={styles.hudContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
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
              <Text style={styles.label}>Where did your attention go today?</Text>
              <TextInput
                style={styles.largeTextArea}
                multiline
                textAlignVertical="top"
                placeholder="School, work, your phone, stress, a person, a goal, or just getting through the day."
                placeholderTextColor="#94A3B8"
                value={attentionFocus}
                onChangeText={setAttentionFocus}
              />

              <Text style={styles.label}>How did it feel?</Text>
              <View style={styles.optionRow}>
                {intentionOptions.map((option) => {
                  const isSelected = automaticOrIntentional === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.option, isSelected && styles.selectedOption]}
                      onPress={() => setAutomaticOrIntentional(option)}
                    >
                      <Text style={isSelected ? styles.selectedOptionText : styles.optionText}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>What pulled you away?</Text>
              <TextInput
                style={styles.largeTextArea}
                multiline
                textAlignVertical="top"
                placeholder="Scrolling, stress, tiredness, comparison, overthinking, or not knowing where to start."
                placeholderTextColor="#94A3B8"
                value={pulledAway}
                onChangeText={setPulledAway}
              />

              <Text style={styles.label}>What helped you come back?</Text>
              <TextInput
                style={styles.largeTextArea}
                multiline
                textAlignVertical="top"
                placeholder="A reminder, a person, music, journaling, a walk, or one small task."
                placeholderTextColor="#94A3B8"
                value={broughtBack}
                onChangeText={setBroughtBack}
              />

              <TouchableOpacity style={styles.saveButton} onPress={saveAwarenessCheck}>
                <Text style={styles.saveButtonText}>Save Meditation</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>RECENT MEDITATIONS</Text>

            {checks.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No meditations yet. Start with one honest observation.</Text>
              </View>
            ) : (
              checks.map((check) => (
                <View key={check.id} style={styles.entryCard}>
                  <Text style={styles.entryTitle}>{check.automaticOrIntentional}</Text>
                  <Text style={styles.entryDate}>{check.createdAt}</Text>

                  {check.attentionFocus ? (
                    <Text style={styles.entryText}>Attention: {check.attentionFocus}</Text>
                  ) : null}

                  {check.pulledAway ? (
                    <Text style={styles.entryText}>Pulled away: {check.pulledAway}</Text>
                  ) : null}

                  {check.broughtBack ? (
                    <Text style={styles.entryText}>Came back: {check.broughtBack}</Text>
                  ) : null}
                </View>
              ))
            )}

            {checks.length > 0 && (
              <TouchableOpacity style={styles.clearButton} onPress={clearChecks}>
                <Text style={styles.clearButtonText}>Clear Meditations</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/mind")}>
              <Text style={styles.homeButtonText}>← Back to Mind Hub</Text>
            </TouchableOpacity>
          </ScrollView>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Meditations Work"
            bullets={LUNA_MEDITATIONS_BULLETS}
            accentColor="#C4A7FF"
          />

          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}>
              <Text style={styles.navText}>🏠</Text>
              <Text style={styles.navLabel}>HOME</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/sleep")}>
              <Text style={styles.navText}>🌙</Text>
              <Text style={styles.navLabel}>SLEEP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={() => router.push("/mind")}>
              <Text style={styles.navTextActive}>🧠</Text>
              <Text style={styles.navLabelActive}>MIND</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/path")}>
              <Text style={styles.navText}>🌲</Text>
              <Text style={styles.navLabel}>PATH</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/calendar")}>
              <Text style={styles.navText}>📅</Text>
              <Text style={styles.navLabel}>CAL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/stats")}>
              <Text style={styles.navText}>🎒</Text>
              <Text style={styles.navLabel}>BAG</Text>
            </TouchableOpacity>
          </View>
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
    borderColor: "rgba(251, 191, 36, 0.64)",
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
    backgroundColor: "rgba(4, 8, 14, 0.16)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 24,
    paddingHorizontal: 14,
    paddingBottom: 82,
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
  heroLabel: {
    color: "#C4A7FF",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 38,
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
  card: {
    backgroundColor: "rgba(8, 13, 24, 0.96)",
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
    minHeight: 118,
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 6,
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    padding: 12,
  },
  optionRow: {
    gap: 8,
  },
  option: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 2,
    borderColor: "#334155",
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
    backgroundColor: "#A78BFA",
    borderWidth: 3,
    borderColor: "#E9D5FF",
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
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
  entryTitle: {
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
  },
  clearButtonText: {
    color: "#FECACA",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  homeButton: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 2,
    borderColor: "#334155",
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