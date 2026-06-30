import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { syncDayPlanScheduledItems } from "../lib/progressSync";
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
  weekdays: WeekdayName[];
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

function parseTimeInput(raw: string): string {
  const s = raw.trim().toUpperCase();
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    const p = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(min).padStart(2, "0")} ${p}`;
  }
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (m12) {
    let h = Number(m12[1]);
    const min = Number(m12[2] ?? "0");
    const p = m12[3];
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    const fp = h >= 12 ? "PM" : "AM";
    const fh = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${fh}:${String(min).padStart(2, "0")} ${fp}`;
  }
  const mBare = s.match(/^(\d{1,2})$/);
  if (mBare) {
    const h = Number(mBare[1]);
    if (h >= 0 && h <= 23) {
      const p = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12}:00 ${p}`;
    }
  }
  return "";
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

function createChecklist(day: WeekdayName, saved: Partial<ChecklistItem>[] = [], useDefaults = false): ChecklistItem[] {
  if (saved.length === 0 && !useDefaults) return [];
  const source: Partial<ChecklistItem>[] = saved.length > 0 ? saved : DEFAULT_CHECKLIST.map((text) => ({ text }));
  return source.map((item, index) => {
    const text = item.text?.trim() || DEFAULT_CHECKLIST[index] || "Habit action";
    const durationMinutes = parseDurationMinutes(item.durationMinutes ?? item.duration, 30);
    const weekdays =
      Array.isArray(item.weekdays) && item.weekdays.length > 0
        ? item.weekdays
        : [day];
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
      weekdays,
    };
  });
}

function createDefaultPlan(): DayPlan {
  const weekdayChecklists = WEEKDAYS.reduce((acc, day) => {
    acc[day] = day === todayWeekday() ? createChecklist(day, [], true) : [];
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
  const [showInfo, setShowInfo] = useState(false);

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
    void trackEvent(ANALYTICS_EVENTS.day_plan_saved);
    void syncDayPlanScheduledItems();
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

  function toggleChecklistWeekday(itemId: string, weekday: WeekdayName) {
    setSavedMessage("");
    setDayPlan((current: DayPlan) => ({
      ...current,
      weekdayChecklists: {
        ...current.weekdayChecklists,
        [selectedDay]: current.weekdayChecklists[selectedDay as WeekdayName].map((item: ChecklistItem) => {
          if (item.id !== itemId) return item;
          const hasDay = item.weekdays.includes(weekday);
          const weekdays = hasDay ? item.weekdays.filter((d) => d !== weekday) : [...item.weekdays, weekday];
          return { ...item, weekdays: weekdays.length > 0 ? weekdays : [selectedDay] };
        }),
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
      weekdays: [selectedDay],
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
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
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

            <View style={styles.eviePanel}>
              <Image source={uiAssets.guides.evie} style={styles.evieAvatar} resizeMode="contain" />
              <View style={styles.evieCopy}>
                <Text style={styles.evieName}>EVIE</Text>
                <Text style={styles.evieText}>Day Plan separates your daily focus from the quest that earns steps. Checklist habits only add steps when checked off.</Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.panelGreen}>
              <Text style={styles.sectionTitle}>TODAY’S FOCUS — THEME ONLY</Text>
              <Text style={styles.helperText}>Your daily role. Shown on Calendar as a green marker. No steps awarded.</Text>
              <TextInput style={styles.input} value={dayPlan.todayFocus} onChangeText={updateFocus} placeholder="Coding Day" placeholderTextColor="#94A3B8" />
            </View>

            <View style={dayPlan.todayQuest.kind === "recovery" ? styles.panelPurple : styles.panelGold}>
              <Text style={styles.sectionTitle}>TODAY’S QUEST — QUEST BOARD • +2 STEPS</Text>
              <Text style={styles.helperText}>This is the actual quest for today. It appears on Calendar and earns +2 steps only when completed.</Text>
              <TextInput style={styles.input} value={dayPlan.todayQuest.title} onChangeText={updateTodayQuestTitle} placeholder="Finish profile page layout" placeholderTextColor="#94A3B8" />
              <TimeStepper value={dayPlan.todayQuest.startTime} onChange={(next) => setDayPlan((current: DayPlan) => ({ ...current, todayQuest: { ...current.todayQuest, startTime: next } }))} />
              {dayPlan.todayQuest.status !== "completed" ? (
                <TouchableOpacity style={styles.reflectButton} onPress={() => router.push("/reflection")}>
                  <Text style={styles.reflectButtonText}>REFLECT ON TODAY’S QUEST</Text>
                </TouchableOpacity>
              ) : null}
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
                  <Text style={styles.weekdayLabel}>SHOW ON</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekdayToggleRow}>
                    {WEEKDAYS.map((day) => {
                      const active = item.weekdays.includes(day);
                      return (
                        <TouchableOpacity key={`${item.id}-${day}`} style={[styles.weekdayToggle, active && styles.weekdayToggleActive]} onPress={() => toggleChecklistWeekday(item.id, day)}>
                          <Text style={[styles.weekdayToggleText, active && styles.weekdayToggleTextActive]}>{day.slice(0, 3)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {!item.checked && selectedDay === todayWeekday() ? (
                    <TouchableOpacity style={styles.reflectButton} onPress={() => router.push("/reflection")}>
                      <Text style={styles.reflectButtonText}>REFLECT</Text>
                    </TouchableOpacity>
                  ) : null}
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
          {showInfo ? <InfoOverlay onClose={() => setShowInfo(false)} /> : null}
        </View>
      </View>
    </View>
  );
}

function TimeStepper({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [timeError, setTimeError] = useState("");

  useEffect(() => { setDraft(value); }, [value]);

  function commitDraft() {
    const parsed = parseTimeInput(draft);
    if (parsed) {
      setTimeError("");
      onChange(parsed);
      setDraft(parsed);
    } else {
      setTimeError("Try: 9 AM, 2:30 PM, or 14:00");
    }
  }

  return (
    <View>
      <View style={styles.timeStepperRow}>
        <TouchableOpacity style={styles.timeStepButton} onPress={() => onChange(shiftTimeSlot(value, -1, TIME_SLOTS))}><Text style={styles.timeStepText}>←</Text></TouchableOpacity>
        <TextInput
          style={styles.timeValue}
          value={draft}
          onChangeText={(t) => { setDraft(t); setTimeError(""); }}
          onBlur={commitDraft}
          onSubmitEditing={commitDraft}
          returnKeyType="done"
          placeholder="9:00 AM"
          placeholderTextColor="#64748B"
        />
        <TouchableOpacity style={styles.timeStepButton} onPress={() => onChange(shiftTimeSlot(value, 1, TIME_SLOTS))}><Text style={styles.timeStepText}>→</Text></TouchableOpacity>
      </View>
      {timeError ? <Text style={styles.timeError}>{timeError}</Text> : null}
    </View>
  );
}

function InfoOverlay({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.infoOverlay}>
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>DAY PLAN</Text>
        <Text style={styles.infoBullet}>{"• Today's Focus is your daily theme. It appears on Calendar as a green marker but earns no steps."}</Text>
        <Text style={styles.infoBullet}>{"• Today's Quest is the actual goal for today. It earns +2 steps only when you mark it complete."}</Text>
        <Text style={styles.infoBullet}>{"• Checklist items are recurring habits. Each earns steps only when checked off — never on save."}</Text>
        <Text style={styles.infoBullet}>{"• Use Reflect on any item you missed to log a reflection."}</Text>
        <TouchableOpacity style={styles.infoClose} onPress={onClose}>
          <Text style={styles.infoCloseText}>RETURN</Text>
        </TouchableOpacity>
      </View>
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
  timeValue: { flex: 1, color: "#F8FAFC", textAlign: "center", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", borderBottomWidth: 1, borderBottomColor: "#475569", paddingVertical: 4 },
  timeError: { color: "#FCA5A5", fontFamily: pixelFont, fontSize: 10, textAlign: "center", marginTop: 4 },
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
  weekdayLabel: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginTop: 8, marginBottom: 4 },
  weekdayToggleRow: { gap: 6, paddingBottom: 4 },
  weekdayToggle: { borderWidth: 1, borderColor: "#475569", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "rgba(2,6,23,0.7)" },
  weekdayToggleActive: { borderColor: "#FBBF24", backgroundColor: "rgba(113,63,18,0.8)" },
  weekdayToggleText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  weekdayToggleTextActive: { color: "#FDE68A" },
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
  eviePanel: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(8,13,24,0.95)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, padding: 10, marginBottom: 12 },
  evieAvatar: { width: 44, height: 52, marginRight: 10 },
  evieCopy: { flex: 1 },
  evieName: { color: "#FDE047", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  evieText: { color: "#CBD5E1", fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  infoBtn: { width: 28, height: 28, borderWidth: 2, borderColor: "#FBBF24", borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(113,63,18,0.7)", marginLeft: 8 },
  infoBtnText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  panelGreen: { backgroundColor: "rgba(5,28,16,0.95)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#22C55E" },
  reflectButton: { borderWidth: 1, borderColor: "#A78BFA", paddingVertical: 7, paddingHorizontal: 12, backgroundColor: "rgba(88,28,135,0.45)", marginTop: 8, alignSelf: "flex-start" },
  reflectButtonText: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  infoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.82)", justifyContent: "center", alignItems: "center", padding: 20, zIndex: 25 },
  infoCard: { backgroundColor: "rgba(8,13,24,0.99)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 12, padding: 16, width: "100%" },
  infoTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", marginBottom: 10 },
  infoBullet: { color: "#CBD5E1", fontSize: 13, lineHeight: 20, fontWeight: "700", marginBottom: 6 },
  infoClose: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 11, alignItems: "center", marginTop: 12 },
  infoCloseText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  bottomNav: { position: "absolute", bottom: 8, left: 8, right: 8, height: 62, flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(4,8,16,0.98)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 5, padding: 4 },
  navButton: { flex: 1, backgroundColor: "#111827", borderWidth: 2, borderColor: "#3A4558", borderRadius: 3, paddingVertical: 4, marginHorizontal: 2, alignItems: "center", justifyContent: "center" },
  navButtonActive: { backgroundColor: "#162314", borderColor: "#FBBF24" },
  navIcon: { fontSize: 18 },
  navLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 1 },
  navLabelActive: { color: "#FDE68A" },
});