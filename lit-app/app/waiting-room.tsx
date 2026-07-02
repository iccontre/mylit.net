import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { GuideInfoModal } from "../components/GuideInfoModal";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import {
  collectTodayCalendarItems,
  findNextScheduledItem,
  getChecklistItemsForDay,
  getTodayKey,
  getWeekdayName,
  markItemComplete,
  markItemMissed,
  normalizeQuestItems,
  parseCompletions,
  parseMissed,
  questSourceLabel,
  sourceIcon,
  type CompletionEntry,
  type HomeQuestItem,
  type MissedEntry,
  type QuestKind,
  type QuestSource,
} from "../lib/questProgress";
import { syncQuestCompleted, syncQuestMissed } from "../lib/progressSync";
import { clearProgressKey, persistProgressKeys } from "../lib/progressStore";
import {
  ACTIVE_TIMED_ITEM_KEY,
  COMPLETED_QUESTS_KEY,
  DAY_PLAN_KEY,
  LATEST_CHECKIN_KEY,
  MISSED_QUESTS_KEY,
  TOMORROW_QUEUE_KEY,
  USER_STATS_KEY,
  WAITING_ROOM_BOOSTS_KEY,
} from "../lib/storageKeys";
import { formatDurationLabel } from "../lib/scheduling";

type ActiveTimedItem = {
  id: string;
  title: string;
  source: QuestSource;
  kind: QuestKind;
  steps: number;
  durationMinutes: number;
  startedAt: number;
  endsAt: number;
  scheduledTime?: string;
};

type CheckIn = { mode?: "Recovery" | "Progress"; energy?: number };
type UserStats = { totalSteps?: number; rankBonusesAwarded?: number[] };

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const TIPS = [
  "Put your phone face down if you can.",
  "Choose one song or playlist before starting.",
  "Clear only the space you need.",
  "Take one breath before you begin.",
  "You do not need to feel perfect to keep going.",
];

const WAITING_ROOM_INFO_BULLETS = [
  "The Waiting Room keeps your current quest in one focused place.",
  "The timer stays synced with the Quest Board — leaving and coming back won't lose your place.",
  "For 1-hour tasks, you can use Boost once for +2 steps.",
  "When time ends, choose Completed or Missed?",
  "Completed awards the task's normal steps. Missed? helps you reflect without punishment.",
];

const FIREFLY_COUNT = 7;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function boostKeyFor(item: ActiveTimedItem): string {
  return `${item.id}:${item.startedAt}`;
}

function toHomeQuestItem(item: ActiveTimedItem): HomeQuestItem {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    kind: item.kind,
    steps: item.steps,
    durationMinutes: item.durationMinutes,
    scheduledTime: item.scheduledTime,
  };
}

function Firefly({ index, accent }: { index: number; accent: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const left = useMemo(() => 8 + ((index * 37) % 84), [index]);
  const top = useMemo(() => 10 + ((index * 53) % 80), [index]);
  const size = 3 + (index % 3);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 2200 + index * 260, useNativeDriver: true, delay: index * 180 }),
        Animated.timing(anim, { toValue: 0, duration: 2200 + index * 260, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, index]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.85] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: `${left}%`,
        top: `${top}%`,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: accent,
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

