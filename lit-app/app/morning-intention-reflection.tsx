import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { formPageContent, formStyles } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { USER_STATS_KEY } from "../lib/questProgress";
import { persistProgressKeys } from "../lib/progressStore";
import { parseTimeToMinutes } from "../lib/scheduling";
import {
  LATEST_PRE_SLEEP_INTENTION_KEY,
  MORNING_INTENTION_REFLECTIONS_KEY,
} from "../lib/storageKeys";

const EVIE_MORNING_BULLETS = [
  "Morning Reflection connects sleep, intention, and the day's energy.",
  "Compare last night's intention with how you feel this morning.",
  "Write honestly — there is no wrong answer.",
  "Enter sleep and wake times. MYLIT calculates your sleep bonus.",
  "Check-in is always +1 step. Over 7 hrs adds +2, over 8 hrs adds +4, over 9 hrs adds +6.",
  "Morning Support helps you pick one concrete first action.",
  "Even if last night's intention did not carry through, noting that is still useful.",
  "This page should feel encouraging, not like a report card.",
];

/** Sleep bonus tiers are exclusive — only the highest tier crossed applies. */
function sleepBonusStepsForDuration(durationMinutes: number): number {
  const hours = durationMinutes / 60;
  if (hours > 9) return 6;
  if (hours > 8) return 4;
  if (hours > 7) return 2;
  return 0;
}

/**
 * Parses two free-typed times of day ("11:30 pm", "7:15AM", "23:30") into a sleep
 * duration in minutes. Case-insensitive, spaces optional (see parseTimeToMinutes).
 * If the wake time reads earlier than the sleep time, it's assumed to be the next day
 * (cross-midnight sleep). Returns null for empty/unparseable/impossible input.
 */
function computeSleepDurationMinutes(sleptRaw: string, wokeRaw: string): number | null {
  const sleptMinutes = parseTimeToMinutes(sleptRaw);
  const wokeMinutesRaw = parseTimeToMinutes(wokeRaw);
  if (sleptMinutes === null || wokeMinutesRaw === null) return null;
  const wokeMinutes = wokeMinutesRaw <= sleptMinutes ? wokeMinutesRaw + 24 * 60 : wokeMinutesRaw;
  const durationMinutes = wokeMinutes - sleptMinutes;
  // Reject 0 (identical times) and anything longer than 16 hours as not a real night's sleep.
  if (durationMinutes <= 0 || durationMinutes > 16 * 60) return null;
  return durationMinutes;
}

function formatSleepDuration(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

type PreSleepIntention = {
  id: string;
  date: string;
  intention: string;
  feeling?: string;
  support?: string[];
  createdAt: string;
};

type MorningIntentionReflection = {
  id: string;
  date: string;
  reflectionText: string;
  sleepTime?: string;
  wakeTime?: string;
  sleepDurationMinutes?: number;
  sleepBonusSteps?: number;
  morningSupport: string[];
  createdAt: string;
};

const MORNING_SUPPORT_OPTIONS = [
  "Write in dream journal",
  "Shower",
  "Drink water / make food",
  "15 min of sunlight",
];

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function getYesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString("en-CA");
}

const theme = { accent: "#FBBF24", glow: "#FEF3C7", panel: "rgba(18, 16, 12, 0.94)", soft: "#FDE68A", active: "rgba(58, 42, 10, 0.94)" };

// Morning Reflection is a start-of-day ritual — it stays locked until 7:00 AM local time.
const MORNING_UNLOCK_HOUR = 7;

