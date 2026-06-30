import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { formatDurationLabel, generateTimeSlots, getDateKey, inferScheduledClassification, parseDurationMinutes, shiftTimeSlot, type ScheduledClassification, type ScheduledStatus } from "../lib/scheduling";

type WeekdayName = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
  steps: number;
  startTime: string;
  duration: string;
  durationMinutes: number;
  status: ScheduledStatus;
  kind: "progress" | "recovery";
};

type TodayQuest = {
  id: string;
  title: string;
  date: string;
  weekday: WeekdayName;
  startTime: string;
  duration: string;
  durationMinutes: number;
  steps: 2;
  status: ScheduledStatus;
  kind: "progress" | "recovery";
  source: "todayQuest";
};

type DayPlan = {
  todayFocus: string;
  todayGoal?: string;
  todayQuest: TodayQuest;
  weekdayRoles: Record<WeekdayName, string>;
  weekdayChecklists: Record<WeekdayName, ChecklistItem[]>;
};

type CheckIn = { mode?: string; energy?: number };

const DAY_PLAN_KEY = "lit_day_plan";
const CHECKIN_KEY = "lit_latest_checkin";
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;
const TIME_SLOTS = generateTimeSlots(7, 22, 30);
const PROGRESS_DURATIONS = ["30 min", "45 min", "1 hr"];
const RECOVERY_DURATIONS = ["10 min", "20 min", "30 min"];
const WEEKDAYS: WeekdayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEFAULT_ROLES: Record<WeekdayName, string> = {
  Monday: "Coding Day",
  Tuesday: "Study Day",
  Wednesday: "Gym Day",
  Thursday: "Build Day",
  Friday: "Social Day",
  Saturday: "Adventure Day",
  Sunday: "Recovery Day",
};
const DEFAULT_CHECKLIST = ["Coding session", "Gym", "Read", "Meal prep", "Walk", "Journal"];

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function todayWeekday(): WeekdayName {
  const days: WeekdayName[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = days[new Date().getDay()];
  return day === "Sunday" ? "Sunday" : day;
}

function normalizeKind(value: ScheduledClassification): "progress" | "recovery" {
  return value === "recovery" ? "recovery" : "progress";
}

function stepsForItem(kind: "progress" | "recovery", duration: string | number) {
  const minutes = parseDurationMinutes(duration, kind === "recovery" ? 10 : 30);
  if (kind === "recovery") return minutes >= 30 ? 1 : 0;
  return minutes >= 60 ? 2 : 1;
}

function durationsForKind(kind: "progress" | "recovery") {
  return kind === "recovery" ? RECOVERY_DURATIONS : PROGRESS_DURATIONS;
}

type Interval = { label: string; start: number; end: number };

function getCurrentInterval(now = new Date()): Interval {
  const intervals: Interval[] = [
    { label: "7 AM–10 AM", start: 7 * 60, end: 10 * 60 },
    { label: "10 AM–1 PM", start: 10 * 60, end: 13 * 60 },
    { label: "1 PM–4 PM", start: 13 * 60, end: 16 * 60 },
    { label: "4 PM–7 PM", start: 16 * 60, end: 19 * 60 },
    { label: "7 PM–10 PM", start: 19 * 60, end: 22 * 60 },
  ];
  const minutes = now.getHours() * 60 + now.getMinutes();
  return intervals.find((item) => minutes >= item.start && minutes < item.end) || (minutes < 7 * 60 ? intervals[0] : intervals[intervals.length - 1]);
}

function timeInInterval(time: string, interval: Interval) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!match) return false;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  const total = hour * 60 + minute;
  return total >= interval.start && total < interval.end;
}

