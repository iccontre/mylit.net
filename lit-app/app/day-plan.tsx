import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { FormScreen } from "../components/FormScreen";
import { BottomNav } from "../components/BottomNav";
import { formPageContent, formStyles } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import {
  DAY_PLAN_KEY,
  MAX_CHECKLIST_ITEMS_PER_DAY,
  TOMORROW_QUEUE_KEY,
  computeUserScheduledMinutesForDay,
  formatPlannedDurationLabel,
  getChecklistItemsForDay,
  getQuestCapacityMinutes,
} from "../lib/questProgress";
import { sanitizeDayPlanChecklists } from "../lib/dayPlanChecklist";
import { persistProgressKeys } from "../lib/progressStore";
import { setChecklistItemChecked, syncDayPlanScheduledItems } from "../lib/progressSync";
import {
  collectQuickThoughtScheduledItems,
  findScheduleOverlap,
  formatDurationLabel,
  generateTimeSlots,
  getDateKey,
  getRequiredRecoveryBlockForDate,
  getStepsForDuration,
  inferScheduledClassification,
  parseDurationMinutes,
  shiftTimeSlot,
  wouldTriggerRecoveryLock,
  type ScheduledClassification,
  type ScheduledQuestLike,
  type ScheduledStatus,
} from "../lib/scheduling";

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
  steps: number;
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

type QuickThoughtLike = {
  id?: string;
  date?: string;
  dateKey?: string;
  startTime?: string;
  time?: string;
  duration?: string;
  durationMinutes?: number;
  status?: string;
  completedAt?: string;
  title?: string;
  text?: string;
};

const CHECKIN_KEY = "lit_latest_checkin";
const TIME_SLOTS = generateTimeSlots(7, 22, 30);
/** Checklist items build habits — one fixed set of durations regardless of Progress/Recovery. */
const CHECKLIST_DURATIONS = ["15 min", "30 min", "45 min", "1 hr"];
const WEEKDAYS: WeekdayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEFAULT_ROLES: Record<WeekdayName, string> = {
  Monday: "",
  Tuesday: "",
  Wednesday: "",
  Thursday: "",
  Friday: "",
  Saturday: "",
  Sunday: "",
};

const EMPTY_CHECKLIST_COPY = "No checklist items yet. Add one small habit when you're ready.";
const RECOVERY_LOCK_WARNING =
  "Adding this task will create 2 hours of straight work, meaning there has to be 1 hour of recovery time after — you won't be able to do any tasks during that time. Tap Save again to confirm.";

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

/** Maps a recurring weekday to its date within the current Mon–Sun week, for date-based scheduling checks. */
function resolveDateForWeekday(weekday: WeekdayName): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const jsDay = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() + (jsDay === 0 ? -6 : 1 - jsDay));
  const order: WeekdayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const target = new Date(monday);
  target.setDate(monday.getDate() + order.indexOf(weekday));
  return getDateKey(target);
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