export default function WaitingRoomScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  const [activeItem, setActiveItem] = useState<ActiveTimedItem | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [nextItem, setNextItem] = useState<HomeQuestItem | null>(null);
  const [checkInMode, setCheckInMode] = useState<"Recovery" | "Progress" | null>(null);
  const [completedQuests, setCompletedQuests] = useState<CompletionEntry[]>([]);
  const [missedQuests, setMissedQuests] = useState<MissedEntry[]>([]);
  const [boosted, setBoosted] = useState(false);
  const [boostBusy, setBoostBusy] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [congrats, setCongrats] = useState<{ steps: number; boost: boolean } | null>(null);
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);

  const load = useCallback(async () => {
    const [savedActive, dayPlan, queueItems, completedRaw, missedRaw, checkIn, boosts] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_TIMED_ITEM_KEY),
      readJson<unknown>(DAY_PLAN_KEY, null),
      readJson<any[]>(TOMORROW_QUEUE_KEY, []),
      readJson<unknown>(COMPLETED_QUESTS_KEY, []),
      readJson<unknown>(MISSED_QUESTS_KEY, []),
      readJson<CheckIn | null>(LATEST_CHECKIN_KEY, null),
      readJson<Record<string, string>>(WAITING_ROOM_BOOSTS_KEY, {}),
    ]);

    let parsedActive: ActiveTimedItem | null = null;
    if (savedActive) {
      try {
        const parsed = JSON.parse(savedActive) as ActiveTimedItem;
        if (parsed && typeof parsed.title === "string" && typeof parsed.endsAt === "number") {
          parsedActive = parsed;
        }
      } catch {
        parsedActive = null;
      }
    }

    setActiveItem(parsedActive);
    setCheckInMode(checkIn?.mode === "Recovery" ? "Recovery" : checkIn?.mode === "Progress" ? "Progress" : null);

    const completed = parseCompletions(completedRaw);
    const missed = parseMissed(missedRaw);
    setCompletedQuests(completed);
    setMissedQuests(missed);
    setBoosted(parsedActive ? Boolean(boosts[boostKeyFor(parsedActive)]) : false);

    if (parsedActive) {
      const todayKey = getTodayKey();
      const todayName = getWeekdayName();
      const plan = dayPlan as any;
      const todayChecklist = getChecklistItemsForDay(plan, todayName);
      const calendarItems = collectTodayCalendarItems(dayPlan, queueItems, todayKey);
      const completedIds = new Set(completed.map((entry) => entry.id));
      const missedIds = new Set(missed.map((entry) => entry.id));
      const allItems = normalizeQuestItems({
        quests: [],
        todayQuest: plan?.todayQuest ?? null,
        checklist: todayChecklist,
        quickThoughts: queueItems,
        calendarItems,
        todayKey,
        completedIds,
        missedIds,
        preSleepIntentionDoneToday: true,
      });
      const available = allItems.filter((item) => item.id !== parsedActive!.id);
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      setNextItem(findNextScheduledItem(available, parsedActive.id, nowMinutes));
    } else {
      setNextItem(null);
    }

    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    void trackEvent(ANALYTICS_EVENTS.waiting_room_opened);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = activeItem ? Math.max(0, activeItem.endsAt - nowMs) : 0;
  const timerFinished = activeItem !== null && remainingMs <= 0;
  const isRecoveryMode = activeItem ? activeItem.kind === "recovery" : checkInMode === "Recovery";
  const guideName = isRecoveryMode ? "Luna" : "Evie";
  const guideAvatar = isRecoveryMode ? uiAssets.guides.luna : uiAssets.guides.evie;
  const guideMessage = isRecoveryMode
    ? "Take it slow. Let this time be soft and steady. Rest is still part of the path."
    : "Find a quiet spot, set your music, and let this be your next honest step. I'll wait with you.";
  const complimentMessage = isRecoveryMode
    ? "Good job staying present. Gentle effort still matters."
    : "Nice. You chose to stay with your goal. That counts.";
  const accent = isRecoveryMode ? "#C4A7FF" : "#84CC16";
  const background = isRecoveryMode ? uiAssets.backgrounds.recovery : uiAssets.backgrounds.progress;
  const canBoost = activeItem !== null && activeItem.durationMinutes >= 60;

  async function handleBoost() {
    if (!activeItem || boosted || boostBusy || !canBoost || timerFinished) return;
    setBoostBusy(true);
    try {
      const key = boostKeyFor(activeItem);
      const boosts = await readJson<Record<string, string>>(WAITING_ROOM_BOOSTS_KEY, {});
      if (boosts[key]) {
        setBoosted(true);
        return;
      }
      const userStats = await readJson<UserStats>(USER_STATS_KEY, {});
      const nextStats: UserStats = { ...userStats, totalSteps: (userStats.totalSteps ?? 0) + 2 };
      const nextBoosts = { ...boosts, [key]: new Date().toISOString() };
      await persistProgressKeys({
        [WAITING_ROOM_BOOSTS_KEY]: JSON.stringify(nextBoosts),
        [USER_STATS_KEY]: JSON.stringify(nextStats),
      });
      setBoosted(true);
      void trackEvent(ANALYTICS_EVENTS.waiting_room_boost_used, {
        id: activeItem.id,
        durationMinutes: activeItem.durationMinutes,
      });
    } finally {
      setBoostBusy(false);
    }
  }

  async function handleComplete() {
    if (!activeItem || busy) return;
    setBusy(true);
    try {
      const homeItem = toHomeQuestItem(activeItem);
      if (completedQuests.some((entry) => entry.id === homeItem.id)) {
        setCongrats({ steps: homeItem.steps, boost: boosted });
        return;
      }
      const nextCompleted = await markItemComplete(homeItem, completedQuests);
      setCompletedQuests(nextCompleted);
      await clearProgressKey(ACTIVE_TIMED_ITEM_KEY);
      setActiveItem(null);
      void trackEvent(ANALYTICS_EVENTS.quest_completed, { id: homeItem.id, title: homeItem.title, steps: homeItem.steps });
      void trackEvent(ANALYTICS_EVENTS.waiting_room_completed, { id: homeItem.id, boost: boosted });
      void syncQuestCompleted(homeItem);
      setCongrats({ steps: homeItem.steps, boost: boosted });
    } finally {
      setBusy(false);
    }
  }

  async function handleMissed() {
    if (!activeItem || busy) return;
    setBusy(true);
    try {
      const homeItem = toHomeQuestItem(activeItem);
      const nextMissed = await markItemMissed(homeItem, missedQuests, activeItem.id);
      setMissedQuests(nextMissed);
      await clearProgressKey(ACTIVE_TIMED_ITEM_KEY);
      setActiveItem(null);
      void trackEvent(ANALYTICS_EVENTS.quest_missed, { id: homeItem.id, title: homeItem.title });
      void trackEvent(ANALYTICS_EVENTS.waiting_room_missed, { id: homeItem.id });
      void syncQuestMissed(homeItem);
      router.replace({ pathname: "/reflection", params: { quest: homeItem.title } });
    } finally {
      setBusy(false);
    }
  }

  const fireflies = useMemo(
    () => Array.from({ length: FIREFLY_COUNT }, (_, i) => <Firefly key={i} index={i} accent={accent} />),
    [accent]
  );

  if (!loaded) {
    return (
      <View style={[styles.pageRoot, mobile.pageRootStyle]}>
        <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]} />
      </View>
    );
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: accent }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={background} style={styles.backgroundImage} resizeMode="cover" />
          <View style={styles.dimOverlay} />
        </View>
        <View pointerEvents="none" style={styles.fireflyLayer}>
          {fireflies}
        </View>

        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom}>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => router.push("/")}>
                <Text style={[styles.headerBack, { color: accent }]}>← Home</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>STUDY ROOM</Text>
              <TouchableOpacity style={[styles.infoBtn, { borderColor: accent }]} onPress={() => setShowInfo(true)}>
                <Text style={[styles.infoBtnText, { color: accent }]}>?</Text>
              </TouchableOpacity>
            </View>

            {congrats ? (
              <View style={[styles.card, { borderColor: "#22C55E" }]}>
                <Text style={styles.congratsTitle}>Congrats! +{congrats.steps}</Text>
                {congrats.boost ? <Text style={styles.congratsLine}>Boost already added: +2</Text> : null}
                <Text style={styles.congratsLine}>Total earned: +{congrats.steps + (congrats.boost ? 2 : 0)}</Text>
                <TouchableOpacity style={styles.returnHomeBtn} onPress={() => router.push("/")}>
                  <Text style={styles.returnHomeBtnText}>RETURN HOME</Text>
                </TouchableOpacity>
              </View>
            ) : !activeItem ? (
              <View style={styles.card}>
                <Text style={styles.emptyTitle}>No active quest right now.</Text>
                <Text style={styles.emptyText}>Start a timed quest from the Quest Board, then come back here to wait it out.</Text>
                <TouchableOpacity style={styles.returnHomeBtn} onPress={() => router.push("/")}>
                  <Text style={styles.returnHomeBtnText}>RETURN HOME</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={[styles.guideCard, { borderColor: accent }]}>
                  <Image source={guideAvatar} style={[styles.guideAvatar, { borderColor: accent }]} resizeMode="contain" />
                  <View style={styles.guideCopy}>
                    <Text style={[styles.guideName, { color: accent }]}>{guideName}</Text>
                    <Text style={styles.guideMessage}>{guideMessage}</Text>
                    <Text style={styles.guideTip}>💡 {tip}</Text>
                  </View>
                </View>

                <View style={[styles.card, { borderColor: accent }]}>
                  <View style={styles.questHeaderRow}>
                    <Text style={styles.questIcon}>{sourceIcon(activeItem.source)}</Text>
                    <Text style={styles.questTitle} numberOfLines={2}>{activeItem.title}</Text>
                  </View>
                  <Text style={styles.questMeta}>
                    {questSourceLabel(activeItem.source)} · {activeItem.kind === "recovery" ? "Recovery" : "Progress"}
                    {activeItem.scheduledTime ? ` · ${activeItem.scheduledTime}` : ""}
                  </Text>
                  <Text style={styles.questMeta}>
                    {formatDurationLabel(activeItem.durationMinutes)} · +{activeItem.steps} steps
                  </Text>

                  <Text style={[styles.countdown, { color: timerFinished ? "#22C55E" : accent }]}>
                    {timerFinished ? "TIME'S UP" : formatCountdown(remainingMs)}
                  </Text>

                  {canBoost ? (
                    boosted ? (
                      <View style={styles.boostDoneCard}>
                        <Text style={styles.boostDoneText}>Boost used +2</Text>
                        <Text style={styles.complimentText}>{complimentMessage}</Text>
                      </View>
                    ) : !timerFinished ? (
                      <TouchableOpacity
                        style={[styles.boostBtn, { borderColor: accent }, boostBusy && styles.boostBtnDisabled]}
                        onPress={handleBoost}
                        disabled={boostBusy}
                      >
                        <Text style={[styles.boostBtnText, { color: accent }]}>Boost (+2 steps)</Text>
                      </TouchableOpacity>
                    ) : null
                  ) : null}

                  {timerFinished ? (
                    <View style={styles.endCard}>
                      <Text style={styles.endTitle}>Time&apos;s up. How did it go?</Text>
                      <View style={styles.endRow}>
                        <TouchableOpacity style={styles.completeBtn} onPress={handleComplete} disabled={busy}>
                          <Text style={styles.completeBtnText}>COMPLETED</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.missedBtn, { borderColor: accent }]} onPress={handleMissed} disabled={busy}>
                          <Text style={[styles.missedBtnText, { color: accent }]}>MISSED?</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>

                <View style={styles.card}>
                  <Text style={styles.nextLabel}>NEXT</Text>
                  {nextItem ? (
                    <>
                      <Text style={styles.nextTitle} numberOfLines={1}>{nextItem.title}</Text>
                      <Text style={styles.nextMeta} numberOfLines={1}>
                        {questSourceLabel(nextItem.source)}{nextItem.scheduledTime ? ` · ${nextItem.scheduledTime}` : ""} · {formatDurationLabel(nextItem.durationMinutes)}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.nextMeta}>Next: No scheduled item yet.</Text>
                  )}
                </View>
              </>
            )}
          </FormScreen>
        </View>

        <GuideInfoModal
          visible={showInfo}
          onClose={() => setShowInfo(false)}
          guideAvatar={guideAvatar}
          guideName={guideName}
          title="How the Study Room works"
          bullets={WAITING_ROOM_INFO_BULLETS}
          accentColor={accent}
        />
      </View>
    </View>
  );
}