function createChecklist(day: WeekdayName, saved: Partial<ChecklistItem>[] = []): ChecklistItem[] {
  const source: Partial<ChecklistItem>[] = saved.length > 0 ? saved : DEFAULT_CHECKLIST.map((text) => ({ text }));
  return source.map((item, index) => {
    const text = item.text?.trim() || DEFAULT_CHECKLIST[index] || "Habit action";
    const durationMinutes = parseDurationMinutes(item.durationMinutes ?? item.duration, 30);
    return {
      id: item.id || `${day}-${index}-${text}`,
      text,
      checked: Boolean(item.checked),
      steps: item.steps ?? stepsForItem(item.kind || normalizeKind(inferScheduledClassification(text)), durationMinutes),
      startTime: item.startTime || TIME_SLOTS[(index + 4) % TIME_SLOTS.length] || "9:00 AM",
      duration: item.duration || formatDurationLabel(durationMinutes),
      durationMinutes,
      status: item.status || (item.checked ? "completed" : "scheduled"),
      kind: item.kind || normalizeKind(inferScheduledClassification(text)),
    };
  });
}

function createDefaultPlan(): DayPlan {
  const weekdayChecklists = WEEKDAYS.reduce((acc, day) => {
    acc[day] = createChecklist(day);
    return acc;
  }, {} as Record<WeekdayName, ChecklistItem[]>);
  const day = todayWeekday();
  return {
    todayFocus: DEFAULT_ROLES[day],
    todayGoal: DEFAULT_ROLES[day],
    todayQuest: {
      id: `today-quest-${getDateKey()}`,
      title: "Choose one honest quest for today",
      date: getDateKey(),
      weekday: day,
      startTime: "9:00 AM",
      duration: "1 hr",
      durationMinutes: 60,
      steps: 2,
      status: "scheduled",
      kind: "progress",
      source: "todayQuest",
    },
    weekdayRoles: { ...DEFAULT_ROLES },
    weekdayChecklists,
  };
}

function normalizePlan(raw: Partial<DayPlan>): DayPlan {
  const fallback = createDefaultPlan();
  const roles = WEEKDAYS.reduce((acc, day) => {
    acc[day] = raw.weekdayRoles?.[day]?.trim() || (raw as Record<string, unknown>)[day]?.toString() || DEFAULT_ROLES[day];
    return acc;
  }, {} as Record<WeekdayName, string>);
  const checklists = WEEKDAYS.reduce((acc, day) => {
    acc[day] = createChecklist(day, raw.weekdayChecklists?.[day] || []);
    return acc;
  }, {} as Record<WeekdayName, ChecklistItem[]>);
  const quest = raw.todayQuest || fallback.todayQuest;
  const questTitle = quest.title?.trim() || raw.todayGoal?.trim() || fallback.todayQuest.title;
  return {
    todayFocus: raw.todayFocus?.trim() || raw.todayGoal?.trim() || roles[todayWeekday()],
    todayGoal: raw.todayFocus?.trim() || raw.todayGoal?.trim() || roles[todayWeekday()],
    todayQuest: {
      id: quest.id || `today-quest-${getDateKey()}`,
      title: questTitle,
      date: quest.date || getDateKey(),
      weekday: quest.weekday || todayWeekday(),
      startTime: quest.startTime || "9:00 AM",
      duration: quest.duration || "1 hr",
      durationMinutes: parseDurationMinutes(quest.durationMinutes ?? quest.duration, 60),
      steps: 2,
      status: quest.status || "scheduled",
      kind: quest.kind || normalizeKind(inferScheduledClassification(questTitle)),
      source: "todayQuest",
    },
    weekdayRoles: roles,
    weekdayChecklists: checklists,
  };
}