function stepsForItem(duration: string | number) {
  return getStepsForDuration(duration);
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
  if (saved.length === 0) return [];
  return saved.map((item, index) => {
    const text = item.text?.trim() || "Habit action";
    const durationMinutes = parseDurationMinutes(item.durationMinutes ?? item.duration, 30);
    const weekdays =
      Array.isArray(item.weekdays) && item.weekdays.length > 0
        ? item.weekdays
        : [day];
    return {
      id: item.id || `${day}-${index}-${text}`,
      text,
      checked: Boolean(item.checked),
      steps: item.steps ?? stepsForItem(durationMinutes),
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
    acc[day] = [];
    return acc;
  }, {} as Record<WeekdayName, ChecklistItem[]>);
  const day = todayWeekday();
  return {
    todayFocus: "",
    todayGoal: "",
    todayQuest: {
      id: `today-quest-${getDateKey()}`,
      title: "Choose one honest quest for today",
      date: getDateKey(),
      weekday: day,
      startTime: "9:00 AM",
      duration: "1 hr",
      durationMinutes: 60,
      steps: getStepsForDuration(60),
      status: "scheduled",
      kind: "progress",
      source: "todayQuest",
    },
    weekdayRoles: { ...DEFAULT_ROLES },
    weekdayChecklists,
  };
}

function findChecklistBucket(plan: DayPlan, itemId: string): WeekdayName | null {
  for (const day of WEEKDAYS) {
    if (plan.weekdayChecklists[day].some((item) => item.id === itemId)) {
      return day;
    }
  }
  return null;
}

function normalizePlan(raw: Partial<DayPlan>): DayPlan {
  const fallback = createDefaultPlan();
  const roles = WEEKDAYS.reduce((acc, day) => {
    acc[day] = raw.weekdayRoles?.[day]?.trim() || (raw as Record<string, unknown>)[day]?.toString() || "";
    return acc;
  }, {} as Record<WeekdayName, string>);
  const checklists = WEEKDAYS.reduce((acc, day) => {
    const saved = sanitizeDayPlanChecklists(raw.weekdayChecklists)[day] || [];
    acc[day] = createChecklist(day, saved as Partial<ChecklistItem>[]);
    return acc;
  }, {} as Record<WeekdayName, ChecklistItem[]>);
  const quest = raw.todayQuest || fallback.todayQuest;
  const questTitle = quest.title?.trim() || raw.todayGoal?.trim() || fallback.todayQuest.title;
  return {
    todayFocus: roles[todayWeekday()],
    todayGoal: roles[todayWeekday()],
    todayQuest: {
      id: quest.id || `today-quest-${getDateKey()}`,
      title: questTitle,
      // Today's Quest always belongs to the current day, so re-anchor its date/weekday
      // on load — otherwise a quest saved on a prior day lands on the wrong Calendar cell.
      date: getDateKey(),
      weekday: todayWeekday(),
      startTime: quest.startTime || "9:00 AM",
      duration: quest.duration || "1 hr",
      durationMinutes: parseDurationMinutes(quest.durationMinutes ?? quest.duration, 60),
      steps: getStepsForDuration(parseDurationMinutes(quest.durationMinutes ?? quest.duration, 60)),
      status: quest.status || "scheduled",
      kind: quest.kind || normalizeKind(inferScheduledClassification(questTitle)),
      source: "todayQuest",
    },
    weekdayRoles: roles,
    weekdayChecklists: checklists,
  };
}

/** Fields that count when deciding whether a checklist item has unsaved edits. */
function checklistItemSignature(item: ChecklistItem): string {
  return JSON.stringify({
    text: item.text,
    startTime: item.startTime,
    duration: item.duration,
    durationMinutes: item.durationMinutes,
    kind: item.kind,
    weekdays: [...item.weekdays].sort(),
  });
}

export default function DayPlanScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [dayPlan, setDayPlan] = useState<DayPlan>(() => createDefaultPlan());
  const [selectedDay, setSelectedDay] = useState<WeekdayName>(todayWeekday());
  const [isLowEnergy, setIsLowEnergy] = useState(false);
  const [boardMode, setBoardMode] = useState<"Progress" | "Recovery">("Progress");
  const [savedMessage, setSavedMessage] = useState("");
  const [conflictMessage, setConflictMessage] = useState("");
  const [recoveryWarning, setRecoveryWarning] = useState("");
  const [pendingRecoveryConfirmId, setPendingRecoveryConfirmId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [quickThoughts, setQuickThoughts] = useState<QuickThoughtLike[]>([]);
  const committedPlanRef = useRef<DayPlan>(createDefaultPlan());

  useEffect(() => {
    loadDayPlan();
    loadLatestCheckIn();
    loadQuickThoughts();
  }, []);

  async function loadQuickThoughts() {
    const saved = await readJson<QuickThoughtLike[]>(TOMORROW_QUEUE_KEY, []);
    setQuickThoughts(Array.isArray(saved) ? saved : []);
  }

  async function loadDayPlan() {
    const saved = await readJson<Partial<DayPlan> | null>(DAY_PLAN_KEY, null);
    if (!saved) {
      committedPlanRef.current = createDefaultPlan();
      return;
    }
    const cleanedChecklists = sanitizeDayPlanChecklists(
      saved.weekdayChecklists as Partial<Record<WeekdayName, Partial<ChecklistItem>[]>> | undefined
    );
    const normalized = normalizePlan({
      ...saved,
      weekdayChecklists: cleanedChecklists as DayPlan["weekdayChecklists"],
    });
    setDayPlan(normalized);
    committedPlanRef.current = normalized;
    if (JSON.stringify(cleanedChecklists) !== JSON.stringify(saved.weekdayChecklists)) {
      await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(normalized) });
    }
  }

  /** Finds an item's committed (already-persisted) version, if it was ever saved. */
  function findCommittedChecklistItem(itemId: string): ChecklistItem | null {
    for (const day of WEEKDAYS) {
      const found = committedPlanRef.current.weekdayChecklists[day]?.find((entry) => entry.id === itemId);
      if (found) return found;
    }
    return null;
  }

  function isChecklistItemDirty(item: ChecklistItem): boolean {
    const committed = findCommittedChecklistItem(item.id);
    if (!committed) return true;
    return checklistItemSignature(committed) !== checklistItemSignature(item);
  }

  function isTodayQuestDirty(): boolean {
    const committed = committedPlanRef.current.todayQuest;
    return committed.title !== dayPlan.todayQuest.title || committed.startTime !== dayPlan.todayQuest.startTime;
  }

  /** Every already-saved checklist item + Today's Quest, expanded one row per weekday it applies to. */
  function collectCommittedSlots(excludeId: string): { id: string; title: string; weekday: WeekdayName; startTime: string; durationMinutes: number }[] {
    const slots: { id: string; title: string; weekday: WeekdayName; startTime: string; durationMinutes: number }[] = [];
    for (const day of WEEKDAYS) {
      for (const entry of committedPlanRef.current.weekdayChecklists[day] ?? []) {
        if (entry.id === excludeId) continue;
        for (const weekday of entry.weekdays) {
          slots.push({ id: entry.id, title: entry.text, weekday, startTime: entry.startTime, durationMinutes: entry.durationMinutes });
        }
      }
    }
    const quest = committedPlanRef.current.todayQuest;
    if (quest.id !== excludeId && quest.title.trim()) {
      slots.push({ id: quest.id, title: quest.title, weekday: quest.weekday, startTime: quest.startTime, durationMinutes: quest.durationMinutes });
    }
    return slots;
  }

  /** Checklist items/Today's Quest don't run on a timer, but their times still can't overlap another scheduled item on the same day. */
  function findTimeConflictTitle(candidateId: string, weekdays: WeekdayName[], startTime: string, durationMinutes: number): string | null {
    const slots = collectCommittedSlots(candidateId);
    for (const weekday of weekdays) {
      const conflict = findScheduleOverlap(
        { id: candidateId, weekday, startTime, durationMinutes },
        slots.filter((slot) => slot.weekday === weekday),
        candidateId
      );
      if (conflict) return (conflict as { title?: string }).title || "another scheduled item";
    }
    return null;
  }

  /** Everything already saved (checklist habits + Today's Quest + Quests), converted to date-based items for recovery-lock math. */
  function committedItemsAsScheduledLike(excludeId: string): Partial<ScheduledQuestLike>[] {
    const slots = collectCommittedSlots(excludeId).map((slot) => ({
      id: slot.id,
      title: slot.title,
      date: resolveDateForWeekday(slot.weekday),
      startTime: slot.startTime,
      durationMinutes: slot.durationMinutes,
    }));
    const quests = collectQuickThoughtScheduledItems(quickThoughts).filter((entry) => entry.id !== excludeId);
    return [...slots, ...quests];
  }

  /** Whether saving this checklist item (on any of its weekdays) would trigger the 2-hour recovery lock. */
  function checklistItemTriggersRecoveryLock(item: ChecklistItem): boolean {
    const existing = committedItemsAsScheduledLike(item.id);
    return item.weekdays.some((weekday) => {
      const date = resolveDateForWeekday(weekday);
      return wouldTriggerRecoveryLock({ id: item.id, date, startTime: item.startTime, durationMinutes: item.durationMinutes }, existing, date);
    });
  }

  function todayQuestTriggersRecoveryLock(): boolean {
    const existing = committedItemsAsScheduledLike(dayPlan.todayQuest.id);
    const date = resolveDateForWeekday(dayPlan.todayQuest.weekday);
    return wouldTriggerRecoveryLock(
      { id: dayPlan.todayQuest.id, date, startTime: dayPlan.todayQuest.startTime, durationMinutes: dayPlan.todayQuest.durationMinutes },
      existing,
      date
    );
  }

  /** Persists exactly one checklist item into the committed plan without pulling in other unsaved drafts. */
  async function saveChecklistItem(itemId: string) {
    const bucketDay = findChecklistBucket(dayPlan, itemId);
    const item = bucketDay ? dayPlan.weekdayChecklists[bucketDay].find((entry) => entry.id === itemId) : null;
    if (!bucketDay || !item || !item.text.trim()) return;

    const conflictTitle = findTimeConflictTitle(itemId, item.weekdays, item.startTime, item.durationMinutes);
    if (conflictTitle) {
      setConflictMessage(`${item.startTime} interferes with "${conflictTitle}" — change the time.`);
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
      return;
    }
    setConflictMessage("");

    if (pendingRecoveryConfirmId !== itemId && checklistItemTriggersRecoveryLock(item)) {
      setRecoveryWarning(RECOVERY_LOCK_WARNING);
      setPendingRecoveryConfirmId(itemId);
      return;
    }
    setRecoveryWarning("");
    setPendingRecoveryConfirmId(null);

    const nextCommitted: DayPlan = {
      ...committedPlanRef.current,
      weekdayChecklists: {
        ...committedPlanRef.current.weekdayChecklists,
        [bucketDay]: (() => {
          const existing = committedPlanRef.current.weekdayChecklists[bucketDay] ?? [];
          const withoutItem = existing.filter((entry) => entry.id !== itemId);
          return [...withoutItem, item];
        })(),
      },
    };

    committedPlanRef.current = nextCommitted;
    await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(nextCommitted) });
    void trackEvent(ANALYTICS_EVENTS.day_plan_saved, { scope: "checklistItem" });
    void syncDayPlanScheduledItems();
  }

  /** Persists Today's Quest (title/time) into the committed plan independently of Weekly Habit or checklist drafts. */
  async function saveTodayQuest() {
    if (!dayPlan.todayQuest.title.trim()) return;

    const conflictTitle = findTimeConflictTitle(
      dayPlan.todayQuest.id,
      [dayPlan.todayQuest.weekday],
      dayPlan.todayQuest.startTime,
      dayPlan.todayQuest.durationMinutes
    );
    if (conflictTitle) {
      setConflictMessage(`${dayPlan.todayQuest.startTime} interferes with "${conflictTitle}" — change the time.`);
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
      return;
    }
    setConflictMessage("");

    if (pendingRecoveryConfirmId !== dayPlan.todayQuest.id && todayQuestTriggersRecoveryLock()) {
      setRecoveryWarning(RECOVERY_LOCK_WARNING);
      setPendingRecoveryConfirmId(dayPlan.todayQuest.id);
      return;
    }
    setRecoveryWarning("");
    setPendingRecoveryConfirmId(null);

    const nextCommitted: DayPlan = {
      ...committedPlanRef.current,
      todayQuest: dayPlan.todayQuest,
    };
    committedPlanRef.current = nextCommitted;
    await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(nextCommitted) });
    void trackEvent(ANALYTICS_EVENTS.day_plan_saved, { scope: "todayQuest" });
    void syncDayPlanScheduledItems();
  }

  /** Checking a checklist item off marks it done for the day immediately — no Save Quest step needed. */
  async function toggleChecklistItemChecked(itemId: string) {
    const bucketDay = findChecklistBucket(dayPlan, itemId);
    const item = bucketDay ? dayPlan.weekdayChecklists[bucketDay].find((entry) => entry.id === itemId) : null;
    if (!bucketDay || !item) return;

    const nextChecked = !item.checked;
    const patch = { checked: nextChecked, status: (nextChecked ? "completed" : "scheduled") as ScheduledStatus };
    updateChecklistItem(itemId, patch);

    const persisted = await setChecklistItemChecked(itemId, nextChecked);
    if (persisted) {
      committedPlanRef.current = {
        ...committedPlanRef.current,
        weekdayChecklists: {
          ...committedPlanRef.current.weekdayChecklists,
          [bucketDay]: (committedPlanRef.current.weekdayChecklists[bucketDay] ?? []).map((entry) =>
            entry.id === itemId ? { ...entry, ...patch } : entry
          ),
        },
      };
    }
  }

  async function loadLatestCheckIn() {
    const checkIn = await readJson<CheckIn | null>(CHECKIN_KEY, null);
    setIsLowEnergy(checkIn?.mode === "Recovery" || Number(checkIn?.energy ?? 100) <= 60);
    setBoardMode(checkIn?.mode === "Recovery" ? "Recovery" : "Progress");
  }

  /** Saves Weekly Habit only — Today's Quest and checklist items each have their own Save Quest button. */
  async function saveWeeklyHabit() {
    const nextCommitted: DayPlan = {
      ...committedPlanRef.current,
      weekdayRoles: dayPlan.weekdayRoles,
      todayFocus: dayPlan.weekdayRoles[todayWeekday()],
      todayGoal: dayPlan.weekdayRoles[todayWeekday()],
    };
    committedPlanRef.current = nextCommitted;
    await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(nextCommitted) });
    setSavedMessage("Weekly Habit saved to Calendar.");
    void trackEvent(ANALYTICS_EVENTS.day_plan_saved, { scope: "weeklyHabit" });
    void syncDayPlanScheduledItems();
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

  function updateTodayQuestTitle(value: string) {
    setSavedMessage("");
    if (pendingRecoveryConfirmId === dayPlan.todayQuest.id) {
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
    }
    setDayPlan((current: DayPlan) => ({
      ...current,
      todayQuest: { ...current.todayQuest, title: value, kind: normalizeKind(inferScheduledClassification(value)) },
    }));
  }

  function updateTodayQuestStartTime(next: string) {
    if (pendingRecoveryConfirmId === dayPlan.todayQuest.id) {
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
    }
    setDayPlan((current: DayPlan) => ({ ...current, todayQuest: { ...current.todayQuest, startTime: next } }));
  }

  function updateChecklistItem(itemId: string, patch: Partial<ChecklistItem>) {
    setSavedMessage("");
    if (pendingRecoveryConfirmId === itemId) {
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
    }
    setDayPlan((current: DayPlan) => {
      const bucketDay = findChecklistBucket(current, itemId) ?? selectedDay;
      return {
        ...current,
        weekdayChecklists: {
          ...current.weekdayChecklists,
          [bucketDay]: current.weekdayChecklists[bucketDay].map((item: ChecklistItem) =>
            item.id === itemId
              ? {
                  ...item,
                  ...patch,
                  durationMinutes: patch.duration ? parseDurationMinutes(patch.duration, 30) : patch.durationMinutes ?? item.durationMinutes,
                  kind: patch.text ? normalizeKind(inferScheduledClassification(patch.text)) : patch.kind ?? item.kind,
                  steps: patch.duration ? stepsForItem(patch.duration) : patch.steps ?? item.steps,
                  status: patch.checked !== undefined ? (patch.checked ? "completed" : "scheduled") : patch.status ?? item.status,
                }
              : item
          ),
        },
      };
    });
  }

  function toggleChecklistWeekday(itemId: string, weekday: WeekdayName) {
    setSavedMessage("");
    if (pendingRecoveryConfirmId === itemId) {
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
    }
    setDayPlan((current: DayPlan) => {
      const bucketDay = findChecklistBucket(current, itemId) ?? selectedDay;
      const currentItem = current.weekdayChecklists[bucketDay].find((entry) => entry.id === itemId);
      const alreadyOnThatDay = currentItem?.weekdays.includes(weekday) ?? false;
      if (!alreadyOnThatDay && getChecklistItemsForDay(current, weekday).length >= MAX_CHECKLIST_ITEMS_PER_DAY) {
        setSavedMessage(`${weekday} already has ${MAX_CHECKLIST_ITEMS_PER_DAY} checklist items — the daily max.`);
        return current;
      }
      return {
        ...current,
        weekdayChecklists: {
          ...current.weekdayChecklists,
          [bucketDay]: current.weekdayChecklists[bucketDay].map((item: ChecklistItem) => {
            if (item.id !== itemId) return item;
            const hasDay = item.weekdays.includes(weekday);
            const weekdays = hasDay ? item.weekdays.filter((d) => d !== weekday) : [...item.weekdays, weekday];
            return { ...item, weekdays: weekdays.length > 0 ? weekdays : [selectedDay] };
          }),
        },
      };
    });
  }

  function addChecklistItem(kind: "progress" | "recovery") {
    if (checklistCountForSelectedDay >= MAX_CHECKLIST_ITEMS_PER_DAY) {
      setSavedMessage(`${MAX_CHECKLIST_ITEMS_PER_DAY} checklist items is the daily max — that's enough to build the habit without overloading the day.`);
      return;
    }
    const nextItem: ChecklistItem = {
      id: `${selectedDay}-${Date.now()}`,
      text: "",
      checked: false,
      steps: 1,
      startTime: "8:30 AM",
      duration: "30 min",
      durationMinutes: 30,
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
    setDayPlan((current: DayPlan) => {
      const bucketDay = findChecklistBucket(current, itemId) ?? selectedDay;
      return {
        ...current,
        weekdayChecklists: {
          ...current.weekdayChecklists,
          [bucketDay]: current.weekdayChecklists[bucketDay].filter((item: ChecklistItem) => item.id !== itemId),
        },
      };
    });

    // If this item was already saved, remove it from the committed plan too —
    // otherwise it would reappear on Calendar/Quest Board and come back on reload.
    const committedBucket = findChecklistBucket(committedPlanRef.current, itemId);
    if (committedBucket) {
      const nextCommitted: DayPlan = {
        ...committedPlanRef.current,
        weekdayChecklists: {
          ...committedPlanRef.current.weekdayChecklists,
          [committedBucket]: committedPlanRef.current.weekdayChecklists[committedBucket].filter((item) => item.id !== itemId),
        },
      };
      committedPlanRef.current = nextCommitted;
      void persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(nextCommitted) });
      void syncDayPlanScheduledItems();
    }
  }

  const visibleChecklist = useMemo(
    () => getChecklistItemsForDay(dayPlan, selectedDay) as ChecklistItem[],
    [dayPlan, selectedDay]
  );
  const selectedRole = dayPlan.weekdayRoles[selectedDay]?.trim() ?? "";
  // Preview reflects only SAVED data — matches what Calendar/Quest Board actually show,
  // so unsaved checklist/quest drafts never appear to already be scheduled.
  const committedChecklistForSelectedDay = useMemo(
    () => getChecklistItemsForDay(committedPlanRef.current, selectedDay) as ChecklistItem[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayPlan, selectedDay]
  );
  const previewItems = useMemo(
    () => committedChecklistForSelectedDay.slice().sort((a: ChecklistItem, b: ChecklistItem) => TIME_SLOTS.indexOf(a.startTime) - TIME_SLOTS.indexOf(b.startTime)),
    [committedChecklistForSelectedDay]
  );
  const currentInterval = useMemo(() => getCurrentInterval(), []);
  const intervalItems = previewItems.filter((item: ChecklistItem) => timeInInterval(item.startTime, currentInterval));
  const committedTodayQuest = committedPlanRef.current.todayQuest;
  const questInInterval = !isTodayQuestDirty() && timeInInterval(committedTodayQuest.startTime, currentInterval);

  const checklistCountForSelectedDay = visibleChecklist.length;
  const selectedDayDateKey = useMemo(() => resolveDateForWeekday(selectedDay), [selectedDay]);
  const selectedDayPlannedMinutes = computeUserScheduledMinutesForDay({
    dateKey: selectedDayDateKey,
    weekday: selectedDay,
    quickThoughts,
    dayPlan,
  });
  const selectedDayCapacityMinutes = getQuestCapacityMinutes(boardMode);
  const selectedDayRemainingMinutes = Math.max(0, selectedDayCapacityMinutes - selectedDayPlannedMinutes);
  const requiredRecoveryForSelectedDay = useMemo(
    () => getRequiredRecoveryBlockForDate(committedItemsAsScheduledLike(""), selectedDayDateKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayPlan, quickThoughts, selectedDayDateKey]
  );
  const recoveryInInterval = requiredRecoveryForSelectedDay && timeInInterval(requiredRecoveryForSelectedDay.startTime ?? "", currentInterval);

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <View style={styles.heroPanel}>
              <View style={styles.bannerIcon}><Text style={styles.bannerIconText}>📜</Text></View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>DAY PLAN</Text>
                <Text style={styles.title}>DAY PLAN</Text>
                <Text style={styles.summary}>Choose your weekly habit and optional checklist items.</Text>
              </View>
            </View>

            <View style={styles.eviePanel}>
              <Image source={uiAssets.guides.evie} style={styles.evieAvatar} resizeMode="contain" />
              <View style={styles.evieCopy}>
                <Text style={styles.evieName}>EVIE</Text>
                <Text style={styles.evieText}>Weekly Habit is your recurring role for selected days. Checklist items are optional — add them only when you are ready.</Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.panelGreen}>
              <Text style={styles.sectionTitle}>WEEKLY HABIT</Text>
              <Text style={styles.helperText}>Your recurring role for {selectedDay}. Shown on Calendar as a green marker. No steps awarded.</Text>
              <View style={styles.dayStepperRow}>
                <TouchableOpacity style={styles.arrowButton} onPress={() => moveSelectedDay(-1)}><Text style={styles.arrowText}>←</Text></TouchableOpacity>
                <View style={styles.dayStepperCenter}>
                  <Text style={styles.dayStepperTitle}>{selectedDay}</Text>
                  {selectedRole ? <Text style={styles.dayStepperRole}>{selectedRole}</Text> : null}
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
              <TextInput style={formStyles.input} value={dayPlan.weekdayRoles[selectedDay]} onChangeText={updateSelectedRole} placeholder="e.g. Coding Day" placeholderTextColor="#94A3B8" />
            </View>

            <View style={dayPlan.todayQuest.kind === "recovery" ? styles.panelPurple : styles.panelGold}>
              <Text style={styles.sectionTitle}>TODAY’S QUEST — QUEST BOARD • +{dayPlan.todayQuest.steps} STEPS</Text>
              <Text style={styles.helperText}>This is the actual quest for today. It appears on Calendar and earns +{dayPlan.todayQuest.steps} steps only when completed.</Text>
              <TextInput style={formStyles.input} value={dayPlan.todayQuest.title} onChangeText={updateTodayQuestTitle} placeholder="Finish profile page layout" placeholderTextColor="#94A3B8" />
              <TimeStepper value={dayPlan.todayQuest.startTime} onChange={updateTodayQuestStartTime} />
              {pendingRecoveryConfirmId === dayPlan.todayQuest.id && recoveryWarning ? <Text style={styles.recoveryWarning}>{recoveryWarning}</Text> : null}
              <TouchableOpacity
                style={[styles.saveQuestButton, !isTodayQuestDirty() && styles.saveQuestButtonDisabled]}
                disabled={!isTodayQuestDirty() || !dayPlan.todayQuest.title.trim()}
                onPress={saveTodayQuest}
              >
                <Text style={styles.saveQuestButtonText}>
                  {!isTodayQuestDirty() ? "SAVED ✓" : pendingRecoveryConfirmId === dayPlan.todayQuest.id ? "CONFIRM & SAVE" : "SAVE QUEST"}
                </Text>
              </TouchableOpacity>
              {dayPlan.todayQuest.status !== "completed" ? (
                <TouchableOpacity style={styles.reflectButton} onPress={() => router.push("/reflection")}>
                  <Text style={styles.reflectButtonText}>REFLECT ON TODAY’S QUEST</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.panel}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>CHECKLIST ITEMS</Text>
                <Text style={styles.helperPill}>{isLowEnergy ? "Recovery mode suggested" : "Optional"}</Text>
              </View>
              <Text style={styles.remainingTimeText}>
                {checklistCountForSelectedDay}/{MAX_CHECKLIST_ITEMS_PER_DAY} items · {formatPlannedDurationLabel(selectedDayRemainingMinutes)} left today · {boardMode} ({boardMode === "Recovery" ? "5h" : "8h"} limit)
              </Text>
              {visibleChecklist.length === 0 ? (
                <Text style={styles.emptyChecklist}>{EMPTY_CHECKLIST_COPY}</Text>
              ) : null}
              {visibleChecklist.map((item: ChecklistItem) => (
                <View key={item.id} style={[styles.checkCard, item.kind === "recovery" ? styles.recoveryBorder : styles.progressBorder]}>
                  <View style={styles.rowBetween}>
                    <TouchableOpacity onPress={() => toggleChecklistItemChecked(item.id)}>
                      <Text style={styles.checkToggle}>{item.checked ? "☑" : "☐"}</Text>
                    </TouchableOpacity>
                    <View style={styles.kindSwitchRow}>
                      <TouchableOpacity style={[styles.kindMiniButton, item.kind === "progress" && styles.kindProgressActive]} onPress={() => updateChecklistItem(item.id, { kind: "progress" })}><Text style={styles.kindMiniText}>PROGRESS</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.kindMiniButton, item.kind === "recovery" && styles.kindRecoveryActive]} onPress={() => updateChecklistItem(item.id, { kind: "recovery" })}><Text style={styles.kindMiniText}>RECOVERY</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.deleteButton} onPress={() => deleteChecklistItem(item.id)}><Text style={styles.deleteButtonText}>🗑</Text></TouchableOpacity>
                    </View>
                  </View>
                  <TextInput style={[formStyles.input, styles.itemInput]} value={item.text} onChangeText={(text: string) => updateChecklistItem(item.id, { text })} placeholder="Ex: Study 30 min" placeholderTextColor="#94A3B8" />
                  <TimeStepper value={item.startTime} onChange={(next) => updateChecklistItem(item.id, { startTime: next })} />
                  <View style={styles.durationRow}>
                    {CHECKLIST_DURATIONS.map((duration) => (
                      <TouchableOpacity key={duration} style={[styles.durationButton, item.duration === duration && styles.durationButtonActive]} onPress={() => updateChecklistItem(item.id, { duration, durationMinutes: parseDurationMinutes(duration, 30) })}>
                        <Text style={[styles.durationText, item.duration === duration && styles.optionTextActive]}>{duration}</Text>
                      </TouchableOpacity>
                    ))}
                    <Text style={styles.stepsText}>+{item.steps} step{item.steps === 1 ? "" : "s"}</Text>
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
                  {pendingRecoveryConfirmId === item.id && recoveryWarning ? <Text style={styles.recoveryWarning}>{recoveryWarning}</Text> : null}
                  <TouchableOpacity
                    style={[styles.saveQuestButton, !isChecklistItemDirty(item) && styles.saveQuestButtonDisabled]}
                    disabled={!isChecklistItemDirty(item) || !item.text.trim()}
                    onPress={() => saveChecklistItem(item.id)}
                  >
                    <Text style={styles.saveQuestButtonText}>
                      {!isChecklistItemDirty(item) ? "SAVED ✓" : pendingRecoveryConfirmId === item.id ? "CONFIRM & SAVE" : "SAVE QUEST"}
                    </Text>
                  </TouchableOpacity>
                  {!item.checked && selectedDay === todayWeekday() ? (
                    <TouchableOpacity style={styles.reflectButton} onPress={() => router.push("/reflection")}>
                      <Text style={styles.reflectButtonText}>REFLECT</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
              <View style={styles.addRow}>
                <TouchableOpacity
                  style={[styles.addProgressButton, checklistCountForSelectedDay >= MAX_CHECKLIST_ITEMS_PER_DAY && styles.addButtonDisabled]}
                  disabled={checklistCountForSelectedDay >= MAX_CHECKLIST_ITEMS_PER_DAY}
                  onPress={() => addChecklistItem("progress")}
                >
                  <Text style={styles.addButtonText}>+ Progress</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addRecoveryButton, checklistCountForSelectedDay >= MAX_CHECKLIST_ITEMS_PER_DAY && styles.addButtonDisabled]}
                  disabled={checklistCountForSelectedDay >= MAX_CHECKLIST_ITEMS_PER_DAY}
                  onPress={() => addChecklistItem("recovery")}
                >
                  <Text style={styles.addButtonText}>+ Recovery</Text>
                </TouchableOpacity>
              </View>
              {checklistCountForSelectedDay >= MAX_CHECKLIST_ITEMS_PER_DAY ? (
                <Text style={styles.capMessage}>{MAX_CHECKLIST_ITEMS_PER_DAY} checklist items is the daily max for {selectedDay} — that&apos;s enough to build the habit without overloading the day.</Text>
              ) : null}
            </View>

            <View style={styles.previewPanel}>
              <Text style={styles.sectionTitle}>CALENDAR PREVIEW • {currentInterval.label}</Text>
              <Text style={styles.previewFocus}>
                {selectedRole ? `Weekly Habit: ${selectedRole} — calendar marker only` : "No weekly habit set for this day."}
              </Text>
              {selectedDay === todayWeekday() && questInInterval ? <Text style={styles.previewQuest}>Today’s Quest: {committedTodayQuest.title} • {committedTodayQuest.startTime} • +{committedTodayQuest.steps} steps</Text> : null}
              {intervalItems.length === 0 && !(selectedDay === todayWeekday() && questInInterval) && !recoveryInInterval ? <Text style={styles.emptyPreview}>No planned items in this time block.</Text> : null}
              {intervalItems.map((item: ChecklistItem) => (
                <Text key={`preview-${item.id}`} style={item.kind === "recovery" ? styles.previewRecovery : styles.previewProgress}>{item.startTime} • {item.text} • {item.duration} • +{item.steps}</Text>
              ))}
              {recoveryInInterval && requiredRecoveryForSelectedDay ? (
                <Text style={styles.previewRecoveryLock}>
                  🔒 {requiredRecoveryForSelectedDay.startTime} • Required Recovery • 1 hr — Quest Board locks, no tasks scheduled here.
                </Text>
              ) : null}
            </View>

            {conflictMessage ? <Text style={styles.conflictMessage}>{conflictMessage}</Text> : null}
            {savedMessage ? <Text style={styles.savedMessage}>{savedMessage}</Text> : null}
            <TouchableOpacity style={styles.saveButton} onPress={saveWeeklyHabit}><Text style={styles.saveButtonText}>SAVE WEEKLY HABIT</Text></TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/calendar")}><Text style={styles.backButtonText}>BACK TO CALENDAR</Text></TouchableOpacity>
          </FormScreen>
          <BottomNav activeRoute="calendar" bottomOffset={mobile.bottomNavOffset} />
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
        <ScrollView style={styles.infoScroll} showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={styles.infoBody}>
            Day Plan helps you choose what matters today. Weekly Habit is your recurring role for selected days. Checklist items build habits — pick a duration (15 min, 30 min, 45 min, or 1 hr) and up to 5 items per day, on whichever weekdays you choose. Steps are based on duration: 30 min and under earns +1, 45 min earns +2, 1 hr earns +3. If a time overlaps another scheduled item, MYLIT tells you what it interferes with so you can change it. Stack about 2 hours of back-to-back items and MYLIT adds a required 1-hour recovery block right after — the Quest Board locks during it. Your Day Plan shows on Home and Calendar.
          </Text>
        </ScrollView>
        <TouchableOpacity style={styles.infoClose} onPress={onClose}>
          <Text style={styles.infoCloseText}>RETURN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#02040A" },
  phoneStage: { alignSelf: "center", backgroundColor: "#050814", overflow: "hidden", position: "relative", borderWidth: 2, borderColor: "#FBBF24" },
  phoneStageFullscreen: { borderWidth: 0, maxWidth: undefined, aspectRatio: undefined },
  backgroundLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
  backgroundImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  worldOverlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.62)" },
  screenScroller: { flex: 1 },
  hudContent: { flexGrow: 1, width: "100%", paddingTop: 18, paddingHorizontal: 14 },
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
  remainingTimeText: { color: "#67E8F9", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 6, marginBottom: 8 },
  capMessage: { color: "#FDE68A", fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 8 },
  recoveryWarning: { color: "#FDBA74", fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 8 },
  input: { backgroundColor: "rgba(2, 6, 23, 0.95)", borderRadius: 5, padding: 12, fontSize: 15, color: "#F9FAFB", borderWidth: 2, borderColor: "#475569", fontWeight: "800" },
  itemInput: { marginVertical: 6 },
  emptyChecklist: { color: "#94A3B8", fontSize: 13, lineHeight: 18, fontWeight: "700", marginBottom: 10, fontStyle: "italic" },
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
  addButtonDisabled: { opacity: 0.4 },
  previewPanel: { backgroundColor: "rgba(4, 18, 30, 0.94)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#38BDF8" },
  previewFocus: { color: "#86EFAC", fontSize: 13, fontWeight: "800", marginBottom: 6 },
  previewQuest: { color: "#FDE68A", fontSize: 13, fontWeight: "900", marginBottom: 6 },
  previewProgress: { color: "#FDE68A", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  previewRecovery: { color: "#C4B5FD", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  previewRecoveryLock: { color: "#FDBA74", fontSize: 12, lineHeight: 18, fontWeight: "900", marginTop: 4 },
  emptyPreview: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  savedMessage: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", textAlign: "center", marginBottom: 10 },
  conflictMessage: { color: "#FCA5A5", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", textAlign: "center", marginBottom: 10, lineHeight: 17 },
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
  saveQuestButton: { borderWidth: 2, borderColor: "#22C55E", backgroundColor: "rgba(20,83,45,0.75)", paddingVertical: 9, alignItems: "center", marginTop: 10 },
  saveQuestButtonDisabled: { borderColor: "#334155", backgroundColor: "rgba(15,23,42,0.75)" },
  saveQuestButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  infoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.82)", justifyContent: "center", alignItems: "center", padding: 20, zIndex: 25 },
  infoCard: { backgroundColor: "rgba(8,13,24,0.99)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 12, padding: 16, width: "100%" },
  infoTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", marginBottom: 10 },
  infoScroll: { maxHeight: 280 },
  infoBody: { color: "#CBD5E1", fontSize: 13, lineHeight: 20, fontWeight: "700" },
  infoClose: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 11, alignItems: "center", marginTop: 12 },
  infoCloseText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  bottomNav: { position: "absolute", bottom: 8, left: 8, right: 8, height: 62, flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(4,8,16,0.98)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 5, padding: 4 },
  navButton: { flex: 1, backgroundColor: "#111827", borderWidth: 2, borderColor: "#3A4558", borderRadius: 3, paddingVertical: 4, marginHorizontal: 2, alignItems: "center", justifyContent: "center" },
  navButtonActive: { backgroundColor: "#162314", borderColor: "#FBBF24" },
  navIcon: { fontSize: 18 },
  navLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 1 },
  navLabelActive: { color: "#FDE68A" },
});