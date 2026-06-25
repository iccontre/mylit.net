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

type CheckIn = {
  energy: number;
  mode: "Recovery" | "Progress";
  createdAt?: string;
};

type ModeState = "Recovery" | "Progress" | "Neutral";

const PRE_SLEEP_INTENTIONS_KEY = "lit_pre_sleep_intentions";
const LATEST_PRE_SLEEP_INTENTION_KEY = "lit_latest_pre_sleep_intention";
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

export default function PreSleepIntentionScreen() {
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const [intention, setIntention] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [firstSmallAction, setFirstSmallAction] = useState("");
  const [dreamSymbol, setDreamSymbol] = useState("");
  const [currentMode, setCurrentMode] = useState<ModeState>("Neutral");

  const safeViewportWidth = Math.max(0, viewportWidth - 24);
  const safeViewportHeight = Math.max(0, viewportHeight - 24);
  const frameWidth = Math.min(MAX_FRAME_WIDTH, safeViewportWidth, safeViewportHeight * APP_FRAME_ASPECT_RATIO);
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

  const isProgress = currentMode === "Progress";
  const currentBackground = currentMode === "Recovery"
    ? uiAssets.backgrounds.recovery
    : isProgress
      ? uiAssets.backgrounds.progress
      : uiAssets.backgrounds.neutral;

  const theme = isProgress
    ? { accent: "#FBBF24", glow: "#FEF3C7", panel: "rgba(18, 16, 12, 0.94)", soft: "#FDE68A" }
    : { accent: "#C4A7FF", glow: "#E9D5FF", panel: "rgba(18, 16, 34, 0.94)", soft: "#DDD6FE" };

  useFocusEffect(
    useCallback(() => {
      loadLatestMode();
    }, [])
  );

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

  async function saveIntention() {
    if (!intention.trim()) return;

    const entry: PreSleepIntention = {
      id: String(Date.now()),
      date: getTodayKey(),
      intention: intention.trim(),
      whyItMatters: whyItMatters.trim(),
      firstSmallAction: firstSmallAction.trim(),
      dreamSymbol: dreamSymbol.trim(),
      createdAt: new Date().toISOString(),
    };

    const saved = await AsyncStorage.getItem(PRE_SLEEP_INTENTIONS_KEY);
    const history: PreSleepIntention[] = saved ? JSON.parse(saved) : [];

    const nextHistory = [entry, ...history];

    await AsyncStorage.setItem(PRE_SLEEP_INTENTIONS_KEY, JSON.stringify(nextHistory));
    await AsyncStorage.setItem(LATEST_PRE_SLEEP_INTENTION_KEY, JSON.stringify(entry));

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
                  <Text style={[styles.heroKicker, { color: theme.glow }]}>NIGHT HUD</Text>
                  <Text style={styles.title}>PRE-SLEEP INTENTION</Text>
                  <Text style={[styles.subtitle, { color: theme.soft }]}>Set one signal for tomorrow.</Text>
                </View>
                <Image source={uiAssets.guides.luna} style={[styles.guideAvatar, { borderColor: theme.accent }]} resizeMode="contain" />
              </View>
            </View>

            <View style={[styles.lunaCard, { borderColor: theme.accent }]}>
              <Text style={[styles.lunaName, { color: theme.glow }]}>🌙 Luna</Text>
              <Text style={styles.lunaText}>This is not about forcing a dream. Set one clear direction and notice what carries into morning.</Text>
            </View>

            <View style={[styles.formCard, { borderColor: theme.accent }]}>
              <Text style={styles.label}>What is one thing you want to prioritize tomorrow?</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="Example: I want to focus on finishing my assignment."
                placeholderTextColor="#94A3B8"
                value={intention}
                onChangeText={setIntention}
              />

              <Text style={styles.label}>Why does this matter to you?</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="Example: It helps me feel less behind and more confident."
                placeholderTextColor="#94A3B8"
                value={whyItMatters}
                onChangeText={setWhyItMatters}
              />

              <Text style={styles.label}>What is the first small action you can take tomorrow?</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="Example: Open the document and write for 10 minutes."
                placeholderTextColor="#94A3B8"
                value={firstSmallAction}
                onChangeText={setFirstSmallAction}
              />

              <Text style={styles.label}>If this showed up in a dream, what image, symbol, or scene might represent it?</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="Example: A sunrise, a locked door opening, a desk, a path, a mountain."
                placeholderTextColor="#94A3B8"
                value={dreamSymbol}
                onChangeText={setDreamSymbol}
              />

              <TouchableOpacity style={[styles.saveButton, { borderColor: theme.accent }]} onPress={saveIntention}>
                <Text style={styles.saveButtonText}>Save Intention</Text>
              </TouchableOpacity>
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
    fontSize: 24,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 6,
    lineHeight: 30,
  },
  subtitle: {
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "900",
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
  textArea: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    padding: 12,
    minHeight: 78,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 6,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#475569",
    fontFamily: pixelFont,
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