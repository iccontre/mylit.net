import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { BottomNav } from "../components/BottomNav";
import { GuideInfoModal } from "../components/GuideInfoModal";
import { GuidePanel } from "../components/parchment/GuidePanel";
import { ParchmentSurface, parchmentTextStyles } from "../components/parchment/ParchmentSurface";
import { WorldChrome } from "../components/parchment/WorldChrome";
import { useMobileFrame } from "../constants/mobileLayout";
import { hubPalettes } from "../constants/worldTokens";
import { uiAssets } from "../constants/uiAssets";

const LUNA_MIND_BULLETS = [
  "Mind tools help you notice patterns without judgment.",
  "Journal is for honest notes and thought patterns — one sentence is enough.",
  "Meditation/Awareness is for grounding and attention, not perfection.",
  "Reflection helps you process missed or completed quests as useful data.",
  "Mind tools are not about being perfect — they are about clarity.",
];

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

type MindCard = {
  title: string;
  description: string;
  buttonText: string;
  icon: string;
  route: "/journal" | "/awareness-check" | "/affirmations" | "/reflection" | "/talk-to-luna";
};

const MIND_CARDS: MindCard[] = [
  {
    title: "Journal",
    description: "Capture the day, mood, and thought patterns.",
    buttonText: "Open Journal",
    icon: "📔",
    route: "/journal",
  },
  {
    title: "Meditations",
    description: "Track attention, distractions, and what brought you back.",
    buttonText: "Open Meditations",
    icon: "🕯️",
    route: "/awareness-check",
  },
  {
    title: "Affirmations",
    description: "Reaffirm yourself when you feel inspired or unmotivated.",
    buttonText: "Open Affirmations",
    icon: "✦",
    route: "/affirmations",
  },
  {
    title: "Reflect, Don’t Judge",
    description: "Use reflection to learn from missed quests.",
    buttonText: "Open Reflection",
    icon: "🪞",
    route: "/reflection",
  },
  {
    title: "Talk to Luna",
    description: "Open Luna when you need support, reflection, or recovery guidance.",
    buttonText: "Talk to Luna about what feels hard",
    icon: "💬",
    route: "/talk-to-luna",
  },
];

const palette = hubPalettes.mind;

export default function MindScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [showInfo, setShowInfo] = useState(false);

  function renderMindCard(card: MindCard) {
    return (
      <ParchmentSurface key={card.title} accent="mind" kicker={`${card.icon}  ${card.title.toUpperCase()}`}>
        <Text style={parchmentTextStyles.body}>{card.description}</Text>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: palette.edge, borderColor: palette.accent }]}
          onPress={() => router.push(card.route)}
        >
          <Text style={styles.actionText}>{card.buttonText.toUpperCase()}</Text>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>
      </ParchmentSurface>
    );
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: palette.edge }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView
            style={styles.screenScroller}
            contentContainerStyle={[styles.hudContent, { paddingBottom: mobile.scrollPaddingBottom }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <WorldChrome hub="mind" kicker="INNER WORLD" title="MIND" subtitle="Write, notice, and reflect — without judgment." style={styles.chrome} />

            <GuidePanel
              hub="mind"
              guideName="Luna"
              guideAvatar={uiAssets.guides.luna}
              message="One honest note can change how the day feels. Start with what is actually true."
              onInfoPress={() => setShowInfo(true)}
            />

            <View style={styles.cardStack}>{MIND_CARDS.map(renderMindCard)}</View>
          </ScrollView>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Mind Hub Works"
            bullets={LUNA_MIND_BULLETS}
            accentColor={palette.accent}
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
    backgroundColor: "rgba(4, 8, 14, 0.12)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    flexGrow: 1,
    paddingTop: 16,
    paddingHorizontal: 14,
  },
  chrome: { marginBottom: 14 },
  cardStack: {
    gap: 12,
    marginTop: 14,
    paddingBottom: 8,
  },
  actionButton: {
    minHeight: 44,
    borderWidth: 3,
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionText: {
    color: "#FFFFFF",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  actionArrow: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
});
