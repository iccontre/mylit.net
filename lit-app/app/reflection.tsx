import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
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

import { uiAssets } from "../constants/uiAssets";

type ReflectionEntry = {
  id: string;
  quest: string;
  whatGotInTheWay: string;
  whatWasOff: string;
  smallerVersion: string;
  nextTry: string;
  createdAt: string;
};

const REFLECTIONS_KEY = "lit_reflections";
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function ReflectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const rawQuest = Array.isArray(params.quest) ? params.quest[0] : params.quest;
  const quest = rawQuest || "Open reflection";

  const [whatGotInTheWay, setWhatGotInTheWay] = useState("");
  const [whatWasOff, setWhatWasOff] = useState("");
  const [smallerVersion, setSmallerVersion] = useState("");

  const safeViewportWidth = Math.max(0, viewportWidth - 24);
  const safeViewportHeight = Math.max(0, viewportHeight - 24);
  const frameWidth = Math.min(
    MAX_FRAME_WIDTH,
    safeViewportWidth,
    safeViewportHeight * APP_FRAME_ASPECT_RATIO
  );
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

  async function saveReflection() {
    const newEntry: ReflectionEntry = {
      id: String(Date.now()),
      quest,
      whatGotInTheWay: whatGotInTheWay.trim(),
      whatWasOff: whatWasOff.trim(),
      smallerVersion: smallerVersion.trim(),
      nextTry: smallerVersion.trim(),
      createdAt: new Date().toISOString(),
    };

    const saved = await AsyncStorage.getItem(REFLECTIONS_KEY);
    const parsed: ReflectionEntry[] = saved ? JSON.parse(saved) : [];
    const next = [newEntry, ...parsed];

    await AsyncStorage.setItem(REFLECTIONS_KEY, JSON.stringify(next));
    router.push("/");
  }

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
              <Text style={styles.heroLabel}>QUEST REFLECTION</Text>
              <Text style={styles.heroTitle}>REFLECT, DON’T JUDGE</Text>
              <Text style={styles.heroSubtitle}>Missed goals are data, not defeat.</Text>
            </View>

            <View style={styles.lunaCard}>
              <Image source={uiAssets.guides.luna} style={styles.lunaAvatar} resizeMode="contain" />
              <View style={styles.lunaCopy}>
                <Text style={styles.lunaName}>Luna</Text>
                <Text style={styles.lunaText}>
                  You are not explaining failure. You are learning what the next step should look like.
                </Text>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>QUEST</Text>
              <Text style={styles.questText}>{quest}</Text>

              <Text style={styles.label}>What got in the way?</Text>
              <TextInput
                style={styles.textArea}
                multiline
                textAlignVertical="top"
                placeholder="Energy, timing, stress, distraction, fear, or something else."
                placeholderTextColor="#94A3B8"
                value={whatGotInTheWay}
                onChangeText={setWhatGotInTheWay}
              />

              <Text style={styles.label}>Was the step too big?</Text>
              <TextInput
                style={styles.textArea}
                multiline
                textAlignVertical="top"
                placeholder="What made it hard to start or finish?"
                placeholderTextColor="#94A3B8"
                value={whatWasOff}
                onChangeText={setWhatWasOff}
              />

              <Text style={styles.label}>What is the smaller next step?</Text>
              <TextInput
                style={styles.textArea}
                multiline
                textAlignVertical="top"
                placeholder="Make it easier, clearer, or better timed."
                placeholderTextColor="#94A3B8"
                value={smallerVersion}
                onChangeText={setSmallerVersion}
              />
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={saveReflection}>
              <Text style={styles.primaryText}>Save Reflection</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push("/")}>
              <Text style={styles.secondaryText}>Back to Today</Text>
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
    paddingBottom: 24,
  },
  hero: {
    backgroundColor: "rgba(8, 13, 24, 0.96)",
    borderWidth: 4,
    borderColor: "#FBBF24",
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
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.3,
    marginBottom: 8,
  },
  heroTitle: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 34,
  },
  heroSubtitle: {
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "800",
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
    backgroundColor: "rgba(31, 27, 75, 0.95)",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  sectionLabel: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "900",
  },
  questText: {
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 6,
    marginBottom: 10,
    lineHeight: 19,
  },
  label: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 12,
    marginBottom: 8,
  },
  textArea: {
    minHeight: 112,
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 6,
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    padding: 12,
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: "#FBBF24",
    borderWidth: 3,
    borderColor: "#92400E",
    borderRadius: 6,
    alignItems: "center",
    paddingVertical: 14,
    marginBottom: 10,
  },
  primaryText: {
    color: "#111827",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  secondaryBtn: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    alignItems: "center",
    paddingVertical: 13,
  },
  secondaryText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
});