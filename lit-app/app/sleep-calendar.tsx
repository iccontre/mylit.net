import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { GuideInfoModal } from "../components/GuideInfoModal";
import { uiAssets } from "../constants/uiAssets";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { persistProgressKeys } from "../lib/progressStore";
import { LATEST_CHECKIN_KEY } from "../lib/storageKeys";

const LUNA_SLEEP_GUIDE_BULLETS = [
  "The Sleep Guide suggests timing — not strict rules.",
  "Set your desired sleep and wake times to generate personal cutoffs.",
  "Caffeine cutoff, screen cutoff, meals, and exercise timing help protect sleep quality.",
  "Caffeine cut-off: about 11–12 hours before sleep.",
  "Last meal: 3–4 hours before sleep. Blue screen: at least 1 hour before sleep.",
  "Last exercise: avoid intense activity within 3 hours of sleep.",
  "Imperfect sleep is okay. Recovery nights still count.",
];

type CheckIn = {
  wakeTime?: string;
  desiredSleepTime?: string;
  desiredWakeTime?: string;
  estimatedSleepWindow?: string;
  caffeineCutoffSuggestion?: string;
  mealCutoffSuggestion?: string;
  blueScreenCutoffSuggestion?: string;
  exerciseCutoffSuggestion?: string;
  windDownGoal?: string;
  createdAt?: string;
};

type Suggestion = {
  icon: string;
  label: string;
  note: string;
  value: string;
};

const CHECKIN_KEY = LATEST_CHECKIN_KEY;
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;
const MIN_SLEEP_HOURS = 9;
/** Desired sleep time can be set from 7 PM through 2 AM, but not past 2 AM. */
const SLEEP_TIME_FLOOR_MINUTES = 19 * 60;
const SLEEP_TIME_CAP_MINUTES = 2 * 60;

function isWithinSleepTimeWindow(totalMinutesOfDay: number): boolean {
  return totalMinutesOfDay >= SLEEP_TIME_FLOOR_MINUTES || totalMinutesOfDay <= SLEEP_TIME_CAP_MINUTES;
}

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function parseTimeToMinutes(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!match) return 23 * 60;

  const rawHour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  let hour = rawHour % 12;
  if (period === "PM") hour += 12;

  return hour * 60 + minute;
}

function formatMinutes(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function shiftTime(time: string, deltaMinutes: number) {
  return formatMinutes(parseTimeToMinutes(time) + deltaMinutes);
}

function getSleepDurationHours(sleepTime: string, wakeTime: string) {
  const sleepMinutes = parseTimeToMinutes(sleepTime);
  let wakeMinutes = parseTimeToMinutes(wakeTime);

  if (wakeMinutes <= sleepMinutes) {
    wakeMinutes += 1440;
  }

  return (wakeMinutes - sleepMinutes) / 60;
}

function formatDuration(hours: number) {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);

  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
}

function buildSuggestions(sleepTime: string): Suggestion[] {
  const sleepMinutes = parseTimeToMinutes(sleepTime);

  return [
    {
      icon: "☕",
      label: "CAFFEINE CUT-OFF",
      note: "11–12 hours before sleep",
      value: `${formatMinutes(sleepMinutes - 12 * 60)} – ${formatMinutes(sleepMinutes - 11 * 60)}`,
    },
    {
      icon: "🍲",
      label: "LAST MEAL CUT-OFF",
      note: "3–4 hours before sleep",
      value: `${formatMinutes(sleepMinutes - 4 * 60)} – ${formatMinutes(sleepMinutes - 3 * 60)}`,
    },
    {
      icon: "📱",
      label: "BLUE-SCREEN CUT-OFF",
      note: "At least 1 hour before sleep",
      value: formatMinutes(sleepMinutes - 60),
    },
    {
      icon: "👟",
      label: "LAST EXERCISE TIME",
      note: "No exercise within 3 hours",
      value: formatMinutes(sleepMinutes - 3 * 60),
    },
  ];
}

