import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { BottomNav } from "../components/BottomNav";
import { FormScreen } from "../components/FormScreen";
import { GuideInfoModal } from "../components/GuideInfoModal";
import { HistoryModal } from "../components/HistoryModal";
import { GuidePanel } from "../components/parchment/GuidePanel";
import { ParchmentField } from "../components/parchment/ParchmentField";
import { ParchmentSurface, parchmentTextStyles } from "../components/parchment/ParchmentSurface";
import { SaveButton, type SaveState } from "../components/parchment/SaveButton";
import { WorldChrome } from "../components/parchment/WorldChrome";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { hubPalettes } from "../constants/worldTokens";
import { persistProgressKeys } from "../lib/progressStore";
import {
  LATEST_PRE_SLEEP_INTENTION_KEY,
  PRE_SLEEP_INTENTIONS_KEY,
} from "../lib/storageKeys";
import { normalizePreSleepLogs } from "../lib/logHistory";
import { USER_STATS_KEY } from "../lib/questProgress";
import { recordAgentEvent } from "../lib/mylitAgents";
import { getQuestDayKey } from "../lib/scheduling";
import { getSession } from "../lib/auth";

const LUNA_PRE_SLEEP_BULLETS = [
  "Pre-Sleep Intention gives your mind one clear signal before bed.",
  "Write one intention to prime tomorrow's mindset.",
  "Pick a Feeling to clarify what state you want to wake up in.",
  "Pick a Support option for a simple wind-down anchor tonight.",
  "Saving a complete intention earns +1 step.",
  "Your intention appears in Morning Reflection the next day.",
  "One clear direction is enough — you do not need to force anything.",
];

type PreSleepIntention = {
  id: string;
  date: string;
  intention: string;
  feeling: string;
  support: string[];
  createdAt: string;
  userId?: string;
  timezone?: string;
};

const FEELING_OPTIONS = ["Focused", "Energized", "Calm", "Grounded", "Rested", "Brave", "Gentle", "Steady"];
const SUPPORT_OPTIONS = ["No screens", "Gratitude", "Breathe", "Let go", "Sleep early", "Shower"];
const SUPPORT_HELPER_TEXT: Partial<Record<string, string>> = {
  Shower: "Reset your body before rest.",
};

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const palette = hubPalettes.sleep;

