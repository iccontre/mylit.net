import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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

const LUNA_SLEEP_HUB_BULLETS = [
  "Sleep is the foundation of your energy mode — rest supports everything else in MYLIT.",
  "Sleep Guide suggestions are not strict rules. They help protect sleep quality.",
  "Caffeine cutoff, screen cutoff, meals, and exercise timing all support better rest.",
  "Pre-Sleep Intention gives your mind one clear signal before bed.",
  "Dream Journal helps you capture dreams quickly after waking — most fade within minutes.",
  "Morning Reflection connects sleep, intention, and the day's energy.",
  "Recovery nights still count. Imperfect sleep is data, not failure.",
];

type DreamEntry = {
  id: string;
  title: string;
  summary: string;
  emotions: string;
  symbols: string;
  lucid: "yes" | "no";
  pattern: string;
  tomorrowIntention?: string;
  createdAt: string;
};

type SleepCard = {
  title: string;
  description: string;
  buttonText: string;
  icon: string;
  route: "/pre-sleep-intention" | "/morning-intention-reflection" | "/sleep-calendar" | "/dream-journal";
  featured?: boolean;
  unlockable?: boolean;
};

const DREAM_JOURNAL_KEY = "lit_dream_journal";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function SleepScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [latestDream, setLatestDream] = useState<DreamEntry | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadLatestDream();
    }, [])
  );

  const sleepCards = useMemo<SleepCard[]>(
    () => [
      {
        title: "Pre-Sleep Intention",
        description: "Set one clear signal for tomorrow before bed.",
        buttonText: "Set Intention",
        icon: "☾",
        featured: true,
        route: "/pre-sleep-intention",
      },
      {
        title: "Morning Reflection",
        description: "Reflect on sleep and set the morning tone.",
        buttonText: "Open Reflection",
        icon: "✦",
        unlockable: true,
        route: "/morning-intention-reflection",
      },
      {
        title: "Sleep Guide",
        description: "Set sleep window and daily cutoffs.",
        buttonText: "Open Sleep Guide",
        icon: "☽",
        route: "/sleep-calendar",
      },
      {
        title: "Dream Journal",
        description: latestDream
          ? `Latest: ${latestDream.title || "Untitled dream"}`
          : "Capture dreams before they fade.",
        buttonText: "Open Dream Journal",
        icon: "📖",
        featured: true,
        route: "/dream-journal",
      },
    ],
    [latestDream]
  );

  async function lightHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function navigate(path: Parameters<typeof router.push>[0]) {
    await lightHaptic();
    router.push(path);
  }

  async function loadLatestDream() {
    const saved = await AsyncStorage.getItem(DREAM_JOURNAL_KEY);

    if (!saved) {
      setLatestDream(null);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      setLatestDream(Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null);
    } catch {
      setLatestDream(null);
    }
  }

  function renderSleepCard(card: SleepCard) {
    return (
      <View key={card.title} style={[styles.card, card.featured && styles.featuredCard]}>
        <View style={styles.cardTopRow}>
          <View style={styles.iconBox}>
            <Text style={styles.cardIcon}>{card.icon}</Text>
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardText}>{card.description}</Text>
            {card.unlockable ? <Text style={styles.unlockBadge}>🔓 UNLOCK</Text> : null}
          </View>
        </View>
        <View style={styles.cardDivider} />
        <TouchableOpacity style={styles.actionButton} onPress={() => navigate(card.route)}>
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
          <Image source={uiAssets.backgrounds.recovery} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView
            style={styles.screenScroller}
            contentContainerStyle={[styles.hudContent, { paddingBottom: mobile.scrollPaddingBottom }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.titlePanel}>
              <Text style={styles.kicker}>SLEEP HUB</Text>
              <Text style={[styles.title, { fontSize: 34, letterSpacing: 3 }]}>SLEEP HUB</Text>
              <Text style={styles.subtitle}>Rest, intention, and dream tools.</Text>
            </View>

            <View style={styles.lunaPanel}>
              <Image source={uiAssets.guides.luna} style={styles.lunaAvatar} resizeMode="contain" />
              <View style={styles.lunaCopy}>
                <Text style={styles.lunaText}>
                  It's okay to take it slow, stargazer. Rest is part of becoming your brightest self.
                </Text>
                <Text style={styles.lunaName}>Luna ♥</Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cardStack}>{sleepCards.map(renderSleepCard)}</View>
          </ScrollView>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Sleep Hub Works"
            bullets={LUNA_SLEEP_HUB_BULLETS}
            accentColor="#C4A7FF"
          />

          <BottomNav activeRoute="sleep" theme="purple" bottomOffset={mobile.bottomNavOffset} />
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
    borderColor: "rgba(196, 167, 255, 0.72)",
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
    backgroundColor: "rgba(5, 8, 20, 0.04)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    flexGrow: 1,
    paddingTop: 28,
    paddingHorizontal: 14,
  },
  titlePanel: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "rgba(7, 11, 27, 0.94)",
    borderWidth: 4,
    borderColor: "#8B5CF6",
    borderRadius: 8,
    paddingVertical: 15,
    paddingHorizontal: 14,
    marginBottom: 34,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  kicker: {
    color: "#C084FC",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 7,
    textTransform: "uppercase",
    fontFamily: pixelFont,
  },
  title: {
    color: "#E9D5FF",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 5,
    lineHeight: 46,
    fontFamily: pixelFont,
    textShadowColor: "#000",
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  subtitle: {
    color: "#FDE68A",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: "center",
    fontWeight: "800",
    fontFamily: pixelFont,
  },
  lunaPanel: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(7, 11, 27, 0.94)",
    borderWidth: 4,
    borderColor: "#A78BFA",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 22,
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  lunaAvatar: {
    height: 68,
    width: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: "#C4A7FF",
    backgroundColor: "rgba(21, 16, 48, 0.72)",
    marginRight: 12,
  },
  lunaCopy: {
    flex: 1,
  },
  lunaText: {
    color: "#F8F1D7",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    fontFamily: pixelFont,
  },
  lunaName: {
    color: "#C084FC",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 6,
    fontFamily: pixelFont,
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
  cardStack: {
    gap: 14,
    paddingBottom: 8,
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
  featuredCard: {
    borderColor: "#A78BFA",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
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
    minWidth: 0,
  },
  cardTitle: {
    color: "#F5F3FF",
    fontFamily: pixelFont,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
    flexShrink: 1,
  },
  cardText: {
    color: "#EDE9FE",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    fontWeight: "700",
    flexShrink: 1,
  },
  unlockBadge: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 5,
    letterSpacing: 0.5,
  },
  cardDivider: {
    height: 2,
    backgroundColor: "rgba(196, 167, 255, 0.28)",
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
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    flex: 1,
    flexShrink: 1,
    paddingRight: 8,
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
    backgroundColor: "#4C1D95",
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
