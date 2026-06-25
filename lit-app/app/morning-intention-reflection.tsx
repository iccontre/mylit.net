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

type PreSleepIntention = {
  id: string;
  date: string;
  intention: string;
  whyItMatters: string;
  firstSmallAction: string;
  dreamSymbol: string;
  createdAt: string;
};

type MorningIntentionReflection = {
  id: string;
  intentionId: string;
  date: string;
  recallType: string;
  reflectionText: string;
  todayAction: string;
  createdAt: string;
};

type CheckIn = {
  energy: number;
  mode: "Recovery" | "Progress";
  createdAt?: string;
};

type ModeState = "Recovery" | "Progress" | "Neutral";

const LATEST_PRE_SLEEP_INTENTION_KEY = "lit_latest_pre_sleep_intention";
const MORNING_INTENTION_REFLECTIONS_KEY = "lit_morning_intention_reflections";
const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
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

export default function MorningIntentionReflectionScreen() {
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const [latestIntention, setLatestIntention] = useState<PreSleepIntention | null>(null);
  const [currentMode, setCurrentMode] = useState<ModeState>("Neutral");
  const [recallType, setRecallType] = useState("I do not remember");
  const [reflectionText, setReflectionText] = useState("");
  const [todayAction, setTodayAction] = useState("");

  const recallOptions = [
    "In a dream",
    "In my thoughts",
    "I felt more focused",
    "Not really",
    "I do not remember",
  ];

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
      loadLatestIntention();
      loadLatestMode();
    }, [])
  );

  async function loadLatestIntention() {
    const saved = await AsyncStorage.getItem(LATEST_PRE_SLEEP_INTENTION_KEY);

    if (saved) {
      const parsed: PreSleepIntention = JSON.parse(saved);
      setLatestIntention(parsed);
      setTodayAction("");
    } else {
      setLatestIntention(null);
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

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function saveReflection() {
    if (!latestIntention) return;

    const reflection: MorningIntentionReflection = {
      id: String(Date.now()),
      intentionId: latestIntention.id,
      date: getTodayKey(),
      recallType,
      reflectionText: reflectionText.trim(),
      todayAction: todayAction.trim(),
      createdAt: new Date().toISOString(),
    };

    const saved = await AsyncStorage.getItem(MORNING_INTENTION_REFLECTIONS_KEY);
    const history: MorningIntentionReflection[] = saved ? JSON.parse(saved) : [];
    const nextHistory = [reflection, ...history];

    await AsyncStorage.setItem(MORNING_INTENTION_REFLECTIONS_KEY, JSON.stringify(nextHistory));

    if (todayAction.trim()) {
      const savedQueue = await AsyncStorage.getItem(TOMORROW_QUEUE_KEY);
      const queue = savedQueue ? JSON.parse(savedQueue) : [];

      const suggestedAction = {
        text: todayAction.trim(),
        type: "Intention Action",
      };

      await AsyncStorage.setItem(TOMORROW_QUEUE_KEY, JSON.stringify([suggestedAction, ...queue]));
    }

    await successHaptic();

    router.push("/");
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
                  <Text style={[styles.heroKicker, { color: theme.glow }]}>SUNRISE HUD</Text>
                  <Text style={styles.title}>MORNING REFLECTION</Text>
                  <Text style={[styles.subtitle, { color: theme.soft }]}>Review the signal from last night.</Text>
                </View>
                <Image source={isProgress ? uiAssets.guides.evie : uiAssets.guides.luna} style={[styles.guideAvatar, { borderColor: theme.accent }]} resizeMode="contain" />
              </View>
            </View>

            {!latestIntention ? (
              <View style={[styles.emptyCard, { borderColor: theme.accent }]}>
                <Text style={[styles.emptyTitle, { color: theme.glow }]}>NO SIGNAL SAVED</Text>
                <Text style={styles.emptyText}>Set a pre-sleep intention tonight, then return here tomorrow morning.</Text>
                <TouchableOpacity style={[styles.primaryButton, { borderColor: theme.accent }]} onPress={() => router.push("/pre-sleep-intention")}>
                  <Text style={styles.primaryButtonText}>Set Pre-Sleep Intention</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={[styles.signalCard, { borderColor: theme.accent }]}>
                  <Text style={[styles.sectionTitle, { color: theme.glow }]}>LAST NIGHT’S SIGNAL</Text>
                  <Text style={styles.intentionText}>{latestIntention.intention}</Text>

                  {latestIntention.whyItMatters ? <Text style={styles.supportingText}>Why it matters: {latestIntention.whyItMatters}</Text> : null}
                  {latestIntention.firstSmallAction ? <Text style={styles.supportingText}>First small action: {latestIntention.firstSmallAction}</Text> : null}
                  {latestIntention.dreamSymbol ? <Text style={styles.supportingText}>Dream symbol: {latestIntention.dreamSymbol}</Text> : null}
                </View>

                <View style={[styles.panel, { borderColor: theme.accent }]}>
                  <Text style={styles.label}>Did this show up in your thoughts, dreams, mood, or motivation?</Text>

                  <View style={styles.optionWrap}>
                    {recallOptions.map((option) => {
                      const isSelected = recallType === option;

                      return (
                        <TouchableOpacity key={option} style={[styles.option, isSelected && { backgroundColor: theme.active, borderColor: theme.accent }]} onPress={() => setRecallType(option)}>
                          <Text style={isSelected ? [styles.optionSelectedText, { color: theme.glow }] : styles.optionText}>{option}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Reflection</Text>
                  <TextInput style={styles.textArea} multiline placeholder="Write what you noticed this morning." placeholderTextColor="#94A3B8" value={reflectionText} onChangeText={setReflectionText} />
                </View>

                <View style={[styles.panel, { borderColor: theme.accent }]}>
                  <Text style={styles.label}>What is one small action you can take today based on this intention?</Text>

                  {latestIntention.firstSmallAction ? (
                    <View style={styles.suggestionBox}>
                      <Text style={[styles.suggestionLabel, { color: theme.glow }]}>Suggested action</Text>
                      <Text style={styles.suggestionText}>{latestIntention.firstSmallAction}</Text>
                      <TouchableOpacity style={[styles.useSuggestionButton, { borderColor: theme.accent }]} onPress={() => setTodayAction(latestIntention.firstSmallAction)}>
                        <Text style={styles.useSuggestionButtonText}>Use This Action</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <TextInput style={styles.textArea} multiline placeholder="Write one small action for today." placeholderTextColor="#94A3B8" value={todayAction} onChangeText={setTodayAction} />

                  <Text style={styles.helperText}>Saving this will also add the action to your Tomorrow Queue as an Intention Action.</Text>
                </View>

                <TouchableOpacity style={[styles.saveButton, { borderColor: theme.accent }]} onPress={saveReflection}>
                  <Text style={styles.saveButtonText}>Save Reflection</Text>
                </TouchableOpacity>
              </>
            )}

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
    backgroundColor: "rgba(2, 6, 12, 0.14)",
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
    fontSize: 24,
    fontWeight: "900",
    color: "#F9FAFB",
    lineHeight: 30,
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
  emptyCard: {
    backgroundColor: "rgba(8, 13, 24, 0.96)",
    borderRadius: 6,
    borderWidth: 3,
    padding: 14,
    marginBottom: 10,
  },
  emptyTitle: {
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 7,
  },
  emptyText: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  signalCard: {
    backgroundColor: "rgba(6, 10, 18, 0.96)",
    borderRadius: 6,
    borderWidth: 3,
    padding: 13,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  intentionText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
    marginBottom: 8,
  },
  supportingText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  panel: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderRadius: 6,
    borderWidth: 3,
    padding: 13,
    marginBottom: 10,
  },
  label: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    color: "#E5E7EB",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    lineHeight: 16,
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  option: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#334155",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optionText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
  },
  optionSelectedText: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
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
  suggestionBox: {
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#334155",
    padding: 10,
    marginBottom: 10,
  },
  suggestionLabel: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  suggestionText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  useSuggestionButton: {
    backgroundColor: "#111827",
    borderRadius: 4,
    borderWidth: 2,
    paddingVertical: 8,
    alignItems: "center",
    marginTop: 8,
  },
  useSuggestionButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  helperText: {
    color: "#94A3B8",
    fontFamily: pixelFont,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: "#111827",
    padding: 13,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 3,
    marginTop: 12,
  },
  primaryButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  saveButton: {
    backgroundColor: "#312E81",
    padding: 14,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 3,
    marginBottom: 10,
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
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
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
});