export default function DayPlanScreen() {
  const router = useRouter();
  const [dayPlan, setDayPlan] = useState<DayPlan>(() => createDefaultPlan());
  const [selectedDay, setSelectedDay] = useState<WeekdayName>(todayWeekday());
  const [isLowEnergy, setIsLowEnergy] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    loadDayPlan();
    loadLatestCheckIn();
  }, []);

  async function loadDayPlan() {
    const saved = await readJson<Partial<DayPlan> | null>(DAY_PLAN_KEY, null);
    if (saved) setDayPlan(normalizePlan(saved));
  }

  async function loadLatestCheckIn() {
    const checkIn = await readJson<CheckIn | null>(CHECKIN_KEY, null);
    setIsLowEnergy(checkIn?.mode === "Recovery" || Number(checkIn?.energy ?? 100) <= 60);
  }

  async function savePlan(nextPlan: DayPlan) {
    setDayPlan(nextPlan);
    await AsyncStorage.setItem(DAY_PLAN_KEY, JSON.stringify(nextPlan));
    setSavedMessage("Day Plan saved to Calendar.");
  }

  function updateFocus(value: string) {
    setSavedMessage("");
    setDayPlan((current: DayPlan) => ({ ...current, todayFocus: value, todayGoal: value }));
  }

  function updateTodayQuestTitle(value: string) {
    setSavedMessage("");
    setDayPlan((current: DayPlan) => ({
      ...current,
      todayQuest: { ...current.todayQuest, title: value, kind: normalizeKind(inferScheduledClassification(value)) },
    }));
  }

  function updateSelectedRole(value: string) {
    setSavedMessage("");
    setDayPlan((current: DayPlan) => ({
      ...current,
      weekdayRoles: { ...current.weekdayRoles, [selectedDay]: value },
      todayFocus: selectedDay === todayWeekday() ? value : current.todayFocus,
      todayGoal: selectedDay === todayWeekday() ? value : current.todayGoal,
    }));
  }

  function moveSelectedDay(direction: -1 | 1) {
    const index = WEEKDAYS.indexOf(selectedDay);
    const next = WEEKDAYS[(index + direction + WEEKDAYS.length) % WEEKDAYS.length];
    setSelectedDay(next);
  }

  function updateChecklistItem(itemId: string, patch: Partial<ChecklistItem>) {
    setSavedMessage("");
    setDayPlan((current: DayPlan) => ({
      ...current,
      weekdayChecklists: {
        ...current.weekdayChecklists,
        [selectedDay]: current.weekdayChecklists[selectedDay as WeekdayName].map((item: ChecklistItem) =>
          item.id === itemId
            ? {
                ...item,
                ...patch,
                durationMinutes: patch.duration ? parseDurationMinutes(patch.duration, patch.kind === "recovery" || item.kind === "recovery" ? 10 : 30) : patch.durationMinutes ?? item.durationMinutes,
                kind: patch.text ? normalizeKind(inferScheduledClassification(patch.text)) : patch.kind ?? item.kind,
                steps: patch.duration || patch.kind ? stepsForItem(patch.kind ?? item.kind, patch.duration ?? item.duration) : patch.steps ?? item.steps,
                status: patch.checked !== undefined ? (patch.checked ? "completed" : "scheduled") : patch.status ?? item.status,
              }
            : item
        ),
      },
    }));
  }

  function addChecklistItem(kind: "progress" | "recovery") {
    const text = kind === "progress" ? "New progress quest" : "New recovery action";
    const nextItem: ChecklistItem = {
      id: `${selectedDay}-${Date.now()}`,
      text,
      checked: false,
      steps: kind === "recovery" ? 0 : 1,
      startTime: "8:30 AM",
      duration: kind === "recovery" ? "10 min" : "30 min",
      durationMinutes: kind === "recovery" ? 10 : 30,
      status: "scheduled",
      kind,
    };
    setDayPlan((current: DayPlan) => ({
      ...current,
      weekdayChecklists: {
        ...current.weekdayChecklists,
        [selectedDay]: [...current.weekdayChecklists[selectedDay as WeekdayName], nextItem],
      },
    }));
  }


  function deleteChecklistItem(itemId: string) {
    setSavedMessage("");
    setDayPlan((current: DayPlan) => ({
      ...current,
      weekdayChecklists: {
        ...current.weekdayChecklists,
        [selectedDay]: current.weekdayChecklists[selectedDay as WeekdayName].filter((item: ChecklistItem) => item.id !== itemId),
      },
    }));
  }

  const selectedChecklist = dayPlan.weekdayChecklists[selectedDay] || [];
  const previewItems = useMemo(() => selectedChecklist.slice().sort((a: ChecklistItem, b: ChecklistItem) => TIME_SLOTS.indexOf(a.startTime) - TIME_SLOTS.indexOf(b.startTime)), [selectedChecklist]);
  const currentInterval = useMemo(() => getCurrentInterval(), []);
  const intervalItems = previewItems.filter((item: ChecklistItem) => timeInInterval(item.startTime, currentInterval));
  const questInInterval = timeInInterval(dayPlan.todayQuest.startTime, currentInterval);

  return (
    <View style={styles.pageRoot}>
      <View style={styles.phoneStage}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.default} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView style={styles.screenScroller} contentContainerStyle={styles.hudContent} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.heroPanel}>
              <View style={styles.bannerIcon}><Text style={styles.bannerIconText}>📜</Text></View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>DAY PLAN</Text>
                <Text style={styles.title}>DAY PLAN</Text>
                <Text style={styles.summary}>Set your quest, weekly role, and habit schedule.</Text>
              </View>
            </View>

            <View style={dayPlan.todayQuest.kind === "recovery" ? styles.panelPurple : styles.panelGold}>
              <Text style={styles.sectionTitle}>TODAY’S QUEST — QUEST BOARD • +2 STEPS</Text>
              <Text style={styles.helperText}>This is the actual quest for today. It appears on Calendar and is worth +2 steps.</Text>
              <TextInput style={styles.input} value={dayPlan.todayQuest.title} onChangeText={updateTodayQuestTitle} placeholder="Finish profile page layout" placeholderTextColor="#94A3B8" />
              <TimeStepper value={dayPlan.todayQuest.startTime} onChange={(next) => setDayPlan((current: DayPlan) => ({ ...current, todayQuest: { ...current.todayQuest, startTime: next } }))} />
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>WEEKLY HABIT ROLE</Text>
              <View style={styles.dayStepperRow}>
                <TouchableOpacity style={styles.arrowButton} onPress={() => moveSelectedDay(-1)}><Text style={styles.arrowText}>←</Text></TouchableOpacity>
                <View style={styles.dayStepperCenter}>
                  <Text style={styles.dayStepperTitle}>{selectedDay}</Text>
                  <Text style={styles.dayStepperRole}>{dayPlan.weekdayRoles[selectedDay]}</Text>
                </View>
                <TouchableOpacity style={styles.arrowButton} onPress={() => moveSelectedDay(1)}><Text style={styles.arrowText}>→</Text></TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
                {WEEKDAYS.map((day) => (
                  <TouchableOpacity key={day} style={[styles.dayButton, selectedDay === day && styles.dayButtonActive]} onPress={() => setSelectedDay(day)}>
                    <Text style={[styles.dayButtonText, selectedDay === day && styles.dayButtonTextActive]}>{day.slice(0, 3)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput style={styles.input} value={dayPlan.weekdayRoles[selectedDay]} onChangeText={updateSelectedRole} placeholder="Coding Day" placeholderTextColor="#94A3B8" />
            </View>

            <View style={styles.panel}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>CHECKLIST ITEMS</Text>
                <Text style={styles.helperPill}>{isLowEnergy ? "Recovery mode suggested" : "30-min slots"}</Text>
              </View>
              {selectedChecklist.map((item: ChecklistItem) => (
                <View key={item.id} style={[styles.checkCard, item.kind === "recovery" ? styles.recoveryBorder : styles.progressBorder]}>
                  <View style={styles.rowBetween}>
                    <TouchableOpacity onPress={() => updateChecklistItem(item.id, { checked: !item.checked })}>
                      <Text style={styles.checkToggle}>{item.checked ? "☑" : "☐"}</Text>
                    </TouchableOpacity>
                    <View style={styles.kindSwitchRow}>
                      <TouchableOpacity style={[styles.kindMiniButton, item.kind === "progress" && styles.kindProgressActive]} onPress={() => updateChecklistItem(item.id, { kind: "progress", duration: item.kind === "recovery" ? "30 min" : item.duration })}><Text style={styles.kindMiniText}>PROGRESS</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.kindMiniButton, item.kind === "recovery" && styles.kindRecoveryActive]} onPress={() => updateChecklistItem(item.id, { kind: "recovery", duration: item.kind === "progress" ? "10 min" : item.duration })}><Text style={styles.kindMiniText}>RECOVERY</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.deleteButton} onPress={() => deleteChecklistItem(item.id)}><Text style={styles.deleteButtonText}>🗑</Text></TouchableOpacity>
                    </View>
                  </View>
                  <TextInput style={styles.itemInput} value={item.text} onChangeText={(text: string) => updateChecklistItem(item.id, { text })} placeholder="Checklist item" placeholderTextColor="#94A3B8" />
                  <TimeStepper value={item.startTime} onChange={(next) => updateChecklistItem(item.id, { startTime: next })} />
                  <View style={styles.durationRow}>
                    {durationsForKind(item.kind).map((duration) => (
                      <TouchableOpacity key={duration} style={[styles.durationButton, item.duration === duration && styles.durationButtonActive]} onPress={() => updateChecklistItem(item.id, { duration, durationMinutes: parseDurationMinutes(duration, 30) })}>
                        <Text style={[styles.durationText, item.duration === duration && styles.optionTextActive]}>{duration}</Text>
                      </TouchableOpacity>
                    ))}
                    <Text style={styles.stepsText}>+{item.steps} step</Text>
                  </View>
                </View>
              ))}
              <View style={styles.addRow}>
                <TouchableOpacity style={styles.addProgressButton} onPress={() => addChecklistItem("progress")}><Text style={styles.addButtonText}>+ Progress</Text></TouchableOpacity>
                <TouchableOpacity style={styles.addRecoveryButton} onPress={() => addChecklistItem("recovery")}><Text style={styles.addButtonText}>+ Recovery</Text></TouchableOpacity>
              </View>
            </View>

            <View style={styles.previewPanel}>
              <Text style={styles.sectionTitle}>CALENDAR PREVIEW • {currentInterval.label}</Text>
              <Text style={styles.previewFocus}>Theme: {dayPlan.weekdayRoles[selectedDay]} — calendar marker only</Text>
              {selectedDay === todayWeekday() && questInInterval ? <Text style={styles.previewQuest}>Today’s Quest: {dayPlan.todayQuest.title} • {dayPlan.todayQuest.startTime} • +2 steps</Text> : null}
              {intervalItems.length === 0 && !(selectedDay === todayWeekday() && questInInterval) ? <Text style={styles.emptyPreview}>No planned items in this time block.</Text> : null}
              {intervalItems.map((item: ChecklistItem) => (
                <Text key={`preview-${item.id}`} style={item.kind === "recovery" ? styles.previewRecovery : styles.previewProgress}>{item.startTime} • {item.text} • {item.duration} • +{item.steps}</Text>
              ))}
            </View>

            {savedMessage ? <Text style={styles.savedMessage}>{savedMessage}</Text> : null}
            <TouchableOpacity style={styles.saveButton} onPress={() => savePlan(dayPlan)}><Text style={styles.saveButtonText}>SAVE DAY PLAN</Text></TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/calendar")}><Text style={styles.backButtonText}>BACK TO CALENDAR</Text></TouchableOpacity>
          </ScrollView>
          <BottomNav router={router} />
        </View>
      </View>
    </View>
  );
}

