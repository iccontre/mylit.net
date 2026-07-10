import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { FormScreen } from "../components/FormScreen";
import { BottomNav } from "../components/BottomNav";
import { WeekDaySelector } from "../components/WeekDaySelector";
import { LunaReminderCard } from "../components/LunaReminderCard";
import { formPageContent, formStyles } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { recordAgentEvent } from "../lib/mylitAgents";
import type { QuestCategory } from "../lib/agentTypes";
import {
  DAY_PLAN_KEY,
  MAX_CHECKLIST_MINUTES_PER_DAY,
  TOMORROW_QUEUE_KEY,
  checkUserScheduledQuestCapacity,
  computeChecklistMinutesForDay,
  computeUserScheduledMinutesForDay,
  formatChecklistTimeLabel,
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
  formatEnergyDelta,
  generateTimeSlots,
  getDateKey,
  getEnergyDelta,
  getRequiredRecoveryBlockForDate,
  getStepsForItem,
  inferScheduledClassification,
  parseDurationMinutes,
  parseTimeToMinutes,
  shiftTimeSlot,
  TODAY_QUEST_DURATION_LABEL,
  TODAY_QUEST_DURATION_MINUTES,
  TODAY_QUEST_STEPS,
  TODAY_QUEST_TWO_HOUR_MINUTES,
  TODAY_QUEST_TWO_HOUR_STEPS,
  wouldCrossMidnight,
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
  /** Date (YYYY-MM-DD) `checked` was last set true — see questProgress.ts RawChecklistItem. */
  checkedDate?: string;
  steps: number;
  startTime: string;
  duration: string;
  durationMinutes: number;
  status: ScheduledStatus;
  kind: "progress" | "recovery";
  weekdays: WeekdayName[];
  /**
   * Checklist items are recurring quests, so they must be timed: false for any item saved
   * before this field existed (even though durationMinutes silently defaults to 30 on load),
   * true once the user has explicitly picked a duration for it (new items default true — they
   * already show a real duration the user can see/adjust). Completion is blocked until true.
   */
  durationConfirmed: boolean;
  /** Work/Social/Health/Purpose — absent on items created before categories existed. */
  category?: QuestCategory;
  /**
   * User-set hobby/self-care item, encouraged by Luna. Always paired with kind:"recovery" so
   * it inherits Recovery's existing exemption from progress locks/caps — hobby is a display
   * distinction (pink styling, "HOBBY" label), never a new cap/energy category of its own.
   */
  hobby?: boolean;
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
  /** Work/Social/Health/Purpose — absent on quests created before categories existed. */
  category?: QuestCategory;
};

