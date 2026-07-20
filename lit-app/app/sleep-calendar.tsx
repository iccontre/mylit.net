import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomNav } from "../components/BottomNav";
import { FormScreen } from "../components/FormScreen";
import { GuideInfoModal } from "../components/GuideInfoModal";
import { GuidePanel } from "../components/parchment/GuidePanel";
import { ParchmentField } from "../components/parchment/ParchmentField";
import { ParchmentSurface, parchmentTextStyles } from "../components/parchment/ParchmentSurface";
import { SaveButton, type SaveState } from "../components/parchment/SaveButton";
import { WorldChrome } from "../components/parchment/WorldChrome";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { parchmentBorder, parchmentField, parchmentInk, parchmentInkMuted } from "../constants/parchmentTokens";
import { uiAssets } from "../constants/uiAssets";
import { hubPalettes } from "../constants/worldTokens";
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
  /** Minutes before desiredSleepTime the wind-down window starts — max 60 (see index.tsx's mandatory pre-sleep-routine lock). */
  windDownMinutes?: number;
  windDownHelps?: string;
  windDownAvoid?: string;
  windDownReminder?: string;
  windDownActivities?: string;
  createdAt?: string;
};

const WIND_DOWN_OPTIONS = [15, 30, 45, 60] as const;
const DEFAULT_WIND_DOWN_MINUTES = 30;

type Suggestion = {
  icon: string;
  label: string;
  note: string;
  value: string;
};

const CHECKIN_KEY = LATEST_CHECKIN_KEY;
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

const palette = hubPalettes.sleep;

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