function FormScreen({ children, scrollPaddingBottom }: { children: React.ReactNode; scrollPaddingBottom: number }) {
  return (
    <ScrollView
      style={styles.screenScroller}
      contentContainerStyle={[formPageContent, styles.hudContent, { paddingBottom: scrollPaddingBottom }]}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#02040A" },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#050814",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  phoneStageFullscreen: { borderWidth: 0, maxWidth: undefined, aspectRatio: undefined },
  backgroundLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
  backgroundImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  dimOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(2, 4, 10, 0.55)" },
  fireflyLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1 },
  worldOverlay: { flex: 1 },
  screenScroller: { flex: 1 },
  hudContent: { flexGrow: 1, width: "100%", paddingTop: 18, paddingHorizontal: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  headerBack: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  headerTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  infoBtn: { width: 26, height: 26, borderWidth: 2, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,13,24,0.7)" },
  infoBtnText: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  guideCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(8, 13, 24, 0.92)",
    borderWidth: 3,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  guideAvatar: { width: 52, height: 60, borderRadius: 8, borderWidth: 2, marginRight: 12, backgroundColor: "rgba(15,23,42,0.6)" },
  guideCopy: { flex: 1 },
  guideName: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900", textTransform: "uppercase", marginBottom: 4 },
  guideMessage: { color: "#F8F1D7", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  guideTip: { color: "#94A3B8", fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 6, fontStyle: "italic" },
  card: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 3,
    borderColor: "#334155",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    alignItems: "center",
  },
  questHeaderRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginBottom: 6 },
  questIcon: { fontSize: 18, marginRight: 8 },
  questTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", flexShrink: 1 },
  questMeta: { color: "#CBD5E1", fontSize: 11, fontWeight: "700", alignSelf: "stretch", marginBottom: 2 },
  countdown: { fontFamily: pixelFont, fontSize: 44, fontWeight: "900", marginVertical: 14, letterSpacing: 1 },
  boostBtn: { borderWidth: 2, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 18, alignSelf: "stretch", alignItems: "center" },
  boostBtnDisabled: { opacity: 0.5 },
  boostBtnText: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  boostDoneCard: { alignItems: "center", alignSelf: "stretch" },
  boostDoneText: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  complimentText: { color: "#CBD5E1", fontSize: 11, fontWeight: "700", marginTop: 4, textAlign: "center" },
  endCard: { alignSelf: "stretch", marginTop: 12, alignItems: "center" },
  endTitle: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", marginBottom: 10, textAlign: "center" },
  endRow: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  completeBtn: { flex: 1, backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", borderRadius: 6, paddingVertical: 12, alignItems: "center" },
  completeBtnText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  missedBtn: { flex: 1, borderWidth: 2, borderRadius: 6, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(15,23,42,0.6)" },
  missedBtnText: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  nextLabel: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", alignSelf: "stretch", marginBottom: 6, letterSpacing: 1 },
  nextTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", alignSelf: "stretch" },
  nextMeta: { color: "#94A3B8", fontSize: 11, fontWeight: "700", alignSelf: "stretch", marginTop: 2 },
  emptyTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", marginBottom: 8, textAlign: "center" },
  emptyText: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center", marginBottom: 14 },
  congratsTitle: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 20, fontWeight: "900", marginBottom: 8, textAlign: "center" },
  congratsLine: { color: "#F8FAFC", fontSize: 12, fontWeight: "700", marginBottom: 4, textAlign: "center" },
  returnHomeBtn: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", borderRadius: 6, paddingVertical: 13, paddingHorizontal: 22, alignItems: "center", marginTop: 10, alignSelf: "stretch" },
  returnHomeBtnText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
});