type DayPlan = {
  todayFocus: string;
  todayGoal?: string;
  todayQuest: TodayQuest;
  weekdayRoles: Record<WeekdayName, string>;
  weekdayChecklists: Record<WeekdayName, ChecklistItem[]>;
  /** Per-weekday Progress/Recovery designation — Day Plan only, never set during onboarding. */
  weekdayModes?: Partial<Record<WeekdayName, "progress" | "recovery">>;
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
// Daytime starts 7 AM; tasks can now be scheduled as late as 11:30 PM as long as they
// don't cross midnight (see wouldCrossMidnight — validated at save time).
const TIME_SLOTS = generateTimeSlots(7, 23.5, 30);
/** Checklist items use 15/30/45/60 min durations. */
const CHECKLIST_DURATIONS = ["15 min", "30 min", "45 min", "1 hr"];
/** Today's Quest additionally offers a 2 hr option — not available to checklist/quick-thought items. */
const TODAY_QUEST_DURATIONS = ["15 min", "30 min", "45 min", "1 hr", "2 hr"];
const CATEGORY_OPTIONS: { value: QuestCategory; label: string }[] = [
  { value: "work", label: "Work" },
  { value: "social", label: "Social" },
  { value: "health", label: "Health" },
  { value: "purpose", label: "Purpose" },
];
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
// The default placeholder Today's Quest is not a real user-scheduled item, so it must
// not block checklist/quest saves via the time-conflict or recovery-lock checks.
const DEFAULT_TODAY_QUEST_TITLE = "Choose one honest quest for today";
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

function stepsForItem(duration: string | number, kind: "progress" | "recovery") {
  return getStepsForItem(duration, kind);
}

/**
 * Today's Quest step reward: 2 hr is a flat +15 (Today's Quest only), 1 hr preserves the
 * existing flat +10 (unchanged from before duration became adjustable), and 15/30/45 min
 * use the same duration-based formula as checklist items.
 */
function stepsForTodayQuest(durationMinutes: number, kind: "progress" | "recovery") {
  if (durationMinutes >= TODAY_QUEST_TWO_HOUR_MINUTES) return TODAY_QUEST_TWO_HOUR_STEPS;
  if (durationMinutes >= TODAY_QUEST_DURATION_MINUTES) return TODAY_QUEST_STEPS;
  return getStepsForItem(durationMinutes, kind);
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
    const kind = item.kind || normalizeKind(inferScheduledClassification(text));
    const weekdays =
      Array.isArray(item.weekdays) && item.weekdays.length > 0
        ? item.weekdays
        : [day];
    return {
      id: item.id || `${day}-${index}-${text}`,
      text,
      checked: Boolean(item.checked),
      checkedDate: item.checkedDate,
      steps: item.steps ?? stepsForItem(durationMinutes, kind),
      startTime: item.startTime || TIME_SLOTS[(index + 4) % TIME_SLOTS.length] || "9:00 AM",
      duration: item.duration || formatDurationLabel(durationMinutes),
      durationMinutes,
      status: item.status || (item.checked ? "completed" : "scheduled"),
      kind,
      weekdays,
      durationConfirmed: Boolean(item.durationConfirmed),
      category: item.category,
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
      duration: TODAY_QUEST_DURATION_LABEL,
      durationMinutes: TODAY_QUEST_DURATION_MINUTES,
      steps: stepsForTodayQuest(TODAY_QUEST_DURATION_MINUTES, "progress"),
      status: "scheduled",
      kind: "progress",
      source: "todayQuest",
    },
    weekdayRoles: { ...DEFAULT_ROLES },
    weekdayChecklists,
    weekdayModes: {},
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
  // Kind only comes from the explicit PROGRESS/RECOVERY toggle (persisted on quest.kind).
  // Legacy plans saved before that toggle existed fall back to a one-time title inference.
  const kind = quest.kind || normalizeKind(inferScheduledClassification(questTitle));
  const rawDurationMinutes = parseDurationMinutes(quest.durationMinutes ?? quest.duration, TODAY_QUEST_DURATION_MINUTES);
  // 2 hr is Progress-only — clamp any legacy/invalid Recovery + 2 hr combo back to 1 hr.
  const durationMinutes = kind === "recovery" && rawDurationMinutes >= TODAY_QUEST_TWO_HOUR_MINUTES ? TODAY_QUEST_DURATION_MINUTES : rawDurationMinutes;
  const duration = durationMinutes === rawDurationMinutes ? quest.duration || formatDurationLabel(durationMinutes) : TODAY_QUEST_DURATION_LABEL;
  // A completed/missed status from a PRIOR day must not carry into today — otherwise a quest
  // saved today would silently be filtered out of the Quest Board as "already completed".
  const isNewDay = quest.date !== getDateKey();
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
      duration,
      durationMinutes,
      steps: typeof quest.steps === "number" ? quest.steps : stepsForTodayQuest(durationMinutes, kind),
      status: isNewDay ? "scheduled" : quest.status || "scheduled",
      kind,
      source: "todayQuest",
      category: (quest as Partial<TodayQuest>).category,
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
  const params = useLocalSearchParams<{ openTodayQuest?: string; openHobby?: string }>();
  const mobile = useMobileFrame();
  const [dayPlan, setDayPlan] = useState<DayPlan>(() => createDefaultPlan());
  const [selectedDay, setSelectedDay] = useState<WeekdayName>(todayWeekday());
  // Purely a display concern — browsing another week's actual dates never changes what
  // "selectedDay" (a recurring weekday) means, or which real week capacity checks resolve
  // against (resolveDateForWeekday always anchors to the true current week).
  const [weekOffset, setWeekOffset] = useState(0);
  const displayWeekDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jsDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() + (jsDay === 0 ? -6 : 1 - jsDay) + weekOffset * 7);
    return WEEKDAYS.map((_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, [weekOffset]);
  const [isLowEnergy, setIsLowEnergy] = useState(false);
  const [boardMode, setBoardMode] = useState<"Progress" | "Recovery">("Progress");
  const [savedMessage, setSavedMessage] = useState("");
  // Small confirmation shown right next to the Save Weekly Habit button — the shared
  // `savedMessage` banner renders far below it, so a save at the top of the page could
  // easily go unnoticed without scrolling down to see it.
  const [weeklyHabitSaved, setWeeklyHabitSaved] = useState(false);
  const weeklyHabitSavedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [conflictMessage, setConflictMessage] = useState("");
  const [recoveryWarning, setRecoveryWarning] = useState("");
  const [pendingRecoveryConfirmId, setPendingRecoveryConfirmId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [checklistModalItemId, setChecklistModalItemId] = useState<string | null>(null);
  const [showWeeklyHabitModal, setShowWeeklyHabitModal] = useState(false);
  const [showTodayQuestModal, setShowTodayQuestModal] = useState(false);
  const [showChecklistHubModal, setShowChecklistHubModal] = useState(false);
  const [showCalendarPreviewModal, setShowCalendarPreviewModal] = useState(false);
  const openedFromParamsRef = useRef(false);
  const [quickThoughts, setQuickThoughts] = useState<QuickThoughtLike[]>([]);
  const committedPlanRef = useRef<DayPlan>(createDefaultPlan());

  useEffect(() => {
    void (async () => {
      await loadDayPlan();
      loadLatestCheckIn();
      loadQuickThoughts();
      // Deep-linked from Quests' quest-chooser modal — open the matching editor once the
      // real plan (not the default empty one) has loaded, so a new hobby item lands in the
      // committed plan instead of getting overwritten by the load that follows it.
      if (openedFromParamsRef.current) return;
      openedFromParamsRef.current = true;
      if (params.openTodayQuest) setShowTodayQuestModal(true);
      if (params.openHobby) addChecklistItem("recovery", true);
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (weeklyHabitSavedTimeout.current) clearTimeout(weeklyHabitSavedTimeout.current);
    };
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
    return (
      committed.title !== dayPlan.todayQuest.title ||
      committed.startTime !== dayPlan.todayQuest.startTime ||
      committed.duration !== dayPlan.todayQuest.duration ||
      committed.kind !== dayPlan.todayQuest.kind
    );
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
    const questTitle = quest.title.trim();
    if (quest.id !== excludeId && questTitle && questTitle.toLowerCase() !== DEFAULT_TODAY_QUEST_TITLE.toLowerCase()) {
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

  /** Persists exactly one checklist item into the committed plan without pulling in other unsaved drafts. */
  async function saveChecklistItem(itemId: string) {
    const bucketDay = findChecklistBucket(dayPlan, itemId);
    const item = bucketDay ? dayPlan.weekdayChecklists[bucketDay].find((entry) => entry.id === itemId) : null;
    if (!bucketDay || !item || !item.text.trim()) return;

    if (wouldCrossMidnight(item.startTime, item.durationMinutes)) {
      setConflictMessage(`${item.startTime} + ${item.duration} would run past midnight — pick an earlier time or shorter duration.`);
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
      return;
    }

    const conflictTitle = findTimeConflictTitle(itemId, item.weekdays, item.startTime, item.durationMinutes);
    if (conflictTitle) {
      setConflictMessage(`${item.startTime} interferes with "${conflictTitle}" — change the time.`);
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
      return;
    }

    // 2h30/day checklist cap — validate EACH selected weekday separately against the
    // committed plan (excluding this item's own prior save) and block the whole save if any
    // one of them would go over. Older over-limit data is never touched — this only blocks
    // NEW saves that would push a day further over.
    for (const weekday of item.weekdays) {
      const otherMinutes = computeChecklistMinutesForDay(committedPlanRef.current, weekday, itemId);
      if (otherMinutes + item.durationMinutes > MAX_CHECKLIST_MINUTES_PER_DAY) {
        setConflictMessage(
          `${weekday} would have ${formatPlannedDurationLabel(otherMinutes + item.durationMinutes)} of checklist time — the max is ${formatPlannedDurationLabel(MAX_CHECKLIST_MINUTES_PER_DAY)}. Shorten this item or remove another.`
        );
        setRecoveryWarning("");
        setPendingRecoveryConfirmId(null);
        return;
      }
    }
    // Day-wide cap (8h/5h total, 5h30/3h max progress) applies consistently to checklist
    // items and quests alike — validate each selected weekday against it too.
    for (const weekday of item.weekdays) {
      const dateKey = resolveDateForWeekday(weekday);
      const capacity = checkUserScheduledQuestCapacity({
        dateKey,
        weekday,
        quickThoughts,
        dayPlan: committedPlanRef.current,
        additionalMinutes: item.durationMinutes,
        additionalKind: item.kind,
        boardMode,
      });
      if (!capacity.allowed) {
        setConflictMessage(
          capacity.blockedByProgressCap
            ? `${boardMode} mode allows up to ${formatPlannedDurationLabel(capacity.maxProgressMinutes)} of progress work per day on ${weekday} — the rest is reserved for recovery.`
            : `${weekday} is already at the ${formatPlannedDurationLabel(capacity.capacityMinutes)} daily quest limit — remove or shorten something first.`
        );
        setRecoveryWarning("");
        setPendingRecoveryConfirmId(null);
        return;
      }
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
    setSavedMessage("Checklist item saved.");
    void trackEvent(ANALYTICS_EVENTS.day_plan_saved, { scope: "checklistItem" });
    void syncDayPlanScheduledItems();
  }

  /** Persists Today's Quest (title/time) into the committed plan independently of Weekly Habit or checklist drafts. */
  async function saveTodayQuest() {
    if (!dayPlan.todayQuest.title.trim()) return;

    if (wouldCrossMidnight(dayPlan.todayQuest.startTime, dayPlan.todayQuest.durationMinutes)) {
      setConflictMessage(`${dayPlan.todayQuest.startTime} + ${dayPlan.todayQuest.duration} would run past midnight — pick an earlier time or shorter duration.`);
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
      return;
    }

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

    const todayQuestCapacity = checkUserScheduledQuestCapacity({
      dateKey: getDateKey(),
      weekday: dayPlan.todayQuest.weekday,
      quickThoughts,
      dayPlan: committedPlanRef.current,
      additionalMinutes: dayPlan.todayQuest.durationMinutes,
      additionalKind: dayPlan.todayQuest.kind,
      boardMode,
    });
    if (!todayQuestCapacity.allowed) {
      setConflictMessage(
        todayQuestCapacity.blockedByProgressCap
          ? `${boardMode} mode allows up to ${formatPlannedDurationLabel(todayQuestCapacity.maxProgressMinutes)} of progress work per day — the rest is reserved for recovery.`
          : `Today is already at the ${formatPlannedDurationLabel(todayQuestCapacity.capacityMinutes)} daily quest limit — remove or shorten something first.`
      );
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
      return;
    }
    setConflictMessage("");

    // A 2 hr Today's Quest intentionally triggers Forced Recovery on COMPLETION — that's expected,
    // not a scheduling accident, so saving it never needs the checklist items' extra confirm step
    // (the small notice below the duration row already explains what happens on completion).
    const nextCommitted: DayPlan = {
      ...committedPlanRef.current,
      // Save always means "commit this as today's quest" — reset status to "scheduled" even if the
      // PREVIOUS quest under this slot was already completed, otherwise the freshly saved quest
      // would silently be filtered out of the Quest Board as "already resolved".
      todayQuest: { ...dayPlan.todayQuest, status: "scheduled" },
    };
    committedPlanRef.current = nextCommitted;
    await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(nextCommitted) });
    setSavedMessage("Today's Main Quest saved.");
    void trackEvent(ANALYTICS_EVENTS.day_plan_saved, { scope: "todayQuest" });
    void syncDayPlanScheduledItems();
  }

  /** Checking a checklist item off marks it done for the day immediately — no Save Quest step needed. */
  async function toggleChecklistItemChecked(itemId: string) {
    const bucketDay = findChecklistBucket(dayPlan, itemId);
    const item = bucketDay ? dayPlan.weekdayChecklists[bucketDay].find((entry) => entry.id === itemId) : null;
    if (!bucketDay || !item) return;

    const nextChecked = !item.checked;
    // Checklist items are recurring quests, so they must be timed — completing one (not
    // un-completing, which is just undoing a mistake) is blocked until the user has actually
    // confirmed a duration, even if durationMinutes already silently defaulted to 30.
    if (nextChecked && !item.durationConfirmed) {
      setSavedMessage("Checklist items are recurring quests. Set a time so MYLIT can track them fairly.");
      return;
    }
    const patch = {
      checked: nextChecked,
      checkedDate: nextChecked ? getDateKey() : undefined,
      status: (nextChecked ? "completed" : "scheduled") as ScheduledStatus,
    };
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
      // Only the "checking off" direction is a real completion — unchecking is undoing a
      // mistake, not a miss (misses are inferred elsewhere from time passing, not this toggle).
      if (nextChecked) {
        void recordAgentEvent({
          type: "checklist_completed",
          sourcePage: "day-plan",
          relatedItemId: `${itemId}:${getDateKey()}`,
          mode: item.kind,
          durationMinutes: item.durationMinutes,
          stepDelta: item.steps,
          category: item.category,
          metadata: { title: item.text },
        });
      }
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
    setWeeklyHabitSaved(true);
    if (weeklyHabitSavedTimeout.current) clearTimeout(weeklyHabitSavedTimeout.current);
    weeklyHabitSavedTimeout.current = setTimeout(() => setWeeklyHabitSaved(false), 2500);
    void trackEvent(ANALYTICS_EVENTS.day_plan_saved, { scope: "weeklyHabit" });
    void syncDayPlanScheduledItems();
  }

  // Chips commit immediately (no separate Save step) — matches the existing checklist
  // kind-toggle pattern. Day Plan only; never surfaced during onboarding.
  async function setWeekdayMode(day: WeekdayName, mode: "progress" | "recovery") {
    const nextCommitted: DayPlan = {
      ...committedPlanRef.current,
      weekdayModes: { ...committedPlanRef.current.weekdayModes, [day]: mode },
    };
    committedPlanRef.current = nextCommitted;
    setDayPlan((current) => ({ ...current, weekdayModes: { ...current.weekdayModes, [day]: mode } }));
    await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(nextCommitted) });
    void trackEvent(ANALYTICS_EVENTS.day_plan_saved, { scope: "weekdayMode" });
  }

  // Convenience action — calls the existing per-section saves that are always safe to call
  // (idempotent weekly habit save; today's-quest save only when dirty and valid). Checklist
  // items are intentionally left out: they have their own conflict/cap/recovery-confirm
  // validation per item, which isn't safe to auto-drive for several items at once.
  async function lockInMyDay() {
    await saveWeeklyHabit();
    if (isTodayQuestDirty() && dayPlan.todayQuest.title.trim()) {
      await saveTodayQuest();
    }
    setSavedMessage("Day locked in. Checklist items still save individually.");
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

  function updateTodayQuestTitle(value: string) {
    setSavedMessage("");
    if (pendingRecoveryConfirmId === dayPlan.todayQuest.id) {
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
    }
    // Kind only changes via the explicit PROGRESS/RECOVERY toggle (updateTodayQuestKind).
    // Typing the title must NOT auto-flip the mode the user chose — that was the purple-color bug.
    setDayPlan((current: DayPlan) => ({
      ...current,
      todayQuest: { ...current.todayQuest, title: value },
    }));
  }

  function updateTodayQuestStartTime(next: string) {
    if (pendingRecoveryConfirmId === dayPlan.todayQuest.id) {
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
    }
    setDayPlan((current: DayPlan) => ({ ...current, todayQuest: { ...current.todayQuest, startTime: next } }));
  }

  function updateTodayQuestKind(kind: "progress" | "recovery") {
    setSavedMessage("");
    if (pendingRecoveryConfirmId === dayPlan.todayQuest.id) {
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
    }
    setDayPlan((current: DayPlan) => {
      // 2 hr is Progress-only (it triggers Forced Recovery) — switching to Recovery
      // while 2 hr is selected clamps back to 1 hr instead of allowing an invalid combo.
      const durationMinutes =
        kind === "recovery" && current.todayQuest.durationMinutes >= TODAY_QUEST_TWO_HOUR_MINUTES
          ? TODAY_QUEST_DURATION_MINUTES
          : current.todayQuest.durationMinutes;
      const duration = durationMinutes === current.todayQuest.durationMinutes ? current.todayQuest.duration : TODAY_QUEST_DURATION_LABEL;
      return {
        ...current,
        todayQuest: {
          ...current.todayQuest,
          kind,
          duration,
          durationMinutes,
          steps: stepsForTodayQuest(durationMinutes, kind),
        },
      };
    });
  }

  function updateTodayQuestCategory(category: QuestCategory) {
    setSavedMessage("");
    setDayPlan((current: DayPlan) => ({
      ...current,
      todayQuest: { ...current.todayQuest, category: current.todayQuest.category === category ? undefined : category },
    }));
  }

  function updateTodayQuestDuration(duration: string) {
    setSavedMessage("");
    if (pendingRecoveryConfirmId === dayPlan.todayQuest.id) {
      setRecoveryWarning("");
      setPendingRecoveryConfirmId(null);
    }
    setDayPlan((current: DayPlan) => {
      const durationMinutes = parseDurationMinutes(duration, TODAY_QUEST_DURATION_MINUTES);
      return {
        ...current,
        todayQuest: {
          ...current.todayQuest,
          duration,
          durationMinutes,
          steps: stepsForTodayQuest(durationMinutes, current.todayQuest.kind),
        },
      };
    });
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
                  // Kind only changes via the explicit PROGRESS/RECOVERY toggle (patch.kind).
                  // Typing the title must NOT auto-flip the mode the user chose.
                  kind: patch.kind ?? item.kind,
                  steps:
                    patch.duration || patch.kind
                      ? stepsForItem(patch.duration ?? item.durationMinutes, patch.kind ?? item.kind)
                      : patch.steps ?? item.steps,
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
      // The 150-min/day cap is enforced authoritatively at Save (saveChecklistItem) against
      // the COMMITTED plan, since duration/weekday edits can each push a day over the limit —
      // drafting freely here and blocking only the invalid save keeps editing unsurprising.
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

  /** First 30-min TIME_SLOT on `day` that doesn't overlap an existing item, so newly
   *  added checklist rows don't silently collide (and fail to save) at a shared default time. */
  function firstFreeStartTime(plan: DayPlan, day: WeekdayName): string {
    const occupied: { start: number; end: number }[] = [];
    for (const bucketDay of WEEKDAYS) {
      for (const entry of plan.weekdayChecklists[bucketDay] ?? []) {
        if (!entry.weekdays.includes(day)) continue;
        const start = parseTimeToMinutes(entry.startTime);
        if (start === null) continue;
        occupied.push({ start, end: start + (entry.durationMinutes || 30) });
      }
    }
    const quest = plan.todayQuest;
    if (quest.weekday === day && quest.title.trim() && quest.title.trim().toLowerCase() !== DEFAULT_TODAY_QUEST_TITLE.toLowerCase()) {
      const start = parseTimeToMinutes(quest.startTime);
      if (start !== null) occupied.push({ start, end: start + (quest.durationMinutes || 30) });
    }
    for (const slot of TIME_SLOTS) {
      const start = parseTimeToMinutes(slot);
      if (start === null) continue;
      const end = start + 30;
      if (!occupied.some((range) => start < range.end && range.start < end)) return slot;
    }
    return TIME_SLOTS[0] ?? "8:30 AM";
  }

  function addChecklistItem(kind: "progress" | "recovery", hobby?: boolean) {
    const committedMinutes = computeChecklistMinutesForDay(committedPlanRef.current, selectedDay);
    if (committedMinutes + 30 > MAX_CHECKLIST_MINUTES_PER_DAY) {
      setSavedMessage(`${selectedDay} is already at the ${formatPlannedDurationLabel(MAX_CHECKLIST_MINUTES_PER_DAY)} checklist limit — free up time before adding more.`);
      return;
    }
    const newId = `${selectedDay}-${Date.now()}`;
    setDayPlan((current: DayPlan) => {
      const nextItem: ChecklistItem = {
        id: newId,
        text: "",
        checked: false,
        steps: stepsForItem(30, kind),
        startTime: firstFreeStartTime(current, selectedDay),
        duration: "30 min",
        durationMinutes: 30,
        status: "scheduled",
        kind,
        hobby,
        weekdays: [selectedDay],
        durationConfirmed: true,
      };
      return {
        ...current,
        weekdayChecklists: {
          ...current.weekdayChecklists,
          [selectedDay]: [...current.weekdayChecklists[selectedDay as WeekdayName], nextItem],
        },
      };
    });
    // Opens straight into the edit modal — replaces the old "add blank row, then scroll to
    // edit it inline" flow with a single button + modal (see task: collapse checklist creation).
    setChecklistModalItemId(newId);
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

  // Checklist limit is now total scheduled TIME per day (2h30 / 150 min), not item count —
  // computed from the COMMITTED plan so it matches what's actually saved/shown elsewhere.
  const selectedDayChecklistMinutes = computeChecklistMinutesForDay(committedPlanRef.current, selectedDay);
  const selectedDayChecklistAtLimit = selectedDayChecklistMinutes >= MAX_CHECKLIST_MINUTES_PER_DAY;
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
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>PLANNING BOARD</Text>
                <Text style={styles.title}>DAY PLAN</Text>
                <Text style={styles.summary}>Shape the day before it starts.</Text>
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

            <View style={styles.weeklyHabitModeSection}>
              <Text style={styles.weeklyHabitModeTitle}>WEEKLY HABIT</Text>
              <Text style={styles.weeklyHabitModeSubtitle}>Progress or Recovery day?</Text>
              <View style={styles.weeklyHabitModeRow}>
                {WEEKDAYS.map((day) => {
                  const mode = dayPlan.weekdayModes?.[day];
                  return (
                    <View key={day} style={styles.weeklyHabitModeChipGroup}>
                      <Text style={styles.weeklyHabitModeChipLabel}>{day.slice(0, 3)}</Text>
                      <TouchableOpacity
                        style={[
                          styles.weeklyHabitModeChip,
                          mode === "progress" && styles.weeklyHabitModeChipProgress,
                          mode === "recovery" && styles.weeklyHabitModeChipRecovery,
                        ]}
                        onPress={() => void setWeekdayMode(day, mode === "progress" ? "recovery" : "progress")}
                      >
                        <Text style={styles.weeklyHabitModeChipText}>{mode === "recovery" ? "REC" : mode === "progress" ? "PROG" : "—"}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>

            <WeekDaySelector
              weekDays={displayWeekDays}
              selectedIndex={WEEKDAYS.indexOf(selectedDay)}
              onSelectDay={(index) => setSelectedDay(WEEKDAYS[index])}
              onPrevWeek={() => setWeekOffset((current) => current - 1)}
              onNextWeek={() => setWeekOffset((current) => current + 1)}
              isToday={(date) => getDateKey(date) === getDateKey(new Date())}
            />

            <View style={styles.daySummaryStrip}>
              <Text style={styles.daySummaryText}>
                Editing: {selectedDay} · {new Date(`${selectedDayDateKey}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </Text>
              <Text style={styles.daySummarySubtext}>
                {formatPlannedDurationLabel(selectedDayRemainingMinutes)} left today · {boardMode} ({boardMode === "Recovery" ? "5h" : "8h"} limit)
              </Text>
            </View>

            <LunaReminderCard selectedDay={selectedDay} selectedDateKey={resolveDateForWeekday(selectedDay)} />

            <TouchableOpacity style={styles.hubCard} onPress={() => setShowWeeklyHabitModal(true)}>
              <Text style={styles.hubCardTitle}>EDIT WEEKLY HABIT</Text>
              <Text style={styles.hubCardPreview} numberOfLines={1}>
                {dayPlan.weekdayRoles[selectedDay]?.trim() ? dayPlan.weekdayRoles[selectedDay] : "No weekly habit set for this day."}
              </Text>
              <Text style={styles.hubCardArrow}>›</Text>
            </TouchableOpacity>

            <Modal visible={showWeeklyHabitModal} transparent animationType="fade" onRequestClose={() => setShowWeeklyHabitModal(false)}>
              <View style={styles.checklistModalBackdrop}>
                <ScrollView style={styles.checklistModalPanel} contentContainerStyle={styles.checklistModalContent}>
                  <View style={styles.panelGreen}>
                    <Text style={styles.sectionTitle}>WEEKLY HABIT</Text>
                    <Text style={styles.helperText}>Set a recurring role for the days you choose. It repeats every week until changed.</Text>
                    <Text style={styles.helperTextSubtle}>Editing {selectedDay} — shown on Calendar as a green marker. No steps awarded.</Text>
                    <TextInput style={formStyles.input} value={dayPlan.weekdayRoles[selectedDay]} onChangeText={updateSelectedRole} placeholder="e.g. Coding Day" placeholderTextColor="#94A3B8" />
                    <TouchableOpacity style={styles.saveButton} onPress={saveWeeklyHabit}><Text style={styles.saveButtonText}>{weeklyHabitSaved ? "SAVED" : "SAVE WEEKLY HABIT"}</Text></TouchableOpacity>
                    {weeklyHabitSaved ? <Text style={styles.inlineSavedMessage}>Saved</Text> : null}
                  </View>
                  <TouchableOpacity style={styles.checklistModalCloseBtn} onPress={() => setShowWeeklyHabitModal(false)}>
                    <Text style={styles.checklistModalCloseBtnText}>CLOSE</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </Modal>

            <TouchableOpacity style={styles.hubCard} onPress={() => setShowTodayQuestModal(true)}>
              <Text style={styles.hubCardTitle}>TODAY’S QUEST</Text>
              <Text style={styles.hubCardPreview} numberOfLines={1}>
                {!isTodayQuestDirty() && dayPlan.todayQuest.status === "completed"
                  ? `✓ Completed: ${dayPlan.todayQuest.title}`
                  : dayPlan.todayQuest.title.trim()
                    ? `${dayPlan.todayQuest.title} · ${dayPlan.todayQuest.duration}`
                    : "Not set for this day."}
              </Text>
              <Text style={styles.hubCardArrow}>›</Text>
            </TouchableOpacity>

            <Modal visible={showTodayQuestModal} transparent animationType="fade" onRequestClose={() => setShowTodayQuestModal(false)}>
              <View style={styles.checklistModalBackdrop}>
                <ScrollView style={styles.checklistModalPanel} contentContainerStyle={styles.checklistModalContent}>
                  <View style={styles.todayQuestOuterBorder}>
                  <View style={[dayPlan.todayQuest.kind === "recovery" ? styles.panelPurple : styles.panelGold, { marginBottom: 0 }]}>
                    <Text style={styles.sectionTitle}>TODAY’S QUEST</Text>
              <Text style={styles.sectionMeta}>{dayPlan.todayQuest.duration} • +{dayPlan.todayQuest.steps} steps</Text>
              <Text style={styles.helperText}>This is the actual quest for today. It appears on Calendar and Quest Board and earns +{dayPlan.todayQuest.steps} steps only when completed.</Text>
              <TextInput style={formStyles.input} value={dayPlan.todayQuest.title} onChangeText={updateTodayQuestTitle} placeholder="Finish profile page layout" placeholderTextColor="#94A3B8" />
              <TimeStepper value={dayPlan.todayQuest.startTime} onChange={updateTodayQuestStartTime} />
              <View style={styles.kindSwitchRow}>
                <TouchableOpacity style={[styles.kindMiniButton, dayPlan.todayQuest.kind === "progress" && styles.kindProgressActive]} onPress={() => updateTodayQuestKind("progress")}><Text style={styles.kindMiniText}>PROGRESS</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.kindMiniButton, dayPlan.todayQuest.kind === "recovery" && styles.kindRecoveryActive]} onPress={() => updateTodayQuestKind("recovery")}><Text style={styles.kindMiniText}>RECOVERY</Text></TouchableOpacity>
              </View>
              <View style={styles.categoryRow}>
                {CATEGORY_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.categoryButton, dayPlan.todayQuest.category === option.value && styles.categoryButtonActive]}
                    onPress={() => updateTodayQuestCategory(option.value)}
                  >
                    <Text style={[styles.categoryButtonText, dayPlan.todayQuest.category === option.value && styles.categoryButtonTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.durationRow}>
                {TODAY_QUEST_DURATIONS.filter((duration) => duration !== "2 hr" || dayPlan.todayQuest.kind === "progress").map((duration) => (
                  <TouchableOpacity key={duration} style={[styles.durationButton, dayPlan.todayQuest.duration === duration && styles.durationButtonActive]} onPress={() => updateTodayQuestDuration(duration)}>
                    <Text style={[styles.durationText, dayPlan.todayQuest.duration === duration && styles.optionTextActive]}>{duration}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.stepsText}>+{dayPlan.todayQuest.steps} step{dayPlan.todayQuest.steps === 1 ? "" : "s"}</Text>
                <Text style={styles.energyText}>{formatEnergyDelta(getEnergyDelta({ kind: dayPlan.todayQuest.kind, durationMinutes: dayPlan.todayQuest.durationMinutes, title: dayPlan.todayQuest.title }))}</Text>
              </View>
              {dayPlan.todayQuest.durationMinutes >= TODAY_QUEST_TWO_HOUR_MINUTES && dayPlan.todayQuest.kind === "progress" ? (
                <Text style={styles.recoveryWarning}>2 hr focus quests trigger 1 hr recovery after completion.</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.saveQuestButton, !isTodayQuestDirty() && styles.saveQuestButtonDisabled]}
                disabled={!isTodayQuestDirty() || !dayPlan.todayQuest.title.trim()}
                onPress={saveTodayQuest}
              >
                <Text style={styles.saveQuestButtonText}>
                  {!isTodayQuestDirty() ? "SAVED" : "SET TODAY’S MAIN QUEST"}
                </Text>
              </TouchableOpacity>
              {dayPlan.todayQuest.status !== "completed" ? (
                <TouchableOpacity style={styles.reflectButton} onPress={() => router.push("/reflection")}>
                  <Text style={styles.reflectButtonText}>REFLECT ON TODAY’S QUEST</Text>
                </TouchableOpacity>
              ) : null}
                  </View>
                  </View>
                  <TouchableOpacity style={styles.checklistModalCloseBtn} onPress={() => setShowTodayQuestModal(false)}>
                    <Text style={styles.checklistModalCloseBtnText}>CLOSE</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </Modal>

            <TouchableOpacity
              style={[styles.setHobbyButton, selectedDayChecklistAtLimit && styles.addButtonDisabled]}
              disabled={selectedDayChecklistAtLimit}
              onPress={() => addChecklistItem("recovery", true)}
            >
              <Text style={styles.setHobbyButtonText}>
                {visibleChecklist.some((item) => item.hobby)
                  ? `+ SET A HOBBY (${visibleChecklist.filter((item) => item.hobby).length} set)`
                  : "+ SET A HOBBY"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.setChecklistItemNote}>Pick something for yourself and choose the days it should repeat.</Text>

            <TouchableOpacity style={styles.hubCard} onPress={() => setShowChecklistHubModal(true)}>
              <Text style={styles.hubCardTitle}>MANAGE CHECKLIST ITEMS</Text>
              <Text style={styles.hubCardPreview} numberOfLines={1}>
                {visibleChecklist.length} item{visibleChecklist.length === 1 ? "" : "s"} · {formatPlannedDurationLabel(selectedDayRemainingMinutes)} left today
              </Text>
              <Text style={styles.hubCardArrow}>›</Text>
            </TouchableOpacity>
            {visibleChecklist.slice(0, 3).map((item) => (
              <Text key={`preview-${item.id}`} style={styles.checklistMiniPreview} numberOfLines={1}>
                {item.checked ? "☑" : "☐"} {item.text || "Untitled item"} · {item.startTime}
              </Text>
            ))}

            <Modal visible={showChecklistHubModal} transparent animationType="fade" onRequestClose={() => setShowChecklistHubModal(false)}>
              <View style={styles.checklistModalBackdrop}>
                <ScrollView style={styles.checklistModalPanel} contentContainerStyle={styles.checklistModalContent}>
                  <View style={styles.panelPurple}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>CHECKLIST ITEMS</Text>
                      <Text style={styles.helperPill}>{isLowEnergy ? "Recovery mode suggested" : "Optional"}</Text>
                    </View>
                    <Text style={styles.helperText}>Set items that you want repeated throughout the week.</Text>
                    <Text style={styles.remainingTimeText}>
                      {formatChecklistTimeLabel(selectedDayChecklistMinutes)} · {formatPlannedDurationLabel(selectedDayRemainingMinutes)} left today · {boardMode} ({boardMode === "Recovery" ? "5h" : "8h"} limit)
                    </Text>
                    {visibleChecklist.length === 0 ? (
                      <Text style={styles.emptyChecklist}>{EMPTY_CHECKLIST_COPY}</Text>
                    ) : null}
                    {visibleChecklist.map((item: ChecklistItem) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.checkCardCompact, item.hobby ? styles.hobbyBorder : item.kind === "recovery" ? styles.recoveryBorder : styles.progressBorder]}
                        onPress={() => setChecklistModalItemId(item.id)}
                      >
                        <TouchableOpacity onPress={() => toggleChecklistItemChecked(item.id)}>
                          <Text style={[styles.checkToggle, !item.checked && !item.durationConfirmed && styles.checkToggleDisabled]}>
                            {item.checked ? "☑" : "☐"}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.checkCardCompactBody}>
                          <Text style={styles.checkCardCompactTitle} numberOfLines={1}>{item.text || "Untitled item"}</Text>
                          <Text style={styles.checkCardCompactMeta} numberOfLines={1}>
                            {item.hobby ? "HOBBY" : item.kind === "recovery" ? "RECOVERY" : "PROGRESS"} · {item.startTime} · {item.duration}
                          </Text>
                        </View>
                        <Text style={styles.checkCardCompactArrow}>›</Text>
                      </TouchableOpacity>
                    ))}

                    <TouchableOpacity
                      style={[styles.setChecklistItemButton, selectedDayChecklistAtLimit && styles.addButtonDisabled]}
                      disabled={selectedDayChecklistAtLimit}
                      onPress={() => addChecklistItem("progress")}
                    >
                      <Text style={styles.setChecklistItemButtonText}>+ SET A CHECKLIST ITEM</Text>
                    </TouchableOpacity>
                    <Text style={styles.setChecklistItemNote}>Create repeated items for the days you choose.</Text>

                    {selectedDayChecklistAtLimit ? (
                      <Text style={styles.capMessage}>{formatPlannedDurationLabel(MAX_CHECKLIST_MINUTES_PER_DAY)} of checklist time is the daily max for {selectedDay} — that&apos;s enough to build the habit without overloading the day.</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity style={styles.checklistModalCloseBtn} onPress={() => setShowChecklistHubModal(false)}>
                    <Text style={styles.checklistModalCloseBtnText}>CLOSE</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </Modal>

            <Modal
              visible={checklistModalItemId !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setChecklistModalItemId(null)}
            >
              <View style={styles.checklistModalBackdrop}>
                <ScrollView style={styles.checklistModalPanel} contentContainerStyle={styles.checklistModalContent}>
                  {(() => {
                    const item = visibleChecklist.find((entry) => entry.id === checklistModalItemId);
                    if (!item) return null;
                    return (
                      <View style={[styles.checkCard, item.hobby ? styles.hobbyBorder : item.kind === "recovery" ? styles.recoveryBorder : styles.progressBorder]}>
                        <View style={styles.rowBetween}>
                          <View style={styles.checkboxGroup}>
                            <TouchableOpacity onPress={() => toggleChecklistItemChecked(item.id)}>
                              <Text style={[styles.checkToggle, !item.checked && !item.durationConfirmed && styles.checkToggleDisabled]}>
                                {item.checked ? "☑" : "☐"}
                              </Text>
                            </TouchableOpacity>
                            <Text style={[styles.checkHelperText, item.checked && styles.checkHelperTextDone]}>
                              {item.checked ? "Completed" : item.durationConfirmed ? "Check if completed" : "Add time to complete"}
                            </Text>
                          </View>
                          <View style={styles.kindSwitchRow}>
                            <TouchableOpacity style={[styles.kindMiniButton, !item.hobby && item.kind === "progress" && styles.kindProgressActive]} onPress={() => updateChecklistItem(item.id, { kind: "progress", hobby: false })}><Text style={styles.kindMiniText}>PROGRESS</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.kindMiniButton, !item.hobby && item.kind === "recovery" && styles.kindRecoveryActive]} onPress={() => updateChecklistItem(item.id, { kind: "recovery", hobby: false })}><Text style={styles.kindMiniText}>RECOVERY</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.kindMiniButton, item.hobby && styles.kindHobbyActive]} onPress={() => updateChecklistItem(item.id, { kind: "recovery", hobby: true })}><Text style={styles.kindMiniText}>HOBBY</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.deleteButton} onPress={() => { deleteChecklistItem(item.id); setChecklistModalItemId(null); }}><Text style={styles.deleteButtonText}>🗑</Text></TouchableOpacity>
                          </View>
                        </View>
                        {!item.durationConfirmed ? (
                          <Text style={styles.timerRequiredText}>Checklist items are recurring quests. Set a time so MYLIT can track them fairly.</Text>
                        ) : null}
                        <View style={styles.categoryRow}>
                          {CATEGORY_OPTIONS.map((option) => (
                            <TouchableOpacity
                              key={option.value}
                              style={[styles.categoryButton, item.category === option.value && styles.categoryButtonActive]}
                              onPress={() => updateChecklistItem(item.id, { category: item.category === option.value ? undefined : option.value })}
                            >
                              <Text style={[styles.categoryButtonText, item.category === option.value && styles.categoryButtonTextActive]}>{option.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TextInput style={[formStyles.input, styles.itemInput]} value={item.text} onChangeText={(text: string) => updateChecklistItem(item.id, { text })} placeholder="Ex: Study 30 min" placeholderTextColor="#94A3B8" />
                        <TimeStepper value={item.startTime} onChange={(next) => updateChecklistItem(item.id, { startTime: next })} />
                        <View style={styles.durationRow}>
                          {CHECKLIST_DURATIONS.map((duration) => (
                            <TouchableOpacity key={duration} style={[styles.durationButton, item.duration === duration && styles.durationButtonActive]} onPress={() => updateChecklistItem(item.id, { duration, durationMinutes: parseDurationMinutes(duration, 30), durationConfirmed: true })}>
                              <Text style={[styles.durationText, item.duration === duration && styles.optionTextActive]}>{duration}</Text>
                            </TouchableOpacity>
                          ))}
                          <Text style={styles.stepsText}>+{item.steps} step{item.steps === 1 ? "" : "s"}</Text>
                          <Text style={styles.energyText}>{formatEnergyDelta(getEnergyDelta({ kind: item.kind, durationMinutes: item.durationMinutes, title: item.text }))}</Text>
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
                            {!isChecklistItemDirty(item) ? "SAVED" : pendingRecoveryConfirmId === item.id ? "CONFIRM & SAVE" : "SAVE QUEST"}
                          </Text>
                        </TouchableOpacity>
                        {!item.checked && selectedDay === todayWeekday() ? (
                          <TouchableOpacity style={styles.reflectButton} onPress={() => router.push("/reflection")}>
                            <Text style={styles.reflectButtonText}>REFLECT</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  })()}
                  <TouchableOpacity style={styles.checklistModalCloseBtn} onPress={() => setChecklistModalItemId(null)}>
                    <Text style={styles.checklistModalCloseBtnText}>CLOSE</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </Modal>

            <TouchableOpacity style={styles.hubCard} onPress={() => setShowCalendarPreviewModal(true)}>
              <Text style={styles.hubCardTitle}>CALENDAR PREVIEW</Text>
              <Text style={styles.hubCardPreview} numberOfLines={1}>{currentInterval.label}</Text>
              <Text style={styles.hubCardArrow}>›</Text>
            </TouchableOpacity>

            <Modal visible={showCalendarPreviewModal} transparent animationType="fade" onRequestClose={() => setShowCalendarPreviewModal(false)}>
              <View style={styles.checklistModalBackdrop}>
                <ScrollView style={styles.checklistModalPanel} contentContainerStyle={styles.checklistModalContent}>
                  <View style={styles.previewPanel}>
                    <Text style={styles.sectionTitle}>CALENDAR PREVIEW</Text>
                    <Text style={styles.sectionMeta}>{currentInterval.label}</Text>
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
                  <TouchableOpacity style={styles.checklistModalCloseBtn} onPress={() => setShowCalendarPreviewModal(false)}>
                    <Text style={styles.checklistModalCloseBtnText}>CLOSE</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </Modal>

            {conflictMessage ? <Text style={styles.conflictMessage}>{conflictMessage}</Text> : null}
            {savedMessage ? <Text style={styles.savedMessage}>{savedMessage}</Text> : null}
            <TouchableOpacity style={styles.lockInBtn} onPress={() => void lockInMyDay()}>
              <Text style={styles.lockInBtnText}>🔒 LOCK IN MY DAY</Text>
            </TouchableOpacity>

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
            Day Plan helps you choose what matters today. Weekly Habit is your recurring role for selected days. Checklist items build habits — pick a duration (15 min, 30 min, 45 min, or 1 hr) on whichever weekdays you choose. You can plan up to 2h 30m of checklist time per day. Steps are based on duration: 15 min earns +1, 30 min earns +2, 45 min earns +3, 1 hr earns +4. If a time overlaps another scheduled item, MYLIT tells you what it interferes with so you can change it. Stack about 2 hours of back-to-back items and MYLIT adds a required 1-hour recovery block right after — the Quest Board locks during it. Your Day Plan shows on Home and Calendar.
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
  heroCopy: { flex: 1 },
  heroKicker: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 },
  title: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 27, fontWeight: "900", letterSpacing: 1, lineHeight: 32, textAlign: "center" },
  summary: { color: "#F8E7A1", fontFamily: pixelFont, fontSize: 12, fontWeight: "800", lineHeight: 17, marginTop: 5 },
  daySummaryStrip: { alignItems: "center", marginBottom: 10 },
  daySummaryText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  daySummarySubtext: { color: "#94A3B8", fontSize: 10, fontWeight: "700", marginTop: 2 },
  panel: { backgroundColor: "rgba(8, 13, 24, 0.95)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#334155" },
  panelGold: { backgroundColor: "rgba(8, 13, 24, 0.95)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#FBBF24" },
  panelPurple: { backgroundColor: "rgba(31, 18, 56, 0.95)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#A78BFA" },
  // Today's Quest always keeps a white outer ring so it reads as "Today's Quest" regardless of its Progress/Recovery color.
  todayQuestOuterBorder: { borderWidth: 3, borderColor: "#FFFFFF", borderRadius: 10, padding: 3, marginBottom: 12 },
  sectionTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", letterSpacing: 0.5, lineHeight: 19, marginBottom: 6, textAlign: "center" },
  sectionMeta: { color: "#CBD5E1", fontSize: 11, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  // When a section title shares a row with a pill/button, flex:1 lets it actually center in the remaining space.
  sectionTitleInRow: { flex: 1, marginBottom: 0 },
  helperText: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, marginBottom: 8, fontWeight: "700" },
  helperPill: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  remainingTimeText: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 6, marginBottom: 8 },
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
  helperTextSubtle: { color: "#94A3B8", fontSize: 11, lineHeight: 16, marginBottom: 8, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  checkCard: { backgroundColor: "rgba(58, 42, 21, 0.94)", borderWidth: 2, borderRadius: 8, padding: 10, marginBottom: 10 },
  progressBorder: { borderColor: "#FBBF24" },
  recoveryBorder: { borderColor: "#A78BFA" },
  hobbyBorder: { borderColor: "#F472B6" },
  checkToggle: { color: "#F8FAFC", fontSize: 24, marginRight: 8 },
  checkToggleDisabled: { color: "#64748B" },
  checkboxGroup: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  checkHelperText: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, fontWeight: "700" },
  checkHelperTextDone: { color: "#86EFAC" },
  timerRequiredText: { color: "#FCD34D", fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 4 },
  kindSwitchRow: { flexDirection: "row", gap: 6 },
  kindMiniButton: { borderWidth: 1, borderColor: "#475569", paddingVertical: 5, paddingHorizontal: 7, backgroundColor: "rgba(30, 41, 59, 0.82)" },
  kindProgressActive: { borderColor: "#FBBF24", backgroundColor: "rgba(113,63,18,0.8)" },
  kindRecoveryActive: { borderColor: "#A78BFA", backgroundColor: "rgba(88,28,135,0.8)" },
  kindHobbyActive: { borderColor: "#F472B6", backgroundColor: "rgba(131,24,67,0.8)" },
  kindMiniText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  categoryRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  categoryButton: { borderWidth: 1, borderColor: "#475569", borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "rgba(30, 41, 59, 0.82)" },
  categoryButtonActive: { borderColor: "#38BDF8", backgroundColor: "rgba(12,74,110,0.8)" },
  categoryButtonText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  categoryButtonTextActive: { color: "#F8FAFC" },
  deleteButton: { width: 34, height: 30, borderWidth: 1, borderColor: "#FCA5A5", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(127,29,29,0.45)" },
  deleteButtonText: { fontSize: 14 },
  durationRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  durationButton: { borderWidth: 2, borderColor: "#334155", paddingVertical: 7, paddingHorizontal: 10, backgroundColor: "rgba(30, 41, 59, 0.88)" },
  durationButtonActive: { borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.65)" },
  durationText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  optionTextActive: { color: "#FDE68A" },
  stepsText: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  energyText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  weekdayLabel: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginTop: 8, marginBottom: 4 },
  weekdayToggleRow: { gap: 6, paddingBottom: 4 },
  weekdayToggle: { borderWidth: 1, borderColor: "#475569", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "rgba(30, 41, 59, 0.82)" },
  weekdayToggleActive: { borderColor: "#FBBF24", backgroundColor: "rgba(113,63,18,0.8)" },
  weekdayToggleText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  weekdayToggleTextActive: { color: "#FDE68A" },
  addButtonDisabled: { opacity: 0.4 },
  checkCardCompact: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(58, 42, 21, 0.94)",
    borderWidth: 2,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  checkCardCompactBody: { flex: 1, marginLeft: 8 },
  checkCardCompactTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  checkCardCompactMeta: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 9, fontWeight: "700", marginTop: 2 },
  checkCardCompactArrow: { color: "#FDE68A", fontSize: 22, fontWeight: "900", marginLeft: 6 },
  setChecklistItemButton: { borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(69,43,8,0.65)", marginTop: 4 },
  setChecklistItemButtonText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  setHobbyButton: { borderWidth: 2, borderColor: "#DB2777", borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: "#F9A8D4", marginTop: 4 },
  setHobbyButtonText: { color: "#500724", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  setChecklistItemNote: { color: "#94A3B8", fontSize: 10, fontWeight: "700", textAlign: "center", marginTop: 6 },
  weeklyHabitModeSection: { alignItems: "center", marginBottom: 10 },
  weeklyHabitModeTitle: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  weeklyHabitModeSubtitle: { color: "#94A3B8", fontSize: 10, fontWeight: "700", marginTop: 2, marginBottom: 8 },
  weeklyHabitModeRow: { flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "center" },
  weeklyHabitModeChipGroup: { alignItems: "center" },
  weeklyHabitModeChipLabel: { color: "#94A3B8", fontSize: 9, fontWeight: "800", marginBottom: 3 },
  weeklyHabitModeChip: { width: 40, paddingVertical: 6, borderWidth: 2, borderColor: "#475569", borderRadius: 6, alignItems: "center", backgroundColor: "rgba(30,41,59,0.82)" },
  // Gold = Progress day, Purple = Recovery day — never green (green is reserved for habit/quest tasks).
  weeklyHabitModeChipProgress: { borderColor: "#FBBF24", backgroundColor: "rgba(113,63,18,0.85)" },
  weeklyHabitModeChipRecovery: { borderColor: "#A78BFA", backgroundColor: "rgba(88,28,135,0.85)" },
  weeklyHabitModeChipText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  hubCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(58, 42, 21, 0.85)",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  hubCardTitle: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginRight: 8 },
  hubCardPreview: { flex: 1, color: "#F1F5F9", fontSize: 11, fontWeight: "700" },
  hubCardArrow: { color: "#FDE68A", fontSize: 22, fontWeight: "900", marginLeft: 6 },
  checklistMiniPreview: { color: "#94A3B8", fontSize: 10, fontWeight: "700", marginBottom: 3, paddingHorizontal: 4 },
  checklistModalBackdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.88)", padding: 18, paddingTop: 60, paddingBottom: 40 },
  checklistModalPanel: { flex: 1, backgroundColor: "rgba(8,13,24,0.98)", borderWidth: 3, borderColor: "#334155", borderRadius: 12 },
  checklistModalContent: { padding: 16 },
  checklistModalCloseBtn: { marginTop: 8, alignItems: "center", paddingVertical: 10 },
  checklistModalCloseBtnText: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  previewPanel: { backgroundColor: "rgba(4, 18, 30, 0.94)", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 3, borderColor: "#FBBF24" },
  previewFocus: { color: "#86EFAC", fontSize: 13, fontWeight: "800", marginBottom: 6 },
  previewQuest: { color: "#FDE68A", fontSize: 13, fontWeight: "900", marginBottom: 6 },
  previewProgress: { color: "#FDE68A", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  previewRecovery: { color: "#C4B5FD", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  previewRecoveryLock: { color: "#FDBA74", fontSize: 12, lineHeight: 18, fontWeight: "900", marginTop: 4 },
  emptyPreview: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  savedMessage: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", textAlign: "center", marginBottom: 10 },
  inlineSavedMessage: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", textAlign: "center", marginTop: 8 },
  conflictMessage: { color: "#FCA5A5", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", textAlign: "center", marginBottom: 10, lineHeight: 17 },
  saveButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 13, alignItems: "center", marginBottom: 10 },
  saveButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  backButton: { borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.6)", paddingVertical: 13, alignItems: "center", marginBottom: 10 },
  backButtonText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  lockInBtn: { borderWidth: 2, borderColor: "#22C55E", backgroundColor: "#14532D", paddingVertical: 14, alignItems: "center", marginBottom: 10, borderRadius: 8 },
  lockInBtnText: { color: "#F0FDF4", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
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