function TimeStepper({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <View style={styles.timeStepperRow}>
      <TouchableOpacity style={styles.timeStepButton} onPress={() => onChange(shiftTimeSlot(value, -1, TIME_SLOTS))}><Text style={styles.timeStepText}>←</Text></TouchableOpacity>
      <Text style={styles.timeValue}>{value}</Text>
      <TouchableOpacity style={styles.timeStepButton} onPress={() => onChange(shiftTimeSlot(value, 1, TIME_SLOTS))}><Text style={styles.timeStepText}>→</Text></TouchableOpacity>
    </View>
  );
}

function BottomNav({ router }: { router: ReturnType<typeof useRouter> }) {
  return <View style={styles.bottomNav}><TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}><Text style={styles.navIcon}>🏠</Text><Text style={styles.navLabel}>HOME</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/sleep")}><Text style={styles.navIcon}>🌙</Text><Text style={styles.navLabel}>SLEEP</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/mind")}><Text style={styles.navIcon}>🧠</Text><Text style={styles.navLabel}>MIND</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/path")}><Text style={styles.navIcon}>🌲</Text><Text style={styles.navLabel}>PATH</Text></TouchableOpacity><TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={() => router.push("/calendar")}><Text style={styles.navIcon}>📅</Text><Text style={[styles.navLabel, styles.navLabelActive]}>CAL</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/stats")}><Text style={styles.navIcon}>🎒</Text><Text style={styles.navLabel}>BAG</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#02040A", alignItems: "center", justifyContent: "center" },
  phoneStage: { width: "100%", maxWidth: MAX_FRAME_WIDTH, aspectRatio: APP_FRAME_ASPECT_RATIO, alignSelf: "center", backgroundColor: "#050814", overflow: "hidden", position: "relative", borderWidth: 2, borderColor: "#FBBF24" },
  backgroundLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
  backgroundImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  worldOverlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.62)" },
  screenScroller: { flex: 1 },
  hudContent: { minHeight: "100%", paddingTop: 18, paddingHorizontal: 14, paddingBottom: 104 },
  heroPanel: { backgroundColor: "rgba(5, 12, 24, 0.92)", borderWidth: 3, borderColor: "#D99B2B", borderRadius: 8, padding: 13, marginBottom: 12, flexDirection: "row", alignItems: "center" },
  bannerIcon: { width: 46, height: 66, backgroundColor: "rgba(70, 28, 112, 0.86)", borderWidth: 2, borderColor: "#FDE047", alignItems: "center", justifyContent: "center", marginRight: 12 },
  bannerIconText: { fontSize: 26 },
  heroCopy: { flex: 1 },
  heroKicker: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 },
  title: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 27, fontWeight: "900", letterSpacing: 1, lineHeight: 32 },
  summary: { color: "#F8E7A1", fontFamily: pixelFont, fontSize: 12, fontWeight: "800", lineHeight: 17, marginTop: 5 },
  panel: { backgroundColor: "rgba(8, 13, 24, 0.95)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#334155" },
  panelGold: { backgroundColor: "rgba(8, 13, 24, 0.95)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#FBBF24" },
  panelPurple: { backgroundColor: "rgba(31, 18, 56, 0.95)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#A78BFA" },
  sectionTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 0.5, lineHeight: 17, marginBottom: 8 },
  helperText: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, marginBottom: 8, fontWeight: "700" },
  helperPill: { color: "#67E8F9", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  input: { backgroundColor: "rgba(2, 6, 23, 0.95)", borderRadius: 5, padding: 12, fontSize: 15, color: "#F9FAFB", borderWidth: 2, borderColor: "#475569", fontWeight: "800" },
  itemInput: { color: "#F9FAFB", fontSize: 15, fontWeight: "800", borderBottomWidth: 1, borderBottomColor: "#334155", paddingVertical: 8, marginVertical: 6 },
  timeStepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 10 },
  timeStepButton: { width: 42, height: 36, borderWidth: 2, borderColor: "#FBBF24", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(69, 43, 8, 0.5)" },
  timeStepText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" },
  timeValue: { minWidth: 120, color: "#F8FAFC", textAlign: "center", fontFamily: pixelFont, fontSize: 15, fontWeight: "900" },
  dayStepperRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  arrowButton: { width: 42, height: 42, borderWidth: 2, borderColor: "#FBBF24", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(69, 43, 8, 0.55)" },
  arrowText: { color: "#FDE68A", fontSize: 18, fontWeight: "900" },
  dayStepperCenter: { flex: 1, alignItems: "center" },
  dayStepperTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" },
  dayStepperRole: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginTop: 3 },
  dayStrip: { paddingBottom: 8, gap: 8 },
  dayButton: { borderWidth: 2, borderColor: "#334155", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(15,23,42,0.9)" },
  dayButtonActive: { borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.65)" },
  dayButtonText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  dayButtonTextActive: { color: "#FDE68A" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  checkCard: { backgroundColor: "rgba(15, 23, 42, 0.92)", borderWidth: 2, borderRadius: 8, padding: 10, marginBottom: 10 },
  progressBorder: { borderColor: "#FBBF24" },
  recoveryBorder: { borderColor: "#A78BFA" },
  checkToggle: { color: "#F8FAFC", fontSize: 24, marginRight: 8 },
  kindSwitchRow: { flexDirection: "row", gap: 6 },
  kindMiniButton: { borderWidth: 1, borderColor: "#475569", paddingVertical: 5, paddingHorizontal: 7, backgroundColor: "rgba(2,6,23,0.7)" },
  kindProgressActive: { borderColor: "#FBBF24", backgroundColor: "rgba(113,63,18,0.8)" },
  kindRecoveryActive: { borderColor: "#A78BFA", backgroundColor: "rgba(88,28,135,0.8)" },
  kindMiniText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  deleteButton: { width: 34, height: 30, borderWidth: 1, borderColor: "#FCA5A5", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(127,29,29,0.45)" },
  deleteButtonText: { fontSize: 14 },
  durationRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  durationButton: { borderWidth: 2, borderColor: "#334155", paddingVertical: 7, paddingHorizontal: 10, backgroundColor: "rgba(2,6,23,0.8)" },
  durationButtonActive: { borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.65)" },
  durationText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  optionTextActive: { color: "#FDE68A" },
  stepsText: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  addRow: { flexDirection: "row", gap: 10 },
  addProgressButton: { flex: 1, borderWidth: 2, borderColor: "#FBBF24", padding: 11, alignItems: "center", backgroundColor: "rgba(69,43,8,0.65)" },
  addRecoveryButton: { flex: 1, borderWidth: 2, borderColor: "#A78BFA", padding: 11, alignItems: "center", backgroundColor: "rgba(88,28,135,0.65)" },
  addButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  previewPanel: { backgroundColor: "rgba(4, 18, 30, 0.94)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#38BDF8" },
  previewFocus: { color: "#86EFAC", fontSize: 13, fontWeight: "800", marginBottom: 6 },
  previewQuest: { color: "#FDE68A", fontSize: 13, fontWeight: "900", marginBottom: 6 },
  previewProgress: { color: "#FDE68A", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  previewRecovery: { color: "#C4B5FD", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  emptyPreview: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  savedMessage: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", textAlign: "center", marginBottom: 10 },
  saveButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 13, alignItems: "center", marginBottom: 10 },
  saveButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  backButton: { borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.6)", paddingVertical: 13, alignItems: "center", marginBottom: 10 },
  backButtonText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  bottomNav: { position: "absolute", bottom: 8, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(8,17,34,0.96)", borderWidth: 2, borderColor: "#334155", borderRadius: 16, padding: 6 },
  navButton: { flex: 1, alignItems: "center", borderRadius: 12, paddingVertical: 6, borderWidth: 1, borderColor: "transparent" },
  navButtonActive: { backgroundColor: "rgba(120, 53, 15, 0.55)", borderColor: "#FBBF24" },
  navIcon: { fontSize: 20 },
  navLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginTop: 2 },
  navLabelActive: { color: "#FBBF24" },
});