export default function SleepCalendarScreen() {
  const router = useRouter();
  const [desiredSleepTime, setDesiredSleepTime] = useState("11:00 PM");
  const [desiredWakeTime, setDesiredWakeTime] = useState("8:00 AM");
  const [savedMessage, setSavedMessage] = useState("");
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    loadSleepGuide();
  }, []);

  async function loadSleepGuide() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as CheckIn;
      if (parsed.desiredSleepTime) setDesiredSleepTime(parsed.desiredSleepTime);
      if (parsed.desiredWakeTime || parsed.wakeTime) setDesiredWakeTime(parsed.desiredWakeTime || parsed.wakeTime || "8:00 AM");
    } catch {
      // Keep default guide times if saved data cannot be parsed.
    }
  }

  const sleepDuration = useMemo(() => getSleepDurationHours(desiredSleepTime, desiredWakeTime), [desiredSleepTime, desiredWakeTime]);
  const hasEnoughSleepWindow = sleepDuration >= MIN_SLEEP_HOURS;
  const suggestions = useMemo(() => buildSuggestions(desiredSleepTime), [desiredSleepTime]);

  async function saveSleepGuide() {
    if (!hasEnoughSleepWindow) {
      setSavedMessage("Try to leave at least 9 hours between sleep and wake time.");
      return;
    }

    let current: CheckIn = {};
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);
    if (saved) {
      try {
        current = JSON.parse(saved) as CheckIn;
      } catch {
        current = {};
      }
    }

    const [caffeine, meal, blueScreen, exercise] = suggestions;
    const next: CheckIn = {
      ...current,
      desiredSleepTime,
      desiredWakeTime,
      wakeTime: desiredWakeTime,
      estimatedSleepWindow: `${desiredSleepTime} – ${desiredWakeTime} (${formatDuration(sleepDuration)})`,
      caffeineCutoffSuggestion: caffeine.value,
      mealCutoffSuggestion: meal.value,
      blueScreenCutoffSuggestion: blueScreen.value,
      exerciseCutoffSuggestion: exercise.value,
      createdAt: current.createdAt || new Date().toISOString(),
    };

    await persistProgressKeys({ [CHECKIN_KEY]: JSON.stringify(next) });
    setSavedMessage("Sleep guide saved.");
    void trackEvent(ANALYTICS_EVENTS.sleep_guide_saved);
  }

  function TimeStepper({ label, icon, value, onChange }: { label: string; icon: string; value: string; onChange: (next: string) => void }) {
    return (
      <View style={styles.timeCard}>
        <Text style={styles.timeLabel}>{label}</Text>
        <View style={styles.timeStepperRow}>
          <TouchableOpacity style={styles.timeStepButton} onPress={() => onChange(shiftTime(value, -30))}>
            <Text style={styles.timeStepText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.timeValueBox}>
            <Text style={styles.timeIcon}>{icon}</Text>
            <Text style={styles.timeValue}>{value}</Text>
          </View>
          <TouchableOpacity style={styles.timeStepButton} onPress={() => onChange(shiftTime(value, 30))}>
            <Text style={styles.timeStepText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.pageRoot}>
      <View style={styles.phoneStage}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.recovery} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView style={styles.screenScroller} contentContainerStyle={styles.hudContent} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.headerCard}>
              <View style={styles.headerCopy}>
                <Text style={styles.kicker}>SLEEP HUB</Text>
                <Text style={styles.title}>SLEEP GUIDE</Text>
                <Text style={styles.subtitle}>Set your sleep window and daily cutoffs.</Text>
              </View>
              <Text style={styles.headerMoon}>☾</Text>
            </View>

            <View style={styles.lunaCard}>
              <Image source={uiAssets.guides.luna} style={styles.lunaImage} resizeMode="contain" />
              <View style={styles.lunaCopy}>
                <Text style={styles.lunaTitle}>LUNA, YOUR GUIDE</Text>
                <Text style={styles.lunaText}>These are suggestions, not rules. Sleep can vary — especially with anxiety or sleep problems. Be kind to yourself.</Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>☽ YOUR SLEEP GOALS</Text>
              <View style={styles.goalRow}>
                <TimeStepper
                  label="DESIRED SLEEP TIME"
                  icon="🌙"
                  value={desiredSleepTime}
                  onChange={(next) => {
                    // Desired sleep time can be set until 2 AM, but not past it.
                    if (isWithinSleepTimeWindow(parseTimeToMinutes(next))) setDesiredSleepTime(next);
                  }}
                />
                <Text style={styles.goalArrow}>›</Text>
                <TimeStepper label="DESIRED WAKE TIME" icon="☀️" value={desiredWakeTime} onChange={setDesiredWakeTime} />
              </View>
              <View style={[styles.validationBox, !hasEnoughSleepWindow && styles.validationBoxWarning]}>
                <Text style={[styles.validationText, !hasEnoughSleepWindow && styles.validationTextWarning]}>
                  {hasEnoughSleepWindow
                    ? `✓ ${formatDuration(sleepDuration)} between sleep and wake time.`
                    : "Try to leave at least 9 hours between sleep and wake time."}
                </Text>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>✦ LUNA’S SUGGESTIONS</Text>
              {suggestions.map((item) => (
                <View key={item.label} style={styles.suggestionRow}>
                  <View style={styles.suggestionIconBox}>
                    <Text style={styles.suggestionIcon}>{item.icon}</Text>
                  </View>
                  <View style={styles.suggestionCopy}>
                    <Text style={styles.suggestionLabel}>{item.label}</Text>
                    <Text style={styles.suggestionNote}>{item.note}</Text>
                  </View>
                  <Text style={styles.suggestionValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            {savedMessage ? <Text style={hasEnoughSleepWindow ? styles.savedMessage : styles.warningMessage}>{savedMessage}</Text> : null}

            <TouchableOpacity style={[styles.saveButton, !hasEnoughSleepWindow && styles.saveButtonDisabled]} onPress={saveSleepGuide}>
              <Text style={styles.saveButtonText}>☾ SAVE SLEEP GUIDE ☽</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
              <Text style={styles.backButtonText}>Back to Today</Text>
            </TouchableOpacity>
          </ScrollView>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.luna}
            guideName="Luna"
            title="How Sleep Guide Works"
            bullets={LUNA_SLEEP_GUIDE_BULLETS}
            accentColor="#A78BFA"
          />

          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}>
              <Text style={styles.navIcon}>🏠</Text>
              <Text style={styles.navLabel}>HOME</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={() => router.push("/sleep")}>
              <Text style={styles.navIcon}>🌙</Text>
              <Text style={[styles.navLabel, styles.navLabelActive]}>SLEEP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/mind")}>
              <Text style={styles.navIcon}>🧠</Text>
              <Text style={styles.navLabel}>MIND</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/path")}>
              <Text style={styles.navIcon}>🌲</Text>
              <Text style={styles.navLabel}>PATH</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/calendar")}>
              <Text style={styles.navIcon}>📅</Text>
              <Text style={styles.navLabel}>CAL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/stats")}>
              <Text style={styles.navIcon}>🎒</Text>
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
    width: "100%",
    maxWidth: MAX_FRAME_WIDTH,
    aspectRatio: APP_FRAME_ASPECT_RATIO,
    alignSelf: "center",
    backgroundColor: "#050814",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "#A78BFA",
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
    backgroundColor: "rgba(8, 7, 24, 0.34)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 104,
  },
  headerCard: {
    minHeight: 122,
    backgroundColor: "rgba(7, 12, 28, 0.93)",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  title: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 33,
    fontWeight: "900",
    letterSpacing: 1.2,
    lineHeight: 40,
    textAlign: "center",
    textShadowColor: "#111827",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  subtitle: {
    color: "#E9D5FF",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 5,
  },
  headerMoon: {
    color: "#C4B5FD",
    fontSize: 56,
    marginLeft: 10,
  },
  lunaCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(8, 13, 30, 0.94)",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 8,
    padding: 11,
    marginBottom: 10,
  },
  lunaImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginRight: 12,
  },
  lunaCopy: {
    flex: 1,
  },
  lunaTitle: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
  },
  lunaText: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  panel: {
    backgroundColor: "rgba(8, 13, 30, 0.95)",
    borderWidth: 3,
    borderColor: "#7C3AED",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  panelTitle: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 10,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeCard: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderWidth: 2,
    borderColor: "#4C1D95",
    borderRadius: 6,
    padding: 8,
  },
  timeLabel: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 7,
  },
  timeStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  timeStepButton: {
    width: 28,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#7C3AED",
    borderRadius: 5,
    backgroundColor: "rgba(49, 46, 129, 0.8)",
  },
  timeStepText: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 25,
  },
  timeValueBox: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#312E81",
    borderRadius: 5,
    backgroundColor: "rgba(2, 6, 23, 0.85)",
  },
  timeIcon: {
    fontSize: 15,
    marginBottom: 1,
  },
  timeValue: {
    color: "#F8E7D1",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  goalArrow: {
    color: "#E9D5FF",
    fontFamily: pixelFont,
    fontSize: 28,
    fontWeight: "900",
  },
  validationBox: {
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 5,
    padding: 9,
    marginTop: 10,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
  },
  validationBoxWarning: {
    borderColor: "#F59E0B",
    backgroundColor: "rgba(113, 63, 18, 0.42)",
  },
  validationText: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  validationTextWarning: {
    color: "#FDE68A",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.86)",
    borderWidth: 2,
    borderColor: "#312E81",
    borderRadius: 6,
    padding: 9,
    marginBottom: 8,
  },
  suggestionIconBox: {
    width: 42,
    height: 42,
    borderWidth: 2,
    borderColor: "#4C1D95",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 6, 23, 0.76)",
    marginRight: 10,
  },
  suggestionIcon: {
    fontSize: 22,
  },
  suggestionCopy: {
    flex: 1,
    paddingRight: 8,
  },
  suggestionLabel: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  suggestionNote: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
  },
  suggestionValue: {
    width: 112,
    color: "#F8E7D1",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
    lineHeight: 18,
  },
  savedMessage: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 9,
  },
  warningMessage: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 9,
  },
  saveButton: {
    backgroundColor: "rgba(109, 40, 217, 0.96)",
    borderWidth: 3,
    borderColor: "#C4B5FD",
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.72,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  saveButtonDisabled: {
    opacity: 0.62,
    borderColor: "#64748B",
  },
  saveButtonText: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  backButton: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    padding: 12,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#334155",
    marginBottom: 10,
  },
  backButtonText: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  infoBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#A78BFA",
    backgroundColor: "rgba(49,46,129,0.72)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  infoBtnText: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  bottomNav: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(5, 12, 24, 0.96)",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 6,
    padding: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 5,
  },
  navButton: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 4,
  },
  navButtonActive: {
    backgroundColor: "rgba(76, 29, 149, 0.92)",
    borderColor: "#C4B5FD",
  },
  navIcon: {
    fontSize: 21,
    marginBottom: 3,
  },
  navLabel: {
    color: "#E5E7EB",
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "900",
  },
  navLabelActive: {
    color: "#E9D5FF",
  },
});