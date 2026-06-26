import { useRouter } from "expo-router";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { uiAssets } from "../constants/uiAssets";

const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;

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
  route: "/journal" | "/awareness-check" | "/reflection";
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
    title: "Reflect, Don’t Judge",
    description: "Use reflection to learn from missed quests.",
    buttonText: "Open Reflection",
    icon: "🪞",
    route: "/reflection",
  },
];

export default function MindScreen() {
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const safeViewportWidth = Math.max(0, viewportWidth - 24);
  const safeViewportHeight = Math.max(0, viewportHeight - 24);
  const frameWidth = Math.min(
    MAX_FRAME_WIDTH,
    safeViewportWidth,
    safeViewportHeight * APP_FRAME_ASPECT_RATIO
  );
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

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
              <Text style={styles.heroLabel}>+ MIND HUB +</Text>
              <Text style={styles.title}>MIND</Text>
              <Text style={styles.subtitle}>Write what happened. Notice what pulled you away.</Text>
            </View>

            <View style={styles.mindBriefCard}>
              <View style={styles.briefHeaderRow}>
                <Text style={styles.briefTitle}>MIND BRIEF</Text>
                <Text style={styles.briefMark}>✦</Text>
              </View>
              <Text style={styles.briefText}>
                Keep it simple. One honest note can change how the day feels.
              </Text>
            </View>

            <View style={styles.cardStack}>{MIND_CARDS.map(renderMindCard)}</View>
          </ScrollView>

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
    backgroundColor: "rgba(4, 8, 14, 0.12)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 28,
    paddingHorizontal: 14,
    paddingBottom: 82,
  },
  hero: {
    width: "82%",
    alignSelf: "center",
    backgroundColor: "rgba(7, 11, 27, 0.94)",
    borderWidth: 4,
    borderColor: "#8B5CF6",
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 34,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  heroLabel: {
    color: "#C084FC",
    fontFamily: pixelFont,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "900",
    marginBottom: 7,
    textTransform: "uppercase",
  },
  title: {
    color: "#E9D5FF",
    fontFamily: pixelFont,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 5,
    lineHeight: 44,
    textShadowColor: "#000",
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  subtitle: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
    fontWeight: "800",
  },
  mindBriefCard: {
    backgroundColor: "rgba(7, 11, 27, 0.94)",
    borderWidth: 4,
    borderColor: "#A78BFA",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 22,
    shadowColor: "#000",
    shadowOpacity: 0.68,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  briefHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(251, 191, 36, 0.32)",
    paddingBottom: 8,
    marginBottom: 9,
  },
  briefTitle: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  briefMark: {
    color: "#C084FC",
    fontSize: 18,
    fontWeight: "900",
  },
  briefText: {
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "800",
  },
  cardStack: {
    gap: 16,
  },
  card: {
    backgroundColor: "rgba(7, 11, 27, 0.95)",
    borderWidth: 3,
    borderColor: "#8B5CF6",
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
    backgroundColor: "rgba(49, 46, 129, 0.68)",
    borderWidth: 2,
    borderColor: "#4C1D95",
    borderRadius: 5,
    marginRight: 12,
  },
  cardIcon: {
    fontSize: 34,
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: "#F5F3FF",
    fontFamily: pixelFont,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 25,
  },
  cardText: {
    color: "#EDE9FE",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    fontWeight: "700",
  },
  cardDivider: {
    height: 2,
    backgroundColor: "rgba(251, 191, 36, 0.28)",
    marginVertical: 11,
  },
  actionButton: {
    minHeight: 38,
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionText: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  actionArrow: {
    color: "#C084FC",
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
    borderColor: "#FBBF24",
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
    borderColor: "#FBBF24",
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