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
import { useMobileFrame } from "../constants/mobileLayout";
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

export default function MindScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [showInfo, setShowInfo] = useState(false);

  function renderMindCard(card: MindCard) {
    return (
      <View key={card.title} style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.iconBox}>
            <Text style={styles.cardIcon}>{card.icon}</Text>
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardText}>{card.description}</Text>
          </View>
        </View>
        <View style={styles.cardDivider} />
        <TouchableOpacity style={styles.actionButton} onPress={() => router.push(card.route)}>
          <Text style={styles.actionText}>{card.buttonText}</Text>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
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
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>MIND HUB</Text>
              <Text style={[styles.title, { fontSize: 34, letterSpacing: 3 }]}>MIND HUB</Text>
              <Text style={styles.subtitle}>Write, notice, and reflect — without judgment.</Text>
            </View>

            <View style={styles.lunaPanel}>
              <Image source={uiAssets.guides.luna} style={styles.lunaAvatar} resizeMode="contain" />
              <View style={styles.lunaCopy}>
                <Text style={styles.lunaText}>
                  One honest note can change how the day feels. Start with what is actually true.
                </Text>
                <Text style={styles.lunaName}>Luna ♥</Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cardStack}>{MIND_CARDS.map(renderMindCard)}</View>
          </ScrollView>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Mind Hub Works"
            bullets={LUNA_MIND_BULLETS}
            accentColor="#C4A7FF"
          />

          <BottomNav activeRoute="mind" theme="purple" bottomOffset={mobile.bottomNavOffset} />
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
    backgroundColor: "rgba(4, 8, 14, 0.12)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    flexGrow: 1,
    paddingTop: 28,
    paddingHorizontal: 14,
  },
  hero: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 34,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.68,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  heroLabel: {
    color: "#7C5B2B",
    fontFamily: pixelFont,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "900",
    marginBottom: 7,
    textTransform: "uppercase",
  },
  title: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 5,
    lineHeight: 44,
    textAlign: "center",
  },
  subtitle: {
    color: "#7C5B2B",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
    fontWeight: "800",
  },
  lunaPanel: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 22,
    shadowColor: "#000",
    shadowOpacity: 0.68,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  lunaAvatar: {
    height: 68,
    width: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: "#5C4425",
    backgroundColor: "#F4E8CE",
    marginRight: 12,
  },
  lunaCopy: {
    flex: 1,
  },
  lunaText: {
    color: "#4A3620",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    fontFamily: pixelFont,
  },
  lunaName: {
    color: "#7C3AED",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 6,
    fontFamily: pixelFont,
  },
  infoBtn: {
    width: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#5C4425",
    backgroundColor: "#F4E8CE",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  infoBtnText: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },
  cardStack: {
    gap: 16,
  },
  card: {
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 8,
    padding: 13,
    shadowColor: "#000",
    shadowOpacity: 0.68,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBox: {
    height: 62,
    width: 62,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4E8CE",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    marginRight: 12,
  },
  cardIcon: {
    fontSize: 34,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 25,
  },
  cardText: {
    color: "#7C5B2B",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    fontWeight: "700",
  },
  cardDivider: {
    height: 2,
    backgroundColor: "rgba(92, 68, 37, 0.3)",
    marginVertical: 11,
  },
  actionButton: {
    minHeight: 38,
    backgroundColor: "#7C3AED",
    borderWidth: 3,
    borderColor: "#4C1D95",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionText: {
    color: "#FFFFFF",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  actionArrow: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 26,
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