export default function PreSleepIntentionScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  const [intention, setIntention] = useState("");
  const [feeling, setFeeling] = useState("");
  const [support, setSupport] = useState<string[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

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
    await persistProgressKeys({
      [USER_STATS_KEY]: JSON.stringify({ ...current, totalSteps: Number(current.totalSteps ?? 0) + count }),
    });
  }

  async function saveIntention() {
    if (saveState === "saving" || saveState === "saved" || !intention.trim()) return;
    setSaveState("saving");

    try {
      // Quest-day key (6 AM boundary), matching every other consumer of this record —
      // index.tsx's loadPreSleepStatus, the Log History screen, and LDM's routine/quest
      // projection all key by this same logical day. The previous plain calendar date
      // (toLocaleDateString) diverged from it for anyone saving between midnight and 6 AM —
      // squarely inside the automatic 9 PM-5:59 AM LDM window this screen is meant for — which
      // stamped the entry with tomorrow's date while everything else still expected today's,
      // making a successfully-saved intention look like it "didn't save."
      const todayKey = getQuestDayKey();
      const existingRaw = await AsyncStorage.getItem(PRE_SLEEP_INTENTIONS_KEY);
      const history: PreSleepIntention[] = existingRaw ? JSON.parse(existingRaw) : [];
      const alreadyEarnedToday = history.some((past) => past.date === todayKey);
      const session = await getSession();

      const entry: PreSleepIntention = {
        id: String(Date.now()),
        date: todayKey,
        intention: intention.trim(),
        feeling,
        support,
        createdAt: new Date().toISOString(),
        userId: session?.user?.id,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      await persistProgressKeys({
        [PRE_SLEEP_INTENTIONS_KEY]: JSON.stringify([entry, ...history]),
        [LATEST_PRE_SLEEP_INTENTION_KEY]: JSON.stringify(entry),
      });
      // Only the first save of the day earns the step — editing/resaving today's
      // intention should not award it again.
      if (!alreadyEarnedToday) {
        await earnSteps(1);
      }
      await successHaptic();
      void recordAgentEvent({
        type: "pre_sleep_intention_saved",
        sourcePage: "pre-sleep-intention",
        relatedItemId: entry.id,
        stepDelta: alreadyEarnedToday ? undefined : 1,
        metadata: { feeling },
      });

      setSaveState("saved");
      // Hold the green ✓ SAVED confirmation on screen briefly before returning, per the shared
      // Save-state pattern, rather than navigating away the instant persistence resolves.
      setTimeout(() => router.push("/"), 800);
    } catch {
      // Input stays exactly as the user left it (no reset here) and the button surfaces a
      // visible failure + retry affordance instead of silently reverting to its idle label.
      setSaveState("error");
    }
  }

  function toggleSupport(option: string) {
    setSupport((prev) => prev.includes(option) ? prev.filter((s) => s !== option) : [...prev, option]);
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: palette.edge }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.recovery} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <WorldChrome hub="sleep" kicker="TONIGHT" title="INTENTION" subtitle="One clear signal for tomorrow." style={styles.chrome} />

            <GuidePanel
              hub="sleep"
              guideName="Luna"
              guideAvatar={uiAssets.guides.luna}
              message="Keep it small and kind. One sentence is enough to guide the morning."
              onInfoPress={() => setShowInfo(true)}
            />

            <ParchmentSurface accent="sleep" title="SET YOUR INTENTION" style={styles.formCard}>
              <Text style={styles.label}>Tomorrow, I want to…</Text>
              <ParchmentField
                style={styles.textArea}
                multiline
                scrollEnabled
                textAlignVertical="top"
                placeholder="Start the day slow — one gentle win before noon."
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
                      style={[styles.chip, selected && { backgroundColor: palette.edge, borderColor: palette.chrome }]}
                      onPress={() => setFeeling(selected ? "" : opt)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{selected ? "✓ " : ""}{opt}</Text>
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
                      style={[styles.chip, selected && { backgroundColor: palette.edge, borderColor: palette.chrome }]}
                      onPress={() => toggleSupport(opt)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{selected ? "✓ " : ""}{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {support.filter((opt) => SUPPORT_HELPER_TEXT[opt]).map((opt) => (
                <Text key={`helper-${opt}`} style={parchmentTextStyles.meta}>{SUPPORT_HELPER_TEXT[opt]}</Text>
              ))}

              <SaveButton
                state={saveState}
                onPress={saveIntention}
                idleLabel="SAVE INTENTION"
                style={styles.saveButton}
              />
            </ParchmentSurface>

            <TouchableOpacity style={[styles.backButton, { marginBottom: 8 }]} onPress={() => setShowHistory(true)}>
              <Text style={styles.backButtonText}>✨ Pre-Sleep History</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/sleep")}>
              <Text style={styles.backButtonText}>← Back to Sleep Hub</Text>
            </TouchableOpacity>
          </FormScreen>

          <HistoryModal
            visible={showHistory}
            onClose={() => setShowHistory(false)}
            title="Pre-Sleep History"
            storageKey={PRE_SLEEP_INTENTIONS_KEY}
            normalize={normalizePreSleepLogs}
            accent={palette.accent}
          />

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Pre-Sleep Intention Works"
            bullets={LUNA_PRE_SLEEP_BULLETS}
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
    backgroundColor: "rgba(2, 6, 12, 0.16)",
  },
  hudContent: {
    flexGrow: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  chrome: { marginBottom: 12 },
  formCard: { marginTop: 12 },
  label: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    color: "#7C5B2B",
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  textArea: {
    marginBottom: 6,
    minHeight: 90,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: "#F4E8CE",
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#5C4425",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipText: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  saveButton: { marginTop: 8 },
  backButton: {
    backgroundColor: "rgba(46,32,20, 0.94)",
    padding: 12,
    borderRadius: 5,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#8B7BC7",
  },
  backButtonText: {
    color: "#EFEAFB",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});