export default function SleepCalendarScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [desiredSleepTime, setDesiredSleepTime] = useState("11:00 PM");
  const [desiredWakeTime, setDesiredWakeTime] = useState("8:00 AM");
  const [windDownMinutes, setWindDownMinutes] = useState<number>(DEFAULT_WIND_DOWN_MINUTES);
  const [windDownHelps, setWindDownHelps] = useState("");
  const [windDownAvoid, setWindDownAvoid] = useState("");
  const [windDownReminder, setWindDownReminder] = useState("");
  const [windDownActivities, setWindDownActivities] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showInfo, setShowInfo] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSleepGuide();
    return () => { if (savedTimeout.current) clearTimeout(savedTimeout.current); };
  }, []);

  async function loadSleepGuide() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as CheckIn;
      if (parsed.desiredSleepTime) setDesiredSleepTime(parsed.desiredSleepTime);
      if (parsed.desiredWakeTime || parsed.wakeTime) setDesiredWakeTime(parsed.desiredWakeTime || parsed.wakeTime || "8:00 AM");
      if (typeof parsed.windDownMinutes === "number") setWindDownMinutes(Math.min(60, parsed.windDownMinutes));
      if (parsed.windDownHelps) setWindDownHelps(parsed.windDownHelps);
      if (parsed.windDownAvoid) setWindDownAvoid(parsed.windDownAvoid);
      if (parsed.windDownReminder) setWindDownReminder(parsed.windDownReminder);
      if (parsed.windDownActivities) setWindDownActivities(parsed.windDownActivities);
    } catch {
      // Keep default guide times if saved data cannot be parsed.
    }
  }

  function markDirty() {
    if (saveState !== "idle") setSaveState("idle");
  }

  const sleepDuration = useMemo(() => getSleepDurationHours(desiredSleepTime, desiredWakeTime), [desiredSleepTime, desiredWakeTime]);
  const hasEnoughSleepWindow = sleepDuration >= MIN_SLEEP_HOURS;
  const suggestions = useMemo(() => buildSuggestions(desiredSleepTime), [desiredSleepTime]);

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in every web preview.
    }
  }

  async function saveSleepGuide() {
    if (!hasEnoughSleepWindow || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");

    try {
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
        windDownMinutes: Math.min(60, windDownMinutes),
        windDownHelps: windDownHelps.trim() || undefined,
        windDownAvoid: windDownAvoid.trim() || undefined,
        windDownReminder: windDownReminder.trim() || undefined,
        windDownActivities: windDownActivities.trim() || undefined,
        createdAt: current.createdAt || new Date().toISOString(),
      };

      await persistProgressKeys({ [CHECKIN_KEY]: JSON.stringify(next) });
      void trackEvent(ANALYTICS_EVENTS.sleep_guide_saved);
      await successHaptic();

      setSaveState("saved");
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
      savedTimeout.current = setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      // Fields stay exactly as entered — nothing to roll back, just surface retry.
      setSaveState("error");
    }
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: palette.edge }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.recovery} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
        <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
          <WorldChrome hub="sleep" kicker="SLEEP HUB" title="SLEEP GUIDE" subtitle="Sleep window and daily cutoffs." style={styles.chrome} />

          <GuidePanel
            hub="sleep"
            guideName="Luna"
            guideAvatar={uiAssets.guides.luna}
            message="These are suggestions, not rules — be kind to yourself."
            onInfoPress={() => setShowInfo(true)}
          />

          <ParchmentSurface accent="sleep" title="☽ SLEEP WINDOW" style={styles.panel}>
            <View style={styles.goalRow}>
              <TimeStepper
                label="SLEEP TIME"
                icon="🌙"
                value={desiredSleepTime}
                onChange={(next) => {
                  // Desired sleep time can be set until 2 AM, but not past it.
                  if (isWithinSleepTimeWindow(parseTimeToMinutes(next))) { setDesiredSleepTime(next); markDirty(); }
                }}
              />
              <Text style={styles.goalArrow}>›</Text>
              <TimeStepper label="WAKE TIME" icon="☀️" value={desiredWakeTime} onChange={(next) => { setDesiredWakeTime(next); markDirty(); }} />
            </View>
            <View style={[styles.validationBox, !hasEnoughSleepWindow && styles.validationBoxWarning]}>
              <Text style={[styles.validationText, !hasEnoughSleepWindow && styles.validationTextWarning]}>
                {hasEnoughSleepWindow
                  ? `✓ ${formatDuration(sleepDuration)} between sleep and wake time.`
                  : "Try to leave at least 9 hours between sleep and wake time."}
              </Text>
            </View>
          </ParchmentSurface>

          <ParchmentSurface accent="sleep" title="☾ PRE-SLEEP ROUTINE" style={styles.panel}>
            <Text style={parchmentTextStyles.meta}>Progress quests lock once wind-down starts. Recovery/sleep tasks stay open.</Text>
            <View style={[styles.goalRow, styles.windDownRow]}>
              {WIND_DOWN_OPTIONS.map((minutes) => (
                <TouchableOpacity
                  key={minutes}
                  style={[styles.windDownOption, windDownMinutes === minutes && styles.windDownOptionActive]}
                  onPress={() => { setWindDownMinutes(minutes); markDirty(); }}
                >
                  <Text style={[styles.windDownOptionText, windDownMinutes === minutes && styles.windDownOptionTextActive]}>{minutes} min</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>What helps you slow down before bed?</Text>
            <ParchmentField value={windDownHelps} onChangeText={(t) => { setWindDownHelps(t); markDirty(); }} placeholder="Optional" />

            <Text style={styles.fieldLabel}>What should you avoid during wind-down?</Text>
            <ParchmentField value={windDownAvoid} onChangeText={(t) => { setWindDownAvoid(t); markDirty(); }} placeholder="Optional" />

            <Text style={styles.fieldLabel}>One calming reminder from Luna?</Text>
            <ParchmentField value={windDownReminder} onChangeText={(t) => { setWindDownReminder(t); markDirty(); }} placeholder="Optional" />

            <Text style={styles.fieldLabel}>Stretching, journaling, reading, hygiene, or no screens?</Text>
            <ParchmentField style={styles.lastField} value={windDownActivities} onChangeText={(t) => { setWindDownActivities(t); markDirty(); }} placeholder="Optional" />
          </ParchmentSurface>

          <ParchmentSurface accent="sleep" title="✦ DAILY CUTOFFS" style={styles.panel}>
            {suggestions.map((item) => (
              <View key={item.label} style={styles.suggestionRow}>
                <View style={styles.suggestionIconBox}>
                  <Text style={styles.suggestionIcon}>{item.icon}</Text>
                </View>
                <View style={styles.suggestionCopy}>
                  <Text style={styles.suggestionLabel}>{item.label}</Text>
                  <Text style={parchmentTextStyles.meta}>{item.note}</Text>
                </View>
                <Text style={styles.suggestionValue}>{item.value}</Text>
              </View>
            ))}
          </ParchmentSurface>

          <SaveButton
            state={saveState}
            onPress={saveSleepGuide}
            idleLabel="SAVE SLEEP GUIDE"
            disabled={!hasEnoughSleepWindow}
            style={styles.saveButton}
          />

          <TouchableOpacity style={styles.backButton} onPress={() => router.push("/sleep")}>
            <Text style={styles.backButtonText}>← Back to Sleep Hub</Text>
          </TouchableOpacity>
        </FormScreen>

        <GuideInfoModal
          visible={showInfo}
          onClose={() => setShowInfo(false)}
          guideAvatar={uiAssets.guides.luna}
          guideName="Luna"
          title="How Sleep Guide Works"
          bullets={LUNA_SLEEP_GUIDE_BULLETS}
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
    paddingHorizontal: 14,
  },
  chrome: { marginBottom: 12 },
  panel: { marginTop: 12 },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  windDownRow: { marginTop: 4, marginBottom: 4 },
  windDownOption: { flex: 1, borderWidth: 2, borderColor: parchmentBorder, borderRadius: 6, paddingVertical: 9, alignItems: "center", backgroundColor: parchmentField },
  windDownOptionActive: { borderColor: palette.edge, backgroundColor: palette.chrome },
  windDownOptionText: { color: parchmentInkMuted, fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  windDownOptionTextActive: { color: palette.text },
  fieldLabel: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    color: parchmentInkMuted,
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  lastField: { marginBottom: 2 },
  timeCard: {
    flex: 1,
    backgroundColor: parchmentField,
    borderWidth: 2,
    borderColor: parchmentBorder,
    borderRadius: 7,
    padding: 8,
  },
  timeLabel: {
    color: parchmentInkMuted,
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
    borderColor: palette.edge,
    borderRadius: 5,
    backgroundColor: palette.chrome,
  },
  timeStepText: {
    color: palette.text,
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
    borderColor: parchmentBorder,
    borderRadius: 5,
    backgroundColor: "#FFFDF6",
  },
  timeIcon: {
    fontSize: 15,
    marginBottom: 1,
  },
  timeValue: {
    color: parchmentInk,
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  goalArrow: {
    color: parchmentInkMuted,
    fontFamily: pixelFont,
    fontSize: 28,
    fontWeight: "900",
  },
  validationBox: {
    borderWidth: 2,
    borderColor: parchmentBorder,
    borderRadius: 6,
    padding: 9,
    marginTop: 10,
    backgroundColor: parchmentField,
  },
  validationBoxWarning: {
    borderColor: "#B45309",
    backgroundColor: "#F3D9A8",
  },
  validationText: {
    color: parchmentInk,
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  validationTextWarning: {
    color: "#92400E",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: parchmentField,
    borderWidth: 2,
    borderColor: parchmentBorder,
    borderRadius: 6,
    padding: 9,
    marginBottom: 8,
  },
  suggestionIconBox: {
    width: 42,
    height: 42,
    borderWidth: 2,
    borderColor: parchmentBorder,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFDF6",
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
    color: parchmentInk,
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  suggestionValue: {
    width: 112,
    color: parchmentInk,
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
    lineHeight: 18,
  },
  saveButton: { marginTop: 4 },
  backButton: {
    backgroundColor: "rgba(46,32,20, 0.94)",
    padding: 12,
    borderRadius: 5,
    alignItems: "center",
    borderWidth: 2,
    borderColor: palette.edge,
    marginTop: 10,
  },
  backButtonText: {
    color: "#EFEAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
});
