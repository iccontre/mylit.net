import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
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

const LUNA_PRE_SLEEP_BULLETS = [
  "Write one intention before sleep to prime tomorrow's mindset.",
  "Pick a Feeling to clarify what state you want to wake up in.",
  "Pick a Support option to give yourself a simple wind-down anchor for tonight.",
  "Saving a complete intention earns +1 step.",
  "Your intention appears in Morning Reflection the next day.",
  "You do not need to force anything — one clear direction is enough.",
];

type PreSleepIntention = {
  id: string;
  date: string;
  intention: string;
  feeling: string;
  support: string[];
  createdAt: string;
};

const PRE_SLEEP_INTENTIONS_KEY = "lit_pre_sleep_intentions";
const LATEST_PRE_SLEEP_INTENTION_KEY = "lit_latest_pre_sleep_intention";
const USER_STATS_KEY = "lit_user_stats";

const FEELING_OPTIONS = ["Focused", "Energized", "Calm", "Grounded", "Rested", "Brave", "Gentle", "Steady"];
const SUPPORT_OPTIONS = ["No screens", "Gratitude", "Breathe", "Let go", "Sleep early"];
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

const theme = { accent: "#C4A7FF", glow: "#E9D5FF", panel: "rgba(18, 16, 34, 0.94)", soft: "#DDD6FE" };

export default function PreSleepIntentionScreen() {
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const [intention, setIntention] = useState("");
  const [feeling, setFeeling] = useState("");
  const [support, setSupport] = useState<string[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  const safeViewportWidth = Math.max(0, viewportWidth - 24);
  const safeViewportHeight = Math.max(0, viewportHeight - 24);
  const frameWidth = Math.min(MAX_FRAME_WIDTH, safeViewportWidth, safeViewportHeight * APP_FRAME_ASPECT_RATIO);
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function earnSteps(count: number) {
    const saved = await AsyncStorage.getItem(USER_STATS_KEY);
    const current: Record<string, unknown> = saved ? JSON.parse(saved) : {};
    await AsyncStorage.setItem(USER_STATS_KEY, JSON.stringify({ ...current, totalSteps: Number(current.totalSteps ?? 0) + count }));
  }

  async function saveIntention() {
    if (!intention.trim()) return;

    const entry: PreSleepIntention = {
      id: String(Date.now()),
      date: getTodayKey(),
      intention: intention.trim(),
      feeling,
      support,
      createdAt: new Date().toISOString(),
    };

    const saved = await AsyncStorage.getItem(PRE_SLEEP_INTENTIONS_KEY);
    const history: PreSleepIntention[] = saved ? JSON.parse(saved) : [];

    await AsyncStorage.setItem(PRE_SLEEP_INTENTIONS_KEY, JSON.stringify([entry, ...history]));
    await AsyncStorage.setItem(LATEST_PRE_SLEEP_INTENTION_KEY, JSON.stringify(entry));
    await earnSteps(1);
    await successHaptic();

    router.push("/");
  }

  function toggleSupport(option: string) {
    setSupport((prev) => prev.includes(option) ? prev.filter((s) => s !== option) : [...prev, option]);
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
                  <Text style={[styles.heroKicker, { color: theme.glow }]}>SLEEP HUB</Text>
                  <Text style={styles.title}>PRE-SLEEP INTENTION</Text>
                  <Text style={[styles.subtitle, { color: theme.soft }]}>Set one signal for tomorrow.</Text>
                </View>
                <Image source={uiAssets.guides.luna} style={[styles.guideAvatar, { borderColor: theme.accent }]} resizeMode="contain" />
              </View>
            </View>

            <View style={[styles.lunaCard, { borderColor: theme.accent }]}>
              <View style={styles.lunaCardHeader}>
                <Text style={[styles.lunaName, { color: theme.glow }]}>🌙 Luna</Text>
                <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                  <Text style={styles.infoBtnText}>?</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.lunaText}>Setting an intention before sleep helps program tomorrow's mindset. One clear direction is enough — the mind works on it while you rest.</Text>
            </View>

            <View style={[styles.formCard, { borderColor: theme.accent }]}>
              <Text style={styles.label}>What do you want to carry into tomorrow?</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="Example: I want to feel calm and make progress on my work."
                placeholderTextColor="#94A3B8"
                value={intention}
                onChangeText={setIntention}
              />

              <Text style={styles.label}>How do you want to feel?</Text>
              <View style={styles.chipRow}>
                {FEELING_OPTIONS.map((opt) => {
                  const selected = feeling === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, selected && { backgroundColor: "rgba(49, 46, 129, 0.94)", borderColor: theme.accent }]}
                      onPress={() => setFeeling(selected ? "" : opt)}
                    >
                      <Text style={selected ? [styles.chipText, { color: theme.glow }] : styles.chipText}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>What will support your sleep tonight?</Text>
              <View style={styles.chipRow}>
                {SUPPORT_OPTIONS.map((opt) => {
                  const selected = support.includes(opt);
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, selected && { backgroundColor: "rgba(49, 46, 129, 0.94)", borderColor: theme.accent }]}
                      onPress={() => toggleSupport(opt)}
                    >
                      <Text style={selected ? [styles.chipText, { color: theme.glow }] : styles.chipText}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={[styles.saveButton, { borderColor: theme.accent }]} onPress={saveIntention}>
                <Text style={styles.saveButtonText}>Save Intention · +1 Step</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/sleep")}>
              <Text style={styles.backButtonText}>Back to Sleep Hub</Text>
            </TouchableOpacity>
          </ScrollView>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Pre-Sleep Intention Works"
            bullets={LUNA_PRE_SLEEP_BULLETS}
            accentColor="#C4A7FF"
          />
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
  lunaCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  infoBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#A78BFA",
    backgroundColor: "rgba(49,46,129,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoBtnText: {
    color: "#C4A7FF",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
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
    paddingHorizontal: 11,
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