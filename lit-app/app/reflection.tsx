import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
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
import { GuideInfoModal } from "../components/GuideInfoModal";
import { formStyles } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";

const LUNA_REFLECTION_BULLETS = [
  "Reflection helps process missed or completed quests — it is not self-criticism.",
  "Missed quests are information about what the step actually needed.",
  "Ask what got in the way before asking what to do differently.",
  "The smaller next step field is the most important — make the quest easier to start.",
  "Saving a reflection earns steps. Honest entries are progress, even about hard moments.",
];

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

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function ReflectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mobile = useMobileFrame();

  const rawQuest = Array.isArray(params.quest) ? params.quest[0] : params.quest;
  const quest = rawQuest || "Open reflection";

  const [showInfo, setShowInfo] = useState(false);
  const [whatGotInTheWay, setWhatGotInTheWay] = useState("");
  const [whatWasOff, setWhatWasOff] = useState("");
  const [smallerVersion, setSmallerVersion] = useState("");

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
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.phoneStageStyle, mobile.isFullscreen && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={styles.hudContent}>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>MIND HUB</Text>
              <Text style={[styles.heroTitle, { fontSize: 34, letterSpacing: 3 }]}>REFLECTION</Text>
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
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.questCard}>
              <Text style={styles.sectionLabel}>QUEST</Text>
              <Text style={styles.questText}>{quest}</Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.label}>What got in the way?</Text>
              <TextInput
                style={[formStyles.textArea, styles.textArea]}
                multiline
                scrollEnabled
                textAlignVertical="top"
                placeholder="Energy, timing, stress, distraction, fear, or something else."
                placeholderTextColor="#94A3B8"
                value={whatGotInTheWay}
                onChangeText={setWhatGotInTheWay}
              />

              <Text style={styles.label}>Was the step too big?</Text>
              <TextInput
                style={[formStyles.textArea, styles.textArea]}
                multiline
                scrollEnabled
                textAlignVertical="top"
                placeholder="What made it hard to start or finish?"
                placeholderTextColor="#94A3B8"
                value={whatWasOff}
                onChangeText={setWhatWasOff}
              />

              <Text style={styles.label}>What is the smaller next step?</Text>
              <TextInput
                style={[formStyles.textArea, styles.textArea]}
                multiline
                scrollEnabled
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

            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push("/mind")}>
              <Text style={styles.secondaryText}>← Back to Mind Hub</Text>
            </TouchableOpacity>
          </FormScreen>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Reflection Works"
            bullets={LUNA_REFLECTION_BULLETS}
            accentColor="#C4A7FF"
          />

          <View style={[styles.bottomNav, { bottom: mobile.bottomNavOffset }]}>
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
    flexGrow: 1,
    paddingTop: 24,
    paddingHorizontal: 14,
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
  questCard: {
    backgroundColor: "rgba(31, 27, 75, 0.95)",
    borderWidth: 3,
    borderColor: "#FDE68A",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  panel: {
    backgroundColor: "rgba(8, 13, 24, 0.96)",
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
    borderColor: "#A78BFA",
    marginBottom: 4,
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