export default function MorningIntentionReflectionScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  const [latestIntention, setLatestIntention] = useState<PreSleepIntention | null>(null);
  const [reflectionText, setReflectionText] = useState("");
  const [sleptTimeInput, setSleptTimeInput] = useState("");
  const [wokeTimeInput, setWokeTimeInput] = useState("");
  const [morningSupport, setMorningSupport] = useState<string[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());

  const morningUnlocked = now.getHours() >= MORNING_UNLOCK_HOUR;
  const sleepTimesEntered = sleptTimeInput.trim() !== "" && wokeTimeInput.trim() !== "";
  const sleepDurationMinutes = sleepTimesEntered ? computeSleepDurationMinutes(sleptTimeInput, wokeTimeInput) : null;
  const sleepTimesInvalid = sleepTimesEntered && sleepDurationMinutes === null;
  const sleepBonusSteps = sleepDurationMinutes !== null ? sleepBonusStepsForDuration(sleepDurationMinutes) : 0;
  const canSaveReflection = morningUnlocked && sleepTimesEntered && sleepDurationMinutes !== null;

  useFocusEffect(
    useCallback(() => {
      loadLatestIntention();
      setNow(new Date());
    }, [])
  );

  // Re-check the time each minute so the page auto-unlocks at 7:00 AM without a reload.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  async function loadLatestIntention() {
    const saved = await AsyncStorage.getItem(LATEST_PRE_SLEEP_INTENTION_KEY);
    if (!saved) {
      setLatestIntention(null);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as PreSleepIntention;
      // Only surface an intention set last night — an older, stale intention
      // should not keep showing up on later mornings.
      setLatestIntention(parsed.date === getYesterdayKey() ? parsed : null);
    } catch {
      setLatestIntention(null);
    }
  }

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

  async function saveReflection() {
    if (!canSaveReflection || sleepDurationMinutes === null) return;
    const todayKey = getTodayKey();

    const saved = await AsyncStorage.getItem(MORNING_INTENTION_REFLECTIONS_KEY);
    const history: MorningIntentionReflection[] = saved ? JSON.parse(saved) : [];
    // Award only once per day — editing/resaving today's reflection later updates the
    // saved data but does not double-award the check-in + sleep bonus steps.
    const alreadyAwardedToday = history.some((entry) => entry.date === todayKey);

    const reflection: MorningIntentionReflection = {
      id: String(Date.now()),
      date: todayKey,
      reflectionText: reflectionText.trim(),
      sleepTime: sleptTimeInput.trim(),
      wakeTime: wokeTimeInput.trim(),
      sleepDurationMinutes,
      sleepBonusSteps,
      morningSupport,
      createdAt: new Date().toISOString(),
    };

    await persistProgressKeys({
      [MORNING_INTENTION_REFLECTIONS_KEY]: JSON.stringify([reflection, ...history]),
    });

    // +1 for completing check-in (always, once valid) plus the sleep-duration bonus tier.
    if (!alreadyAwardedToday) {
      await earnSteps(1 + sleepBonusSteps);
    }

    await successHaptic();
    router.push("/");
  }

  function toggleMorningSupport(option: string) {
    setMorningSupport((prev) => prev.includes(option) ? prev.filter((s) => s !== option) : [...prev, option]);
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: theme.accent }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.progress} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <View style={[styles.hero, { borderColor: theme.accent, backgroundColor: theme.panel }]}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroCopy}>
                  <Text style={[styles.heroKicker, { color: theme.glow }]}>MORNING</Text>
                  <Text style={styles.title}>MORNING REFLECTION</Text>
                  <Text style={[styles.subtitle, { color: theme.soft }]}>Carry the night into the day.</Text>
                </View>
                <Image source={uiAssets.guides.evie} style={[styles.guideAvatar, { borderColor: theme.accent }]} resizeMode="contain" />
              </View>
            </View>

            <View style={[styles.evieCard, { borderColor: theme.accent }]}>
              <View style={styles.evieCardHeader}>
                <Text style={[styles.evieName, { color: theme.glow }]}>⭐ Evie</Text>
                <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                  <Text style={styles.infoBtnText}>?</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.evieText}>Be honest and kind to yourself this morning. Whatever you remember is enough.</Text>
            </View>

            {latestIntention && (
              <View style={[styles.signalCard, { borderColor: theme.accent }]}>
                <Text style={[styles.sectionTitle, { color: theme.glow }]}>LAST NIGHT’S INTENTION</Text>
                <Text style={styles.intentionText}>{latestIntention.intention}</Text>
                {latestIntention.feeling ? <Text style={styles.supportingText}>Feeling: {latestIntention.feeling}</Text> : null}
              </View>
            )}

            {!latestIntention && (
              <View style={[styles.emptyCard, { borderColor: theme.accent }]}>
                <Text style={[styles.emptyTitle, { color: theme.glow }]}>NO INTENTION YET</Text>
                <Text style={styles.emptyText}>Set a pre-sleep intention tonight and return here tomorrow.</Text>
                <TouchableOpacity style={[styles.primaryButton, { borderColor: theme.accent }]} onPress={() => router.push("/pre-sleep-intention")}>
                  <Text style={styles.primaryButtonText}>Set Pre-Sleep Intention</Text>
                </TouchableOpacity>
              </View>
            )}

            {!morningUnlocked ? (
              <View style={[styles.lockedCard, { borderColor: theme.accent }]}>
                <Text style={styles.lockedIcon}>🌙</Text>
                <Text style={[styles.lockedTitle, { color: theme.glow }]}>MORNING REFLECTION LOCKED</Text>
                <Text style={styles.lockedText}>
                  This ritual opens at 7:00 AM. Rest a little longer, then return to reflect on your night and set the day.
                </Text>
              </View>
            ) : (
              <>
                <View style={[styles.panel, { borderColor: theme.accent }]}>
                  <Text style={styles.label}>Morning reflection</Text>
                  <TextInput
                    style={[formStyles.textArea, styles.textArea]}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    placeholder="What do you need this morning?"
                    placeholderTextColor="#94A3B8"
                    value={reflectionText}
                    onChangeText={setReflectionText}
                  />
                </View>

                <View style={[styles.panel, { borderColor: theme.accent }]}>
                  <Text style={styles.label}>Approximate time you slept last night</Text>
                  <TextInput
                    style={formStyles.input}
                    placeholder="Example: 11:30 PM"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="characters"
                    value={sleptTimeInput}
                    onChangeText={setSleptTimeInput}
                  />
                  <Text style={styles.label}>Approximate time you woke up</Text>
                  <TextInput
                    style={formStyles.input}
                    placeholder="Example: 7:15 AM"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="characters"
                    value={wokeTimeInput}
                    onChangeText={setWokeTimeInput}
                  />
                  {sleepTimesInvalid ? (
                    <Text style={styles.sleepErrorText}>Enter valid times, like 11:30 PM and 7:15 AM.</Text>
                  ) : sleepDurationMinutes !== null ? (
                    <Text style={styles.sleepSummaryText}>
                      {formatSleepDuration(sleepDurationMinutes)} of sleep · +{1 + sleepBonusSteps} step{1 + sleepBonusSteps === 1 ? "" : "s"} total
                    </Text>
                  ) : (
                    <Text style={styles.sleepSummaryText}>MYLIT calculates your sleep bonus from these two times.</Text>
                  )}
                </View>

                <View style={[styles.panel, { borderColor: theme.accent }]}>
                  <Text style={styles.label}>Morning support</Text>
                  <View style={styles.optionWrap}>
                    {MORNING_SUPPORT_OPTIONS.map((option) => {
                      const selected = morningSupport.includes(option);
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[styles.option, selected && { backgroundColor: theme.active, borderColor: theme.accent }]}
                          onPress={() => toggleMorningSupport(option)}
                        >
                          <Text style={selected ? [styles.optionSelectedText, { color: theme.glow }] : styles.optionText}>{option}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, { borderColor: theme.accent }, !canSaveReflection && styles.saveButtonDisabled]}
                  disabled={!canSaveReflection}
                  onPress={saveReflection}
                >
                  <Text style={styles.saveButtonText}>{canSaveReflection ? "Save Reflection" : "Enter Sleep & Wake Times"}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/sleep")}>
              <Text style={styles.backButtonText}>Back to Sleep Hub</Text>
            </TouchableOpacity>
          </FormScreen>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.evie}
            guideName="Evie"
            title="How Morning Reflection Works"
            bullets={EVIE_MORNING_BULLETS}
            accentColor="#FBBF24"
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
    backgroundColor: "rgba(2, 6, 12, 0.14)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    flexGrow: 1,
    paddingTop: 18,
    paddingHorizontal: 16,
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
    lineHeight: 30,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "900",
    marginTop: 5,
  },
  guideAvatar: {
    height: 66,
    width: 66,
    borderRadius: 33,
    borderWidth: 3,
    backgroundColor: "rgba(8, 13, 24, 0.65)",
  },
  evieCard: {
    backgroundColor: "rgba(8,13,24,0.94)",
    borderRadius: 6,
    borderWidth: 3,
    padding: 13,
    marginBottom: 10,
  },
  evieCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  evieName: {
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  evieText: {
    color: "#F3F4F6",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  infoBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#FBBF24",
    backgroundColor: "rgba(58,42,10,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoBtnText: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  emptyCard: {
    backgroundColor: "rgba(8, 13, 24, 0.96)",
    borderRadius: 6,
    borderWidth: 3,
    padding: 14,
    marginBottom: 10,
  },
  lockedCard: {
    backgroundColor: "rgba(8, 13, 24, 0.96)",
    borderRadius: 6,
    borderWidth: 3,
    padding: 18,
    marginBottom: 10,
    alignItems: "center",
  },
  lockedIcon: {
    fontSize: 34,
    marginBottom: 8,
  },
  lockedTitle: {
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
    textAlign: "center",
  },
  lockedText: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyTitle: {
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 7,
  },
  emptyText: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  signalCard: {
    backgroundColor: "rgba(6, 10, 18, 0.96)",
    borderRadius: 6,
    borderWidth: 3,
    padding: 13,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  intentionText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
    marginBottom: 8,
  },
  supportingText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  panel: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderRadius: 6,
    borderWidth: 3,
    padding: 13,
    marginBottom: 10,
  },
  label: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    color: "#E5E7EB",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    lineHeight: 16,
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  option: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#334155",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optionText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
  },
  optionSelectedText: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
  },
  textArea: {
    borderRadius: 4,
  },
  primaryButton: {
    backgroundColor: "#111827",
    padding: 13,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 3,
    marginTop: 12,
  },
  primaryButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  saveButton: {
    backgroundColor: "#312E81",
    padding: 14,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 3,
    marginBottom: 10,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  sleepErrorText: {
    color: "#FCA5A5",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  sleepSummaryText: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
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
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
});