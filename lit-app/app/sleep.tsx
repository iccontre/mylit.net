import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { isMorningReflectionAvailable } from "../lib/scheduling";

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
  locked?: boolean;
};

const DREAM_JOURNAL_KEY = "lit_dream_journal";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const palette = hubPalettes.sleep;

export default function SleepScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [latestDream, setLatestDream] = useState<DreamEntry | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());

  useFocusEffect(
    useCallback(() => {
      loadLatestDream();
      setNow(new Date());
    }, [])
  );

  // Re-check regularly so this card's lock state crosses the 6:00 AM / 9:00 PM boundaries
  // without needing a reload — matches morning-intention-reflection.tsx's own polling.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const sleepCards = useMemo<SleepCard[]>(
    () => [
      {
        title: "Pre-Sleep Intention",
        description: "Set one clear signal for tomorrow before bed.",
        buttonText: "Set Intention",
        icon: "☾",
        route: "/pre-sleep-intention",
      },
      {
        title: "Morning Reflection",
        description: isMorningReflectionAvailable(now)
          ? "Reflect on sleep and set the morning tone."
          : "Opens 6:00 AM–8:59 PM. Set tonight's Pre-Sleep Intention instead.",
        buttonText: "Open Reflection",
        icon: "✦",
        locked: !isMorningReflectionAvailable(now),
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
        route: "/dream-journal",
      },
    ],
    [latestDream, now]
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
      <ParchmentSurface
        key={card.title}
        accent="sleep"
        kicker={`${card.icon}  ${card.title.toUpperCase()}`}
        trailingLabel={card.locked ? "LOCKED" : undefined}
      >
        <Text style={parchmentTextStyles.body}>{card.description}</Text>
        <TouchableOpacity
          style={[styles.actionButton, card.locked ? styles.actionButtonLocked : { backgroundColor: palette.edge, borderColor: palette.accent }]}
          onPress={() => navigate(card.route)}
        >
          <Text style={[styles.actionText, card.locked && styles.actionTextLocked]}>
            {card.locked ? `🔒 ${card.buttonText.toUpperCase()}` : card.buttonText.toUpperCase()}
          </Text>
          {!card.locked ? <Text style={styles.actionArrow}>›</Text> : null}
        </TouchableOpacity>
      </ParchmentSurface>
    );
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: palette.edge }]}>
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
            <WorldChrome hub="sleep" kicker="MOONLIT REST" title="SLEEP" subtitle="Rest, intention, and dream tools." style={styles.chrome} />

            <GuidePanel
              hub="sleep"
              guideName="Luna"
              guideAvatar={uiAssets.guides.luna}
              message="It's okay to take it slow, stargazer. Rest is part of becoming your brightest self."
              onInfoPress={() => setShowInfo(true)}
            />

            <View style={styles.cardStack}>{sleepCards.map(renderSleepCard)}</View>
          </ScrollView>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Sleep Hub Works"
            bullets={LUNA_SLEEP_HUB_BULLETS}
            accentColor={palette.accent}
          />

          <BottomNav activeRoute="sleep" bottomOffset={mobile.bottomNavOffset} />
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
    backgroundColor: "rgba(5, 8, 20, 0.04)",
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
  actionButtonLocked: {
    backgroundColor: "#57534E",
    borderColor: "#78716C",
  },
  actionText: {
    color: "#FFFFFF",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  actionTextLocked: {
    color: "#D6D3D1",
  },
  actionArrow: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
});
