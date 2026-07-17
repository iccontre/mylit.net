import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomNav } from "../components/BottomNav";
import { WorldChrome } from "../components/parchment/WorldChrome";
import { QuickThoughtsModal } from "../components/QuickThoughtsModal";
import { LunaGuideModal } from "../components/LunaGuideModal";
import { EvieGuideModal } from "../components/EvieGuideModal";
import { uiAssets } from "../constants/uiAssets";
import { useMobileFrame } from "../constants/mobileLayout";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { setChecklistItemChecked } from "../lib/progressSync";
import {
  collectDayPlanScheduledItems,
  collectQuickThoughtScheduledItems,
  formatDurationLabel,
  getDateKey,
  getRequiredRecoveryBlockForDate,
  getStepsForItem,
  inferScheduledClassification,
  MANDATORY_QUEST_TITLE,
  parseDurationMinutes,
  parseSleepGuideTime,
  parseTimeToMinutes,
  TODAY_QUEST_DURATION_MINUTES,
  TODAY_QUEST_STEPS,
  type ScheduledClassification,
  type ScheduledQuestLike,
} from "../lib/scheduling";
import { COMPLETED_QUESTS_KEY, LUNA_DAY_REMINDERS_KEY } from "../lib/storageKeys";
import { isReminderScheduledForDay, reminderGuide, type LunaDayReminder } from "../lib/lunaReminders";

type WeekdayName = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
type EventTone = "gold" | "purple" | "blue" | "green" | "pinkLight" | "pinkDark";
type ViewMode = "week" | "day";

type CheckIn = {
  desiredSleepTime?: string;
  desiredWakeTime?: string;
  estimatedSleepWindow?: string;
  caffeineCutoffSuggestion?: string;
  mealCutoffSuggestion?: string;
  blueScreenCutoffSuggestion?: string;
  exerciseCutoffSuggestion?: string;
  windDownGoal?: string;
};

type DayPlan = {
  todayFocus?: string;
  todayGoal?: string;
  todayQuest?: {
    id?: string;
    title?: string;
    date?: string;
    weekday?: string;
    startTime?: string;
    duration?: string;
    durationMinutes?: number;
    steps?: number;
    kind?: "progress" | "recovery";
    status?: string;
  };
  weekdayRoles?: Partial<Record<WeekdayName, string>>;
  weekdayChecklists?: Partial<Record<WeekdayName, unknown[]>>;
};

type CalendarEvent = {
  id: string;
  title: string;
  cellLabel: string;
  source: string;
  date: string;
  dayLabel: string;
  startTime?: string;
  duration?: string;
  durationMinutes?: number;
  steps?: number;
  classification: ScheduledClassification;
  tone: EventTone;
  note?: string;
  status?: string;
  priority: number;
};

const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";
const CHECKIN_KEY = "lit_latest_checkin";
const WEEKDAY_NAMES: WeekdayName[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const TIME_ROWS = ["6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM"];
/** Short encouragement line under the Day View / selected-day heading, indexed by Date#getDay(). */
const DAY_SUPPORT_LINES = [
  "Fresh week ahead. Ease in gently.",
  "New week, new momentum. Start honest.",
  "Building steady. Keep showing up.",
  "Midweek momentum. Stay on track.",
  "Almost through. Keep your pace.",
  "Strong finish ahead. Stay grounded.",
  "Rest and reflect. You've earned it.",
];

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatWeekRange(weekDays: Date[]) {
  const first = weekDays[0];
  const last = weekDays[6];
  return `${formatShortDate(first)} – ${formatShortDate(last)}, ${last.getFullYear()}`;
}

function buildDayLabel(date: Date) {
  return `${WEEKDAY_LABELS[date.getDay()]} ${formatShortDate(date)}`;
}

/**
 * Day View timeline geometry. Absolute time → pixel position, so items land in their real
 * time slot instead of being bucketed into a shared hour cell (which pushed every later
 * time slot down whenever an earlier cell grew tall from several stacked items).
 */
const HOUR_HEIGHT = 60;
// Matches the app's shared 6 AM logical-day boundary (see getQuestDayKey in lib/scheduling.ts)
// — a genuinely 6:00 AM-scheduled item now lands in its own labeled row instead of being
// visually pinned to what used to be the first (7 AM) row.
const GRID_START_HOUR = 6;
const GRID_END_HOUR = 24;
const GRID_HEIGHT = TIME_ROWS.length * HOUR_HEIGHT;
// Tall enough to fit a 1-line time label + a wrapped 2-line title without clipping,
// even for the shortest (15-min) scheduled items.
const MIN_EVENT_HEIGHT = 56;

function minutesForGridPlacement(time?: string): number {
  const startOfGrid = GRID_START_HOUR * 60;
  const endOfGrid = GRID_END_HOUR * 60;
  if (!time || time === "All day") return startOfGrid;
  const minutes = parseSleepGuideTime(time) ?? parseTimeToMinutes(time);
  if (minutes === null) return startOfGrid;
  if (minutes < startOfGrid) return startOfGrid;
  if (minutes >= endOfGrid) return endOfGrid - 30;
  return minutes;
}

type PositionedEvent = CalendarEvent & { topPx: number; heightPx: number; leftPct: number; widthPct: number };

/**
 * Lays out one day's events by real start/end time. Overlapping items are grouped into
 * clusters and given side-by-side lanes (columns) within that cluster only — a task that
 * genuinely conflicts with another sits compactly next to it, while non-overlapping tasks
 * keep their own correct time slot and never get shoved down by an unrelated busy block.
 */
function layoutDayEvents(events: CalendarEvent[]): PositionedEvent[] {
  const startOfGrid = GRID_START_HOUR * 60;
  const withRange = events
    .map((event) => {
      const start = minutesForGridPlacement(event.startTime);
      const durationMinutes = Math.max(15, event.durationMinutes ?? 30);
      return { event, start, end: start + durationMinutes };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const positioned: PositionedEvent[] = [];
  let clusterItems: typeof withRange = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (clusterItems.length === 0) return;
    const laneEnds: number[] = [];
    const withLane = clusterItems.map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }
      return { ...item, lane };
    });
    const laneCount = laneEnds.length;
    for (const item of withLane) {
      const topPx = ((item.start - startOfGrid) / 60) * HOUR_HEIGHT;
      const heightPx = Math.max(MIN_EVENT_HEIGHT, ((item.end - item.start) / 60) * HOUR_HEIGHT);
      const widthPct = 100 / laneCount;
      positioned.push({ ...item.event, topPx, heightPx, leftPct: item.lane * widthPct, widthPct });
    }
    clusterItems = [];
  };

  for (const item of withRange) {
    if (item.start >= clusterEnd) {
      flushCluster();
      clusterEnd = item.end;
    } else {
      clusterEnd = Math.max(clusterEnd, item.end);
    }
    clusterItems.push(item);
  }
  flushCluster();

  return positioned;
}

function dedupeCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Map<string, CalendarEvent>();
  for (const event of events) {
    const key = `${event.date}|${event.classification}|${event.startTime ?? ""}|${event.title}`;
    if (!seen.has(key)) seen.set(key, event);
  }
  return Array.from(seen.values());
}

function sleepGuideDedupeKey(event: CalendarEvent): string {
  return `${event.date}|${event.classification}|${event.startTime ?? ""}|${event.cellLabel}`;
}

function eventTone(classification: ScheduledClassification): EventTone {
  if (classification === "sleepGuide") return "blue";
  if (classification === "focus") return "green";
  if (classification === "recovery") return "purple";
  return "gold";
}

/** Small category icon shown on Day View task blocks and Week View day-card previews. */
function classificationIcon(classification: ScheduledClassification): string {
  if (classification === "sleepGuide") return "🌙";
  if (classification === "recovery") return "💜";
  if (classification === "focus") return "🌿";
  return "🥇";
}

/** True for the "Last phone / blue-screen cutoff" sleep-guide item (matches its stable id from sleepGuideEvents). */
function isPhoneCutoffEvent(event: CalendarEvent): boolean {
  return event.id.endsWith("-sleep-phone");
}

function normalizeClassification(value: unknown): ScheduledClassification {
  return value === "recovery" ? "recovery" : value === "focus" ? "focus" : value === "sleepGuide" ? "sleepGuide" : "progress";
}

function getDayRole(dayPlan: DayPlan | null, dayName: WeekdayName) {
  return dayPlan?.weekdayRoles?.[dayName]?.trim() || (dayPlan as Record<string, unknown> | null)?.[dayName]?.toString() || "";
}

function sleepGuideEvents(checkIn: CheckIn | null, date: Date): CalendarEvent[] {
  if (!checkIn) return [];
  const dateKey = getDateKey(date);
  const dayLabel = buildDayLabel(date);
  const sleepTime = checkIn.desiredSleepTime || extractFirstTime(checkIn.estimatedSleepWindow) || "11:00 PM";
  const guides = [
    { key: "sleep", title: "Expected sleep time", cellLabel: "Sleep", time: sleepTime, note: "Target sleep window from Sleep Calendar." },
    { key: "wake", title: "Expected wake time", cellLabel: "Wake", time: checkIn.desiredWakeTime, note: "Target wake time from Sleep Calendar." },
    { key: "meal", title: "Last meal cutoff", cellLabel: "Meal cutoff", time: checkIn.mealCutoffSuggestion, note: "Suggested 3–4 hours before sleep." },
    { key: "caffeine", title: "Last caffeine cutoff", cellLabel: "Caffeine cutoff", time: checkIn.caffeineCutoffSuggestion, note: "Suggested 11–12 hours before sleep." },
    { key: "phone", title: "Last phone / blue-screen cutoff", cellLabel: "Phone cutoff", time: checkIn.blueScreenCutoffSuggestion, note: "Suggested at least 1 hour before sleep." },
    { key: "gym", title: "Last gym / exercise cutoff", cellLabel: "Gym cutoff", time: checkIn.exerciseCutoffSuggestion, note: "Suggested no exercise within 3 hours of sleep." },
  ];

  return guides
    .filter((guide) => Boolean(guide.time))
    .map((guide, index) => ({
      id: `${dateKey}-sleep-${guide.key}`,
      title: guide.title,
      cellLabel: guide.cellLabel,
      source: "Sleep Calendar",
      date: dateKey,
      dayLabel,
      startTime: guide.time,
      classification: "sleepGuide",
      tone: "blue",
      note: guide.note,
      priority: index,
    }));
}

function extractFirstTime(value?: string) {
  const match = value?.match(/\d{1,2}:\d{2}\s?(AM|PM)/i);
  return match?.[0];
}

/** Compact preview lines for a Week View day card — sleep guide items collapse to one line. */
function buildDayCardPreview(events: CalendarEvent[]): { icon: string; text: string; isTodayQuest?: boolean }[] {
  type Candidate = { icon: string; text: string; order: number; isTodayQuest?: boolean };
  const candidates: Candidate[] = [];

  if (events.some((event) => event.classification === "sleepGuide")) {
    candidates.push({ icon: "🌙", text: "Sleep Guide", order: 0 });
  }

  const todayQuest = events.find((event) => event.source === "Day Plan / Quest Board");
  if (todayQuest) candidates.push({ icon: "⭐", text: todayQuest.title, order: 1, isTodayQuest: true });

  const focus = events.find((event) => event.classification === "focus");
  if (focus) candidates.push({ icon: "🌿", text: focus.title, order: 2 });

  events
    .filter((event) => event.classification !== "sleepGuide" && event.classification !== "focus" && event.id !== todayQuest?.id)
    .forEach((event) => {
      candidates.push({ icon: classificationIcon(event.classification), text: event.title, order: 3 + event.priority });
    });

  candidates.sort((a, b) => a.order - b.order);
  return candidates;
}

export default function CalendarScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [queueItems, setQueueItems] = useState<unknown[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [mandatoryCompletions, setMandatoryCompletions] = useState<{ id: string; dateKey: string; completedAt: string; durationMinutes?: number; steps: number }[]>([]);
  const [reminders, setReminders] = useState<LunaDayReminder[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => new Date().getDay());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showQuickThoughts, setShowQuickThoughts] = useState(false);
  const [showQuickLuna, setShowQuickLuna] = useState(false);
  const [showQuickEvie, setShowQuickEvie] = useState(false);

  useEffect(() => {
    void trackEvent(ANALYTICS_EVENTS.calendar_opened);
  }, []);

  // Reload on every focus so a Today's Quest (or checklist item) saved elsewhere
  // appears here immediately instead of showing a stale snapshot.
  useFocusEffect(
    useCallback(() => {
      loadCalendarData();
    }, [])
  );

  async function loadCalendarData() {
    const [queue, plan, checkIn, completed, dayReminders] = await Promise.all([
      readJson<unknown[]>(TOMORROW_QUEUE_KEY, []),
      readJson<DayPlan | null>(DAY_PLAN_KEY, null),
      readJson<CheckIn | null>(CHECKIN_KEY, null),
      readJson<{ id: string; title: string; dateKey: string; completedAt: string; durationMinutes?: number; steps: number }[]>(COMPLETED_QUESTS_KEY, []),
      readJson<LunaDayReminder[]>(LUNA_DAY_REMINDERS_KEY, []),
    ]);
    setQueueItems(Array.isArray(queue) ? queue : []);
    setDayPlan(plan);
    setLatestCheckIn(checkIn);
    // Mandatory eat/rest is ephemeral (never saved as a scheduled Day Plan/Quick Thought item),
    // so it would otherwise leave no trace here once completed — pull it from the completion
    // log specifically so it still shows up on the day it happened.
    setMandatoryCompletions(Array.isArray(completed) ? completed.filter((entry) => entry.title === MANDATORY_QUEST_TITLE) : []);
    setReminders(Array.isArray(dayReminders) ? dayReminders : []);
  }

  function reminderItemsForDay(dateKey: string, weekday: WeekdayName): LunaDayReminder[] {
    return reminders.filter((entry) => isReminderScheduledForDay(entry, weekday, dateKey));
  }

  const today = useMemo(() => new Date(), []);
  const weekDays = useMemo(() => {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [today, weekOffset]);

  const resolveDateForWeekday = (weekday: WeekdayName) => {
    const date = weekDays.find((day: Date) => WEEKDAY_NAMES[day.getDay()] === weekday);
    return date ? getDateKey(date) : undefined;
  };

  const quickThoughtItems = collectQuickThoughtScheduledItems(queueItems);
  const checklistItems = collectDayPlanScheduledItems(dayPlan, resolveDateForWeekday);

  const eventsByDay = weekDays.map((date: Date) => {
    const dateKey = getDateKey(date);
    const dayName = WEEKDAY_NAMES[date.getDay()];
    const dayLabel = buildDayLabel(date);
    const events: CalendarEvent[] = [];

    events.push(...sleepGuideEvents(latestCheckIn, date));

    const todayQuest = dayPlan?.todayQuest;
    const todayQuestDurationMinutes = todayQuest
      ? parseDurationMinutes(todayQuest.durationMinutes ?? todayQuest.duration, TODAY_QUEST_DURATION_MINUTES)
      : TODAY_QUEST_DURATION_MINUTES;
    const todayQuestSteps = todayQuest?.steps ?? TODAY_QUEST_STEPS;
    if (todayQuest && (todayQuest.date || getDateKey()) === dateKey && todayQuest.title?.trim()) {
      const classification = normalizeClassification(todayQuest.kind);
      events.push({
        id: todayQuest.id || `${dateKey}-today-quest`,
        title: todayQuest.title,
        cellLabel: `Today Quest +${todayQuestSteps}`,
        source: "Day Plan / Quest Board",
        date: dateKey,
        dayLabel,
        startTime: todayQuest.startTime || "9:00 AM",
        duration: todayQuest.duration || "1 hr",
        durationMinutes: todayQuestDurationMinutes,
        steps: todayQuestSteps,
        classification,
        tone: eventTone(classification),
        status: todayQuest.status || "scheduled",
        note: `This is the actual Day Plan quest. It appears on Quest Board and earns +${todayQuestSteps} steps.`,
        priority: 1,
      });
    }

    mandatoryCompletions
      .filter((entry) => entry.dateKey === dateKey)
      .forEach((entry) => {
        events.push({
          id: entry.id,
          title: "Eat or rest to restore energy",
          cellLabel: "Recovery quest · completed",
          source: "Quest Board",
          date: dateKey,
          dayLabel,
          startTime: new Date(entry.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          duration: formatDurationLabel(entry.durationMinutes, 15),
          durationMinutes: entry.durationMinutes,
          steps: entry.steps,
          classification: "recovery",
          tone: eventTone("recovery"),
          status: "completed",
          note: "Luna's mandatory reset — completed.",
          priority: 2,
        });
      });

    const quickThoughtItemsForDay = quickThoughtItems.filter((item) => item.date === dateKey);
    quickThoughtItemsForDay.forEach((item: ScheduledQuestLike) => {
      const classification = item.classification || inferScheduledClassification(item);
      events.push({
        id: item.id,
        title: item.title || item.text || "Quest",
        cellLabel: item.classification === "recovery" ? "Recovery quest" : "Progress quest",
        source: "Quests",
        date: dateKey,
        dayLabel,
        startTime: item.startTime || item.time,
        duration: item.duration || formatDurationLabel(item.durationMinutes, 30),
        durationMinutes: item.durationMinutes,
        steps: item.steps ?? getStepsForItem(item.durationMinutes ?? item.duration, classification),
        classification,
        tone: eventTone(classification),
        status: item.status,
        note: item.note || "Scheduled future quest from Quests.",
        priority: 2,
      });
    });

    const checklistItemsForDay = checklistItems.filter((item) => item.date === dateKey);
    checklistItemsForDay.forEach((item: ScheduledQuestLike) => {
      const classification = item.classification || inferScheduledClassification(item);
      events.push({
        id: item.id,
        title: item.title || "Checklist item",
        cellLabel: item.hobby ? "Hobby" : classification === "recovery" ? "Recovery" : "Progress",
        source: "Day Plan Checklist",
        date: dateKey,
        dayLabel,
        startTime: item.startTime || item.time,
        duration: item.duration || formatDurationLabel(item.durationMinutes, 30),
        durationMinutes: item.durationMinutes,
        steps: item.steps ?? getStepsForItem(item.durationMinutes, classification),
        classification,
        tone: item.hobby ? "pinkLight" : eventTone(classification),
        status: item.status,
        note: item.checked ? "Checked recurring Day Plan habit." : "Recurring Day Plan habit.",
        priority: 3,
      });
    });

    reminderItemsForDay(dateKey, dayName).forEach((entry) => {
      const guide = reminderGuide(entry);
      events.push({
        id: entry.id,
        title: entry.text,
        cellLabel: guide === "evie" ? "Evie Reminder" : "Luna Reminder",
        source: guide === "evie" ? "Evie Reminder" : "Luna Reminder",
        date: dateKey,
        dayLabel,
        startTime: entry.time,
        duration: entry.durationMinutes ? formatDurationLabel(entry.durationMinutes, 15) : undefined,
        durationMinutes: entry.durationMinutes,
        steps: 0,
        classification: guide === "evie" ? "progress" : "recovery",
        tone: guide === "evie" ? "gold" : "pinkDark",
        status: "scheduled",
        note: entry.until ? `Until ${entry.until}.` : "User-created reminder.",
        priority: 3.5,
      });
    });

    const dayItemsForRecoveryCheck: Partial<ScheduledQuestLike>[] = [
      ...(todayQuest && (todayQuest.date || getDateKey()) === dateKey && todayQuest.title?.trim()
        ? [{ id: todayQuest.id || `${dateKey}-today-quest`, date: dateKey, startTime: todayQuest.startTime || "9:00 AM", durationMinutes: todayQuestDurationMinutes }]
        : []),
      ...quickThoughtItemsForDay,
      ...checklistItemsForDay,
    ];
    const requiredRecovery = getRequiredRecoveryBlockForDate(dayItemsForRecoveryCheck, dateKey);
    if (requiredRecovery) {
      events.push({
        id: requiredRecovery.id,
        title: "Required Recovery",
        cellLabel: "Recovery Required",
        source: "MYLIT Recovery",
        date: dateKey,
        dayLabel,
        startTime: requiredRecovery.startTime,
        duration: "1 hr",
        durationMinutes: 60,
        steps: 0,
        classification: "recovery",
        tone: eventTone("recovery"),
        status: "recoveryRequired",
        note: "2 hours of back-to-back tasks reached — the Quest Board locks for 1 hour so you can rest.",
        priority: 2.5,
      });
    }

    const role = getDayRole(dayPlan, dayName);
    if (role) {
      events.push({
        id: `${dateKey}-focus`,
        title: role,
        cellLabel: "Focus",
        source: "Day Plan Focus",
        date: dateKey,
        dayLabel,
        startTime: "All day",
        classification: "focus",
        tone: "green",
        note: "Theme only. This is not a quest and earns no steps.",
        priority: 4,
      });
    }

    return dedupeCalendarEvents(events).sort(
      (a, b) =>
        a.priority - b.priority ||
        (parseSleepGuideTime(a.startTime) ?? parseTimeToMinutes(a.startTime) ?? 0) -
          (parseSleepGuideTime(b.startTime) ?? parseTimeToMinutes(b.startTime) ?? 0)
    );
  });

  const todayKey = getDateKey(today);
  const expectedSleep = latestCheckIn?.estimatedSleepWindow || (latestCheckIn?.desiredSleepTime && latestCheckIn?.desiredWakeTime ? `${latestCheckIn.desiredSleepTime} – ${latestCheckIn.desiredWakeTime}` : latestCheckIn?.desiredSleepTime) || "Not set";

  const clampedSelectedIndex = Math.min(Math.max(selectedDayIndex, 0), 6);
  const selectedDate = weekDays[clampedSelectedIndex] ?? today;
  const selectedDateKey = getDateKey(selectedDate);
  const selectedEvents = eventsByDay[clampedSelectedIndex] ?? [];
  const selectedWeekdayName = WEEKDAY_NAMES[selectedDate.getDay()];

  const selectedQuestTitle = selectedEvents.find((event) => event.source.includes("Quest Board"))?.title || "Not set yet";
  const selectedActionableEvents = selectedEvents.filter(
    (event) => event.classification !== "focus" && event.classification !== "sleepGuide" && event.status !== "recoveryRequired"
  );
  const selectedNextEvent = selectedActionableEvents
    .filter((event) => event.status !== "completed" && String(event.status) !== "missed")
    .sort((a, b) => (parseTimeToMinutes(a.startTime) ?? 0) - (parseTimeToMinutes(b.startTime) ?? 0))[0];
  const selectedNextLabel = selectedNextEvent?.title ?? (selectedActionableEvents.length > 0 ? "All done for this day" : "Not set yet");
  const selectedWeeklyHabit = getDayRole(dayPlan, selectedWeekdayName) || "Not set";

  const schedulePreviewRows = selectedEvents.slice(0, 5);
  const schedulePreviewMoreCount = Math.max(0, selectedEvents.length - schedulePreviewRows.length);

  const dayViewFocusEvent = selectedEvents.find((event) => event.classification === "focus");
  const dayViewTodayQuestEvent = selectedEvents.find((event) => event.source === "Day Plan / Quest Board");
  // The phone/blue-screen cutoff is often computed shortly after midnight, which would
  // otherwise land it near the TOP of the grid (or vanish past the visible range) — it's
  // pinned as the final item at the bottom of the schedule instead. Its real scheduled
  // time/data is untouched; only where it renders changes.
  const dayViewPhoneCutoffEvent = selectedEvents.find(isPhoneCutoffEvent);
  const dayViewPositionedEvents = layoutDayEvents(
    selectedEvents.filter(
      (event) => event.classification !== "focus" && event.id !== dayViewTodayQuestEvent?.id && event.id !== dayViewPhoneCutoffEvent?.id
    )
  );

  function goToPreviousWeek() {
    setWeekOffset((current: number) => current - 1);
  }

  function goToNextWeek() {
    setWeekOffset((current: number) => current + 1);
  }

  function openDayCard(index: number) {
    setSelectedDayIndex(index);
  }

  const selectedDayBadge = (
    <View style={styles.dayBadge}>
      <View style={styles.dayBadgeStrip}>
        <Text style={styles.dayBadgeStripText}>{WEEKDAY_LABELS[selectedDate.getDay()]}</Text>
      </View>
      <View style={styles.dayBadgeBody}>
        <Text style={styles.dayBadgeDate}>{formatShortDate(selectedDate)}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}><Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" /></View>
        <View style={styles.worldOverlay}>
          <ScrollView style={styles.screenScroller} contentContainerStyle={[styles.hudContent, { paddingBottom: mobile.scrollPaddingBottom }]} showsVerticalScrollIndicator={false} bounces={false}>
            <WorldChrome hub="calendar" kicker="SCHEDULE BOARD" title="CALENDAR" subtitle="Plan quests, habits, and recovery." style={styles.heroPanel} />

            <View style={styles.legendRow}>
              <Legend tone="green" label="Habit/Quest" />
              <Legend tone="gold" label="Progress / Evie" />
              <Legend tone="purple" label="Recovery" />
              <Legend tone="pinkLight" label="Hobby" />
              <Legend tone="pinkDark" label="Luna Reminder" />
            </View>

            <TouchableOpacity style={styles.quickThoughtsBtn} onPress={() => setShowQuickThoughts(true)}>
              <Text style={styles.quickThoughtsBtnText}>📝 QUICK THOUGHTS</Text>
            </TouchableOpacity>
            <Text style={styles.quickThoughtsNote}>Capture reminders, thoughts, and notes for this day.</Text>

            <QuickThoughtsModal
              visible={showQuickThoughts}
              onClose={() => setShowQuickThoughts(false)}
              selectedDateKey={selectedDateKey}
              onOpenLuna={() => setShowQuickLuna(true)}
              onOpenEvie={() => setShowQuickEvie(true)}
            />
            <LunaGuideModal visible={showQuickLuna} onClose={() => setShowQuickLuna(false)} />
            <EvieGuideModal visible={showQuickEvie} onClose={() => setShowQuickEvie(false)} />

            {viewMode === "week" ? (
              <View style={styles.eviePanel}>
                <Image source={uiAssets.guides.evie} style={styles.evieAvatar} resizeMode="contain" />
                <View style={styles.evieCopy}>
                  <Text style={styles.evieName}>EVIE</Text>
                  <Text style={styles.evieText}>Calendar shows quests, habits, sleep guides, and recovery blocks. Tap any day to inspect it.</Text>
                </View>
                <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                  <Text style={styles.infoBtnText}>?</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.weekNavPanel}>
              <TouchableOpacity style={styles.weekArrow} onPress={goToPreviousWeek}><Text style={styles.weekArrowText}>←</Text></TouchableOpacity>
              <View style={styles.weekCenter}><Text style={styles.weekKicker}>WEEK VIEW</Text><Text style={styles.weekRange}>{formatWeekRange(weekDays)}</Text></View>
              <TouchableOpacity style={styles.weekArrow} onPress={goToNextWeek}><Text style={styles.weekArrowText}>→</Text></TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayCardRow}>
              {weekDays.map((date: Date, index: number) => {
                const isToday = getDateKey(date) === todayKey;
                const isSelected = index === clampedSelectedIndex;
                const preview = buildDayCardPreview(eventsByDay[index]);
                const visiblePreview = preview.slice(0, 3);
                const moreCount = Math.max(0, preview.length - visiblePreview.length);
                return (
                  <View key={date.toISOString()} style={styles.dayCardWrap}>
                    <Text style={styles.todayFlag}>{isToday ? "Today" : " "}</Text>
                    <TouchableOpacity
                      style={[styles.dayCard, isToday && styles.dayCardToday, isSelected && styles.dayCardSelected]}
                      onPress={() => openDayCard(index)}
                    >
                      <View style={styles.dayCardStrip}>
                        <Text style={styles.dayCardStripText}>{WEEKDAY_LABELS[date.getDay()]}</Text>
                      </View>
                      <View style={styles.dayCardBody}>
                        <Text style={styles.dayCardDate}>{formatShortDate(date)}</Text>
                        {visiblePreview.length === 0 ? (
                          <Text style={styles.dayCardEmpty}>Nothing yet</Text>
                        ) : (
                          visiblePreview.map((line, lineIndex) => (
                            <View key={lineIndex} style={styles.dayCardPreviewRow}>
                              {line.isTodayQuest ? (
                                <View style={styles.todayQuestIconBadge}>
                                  <Text style={styles.todayQuestIconBadgeText}>{line.icon}</Text>
                                </View>
                              ) : (
                                <Text style={styles.dayCardPreviewIcon}>{line.icon}</Text>
                              )}
                              <Text style={styles.dayCardPreviewLine} numberOfLines={1}>{line.text}</Text>
                            </View>
                          ))
                        )}
                        {moreCount > 0 ? <Text style={styles.dayCardMore}>+{moreCount} more</Text> : null}
                      </View>
                    </TouchableOpacity>
                    {isSelected ? <View style={styles.dayCardPointer} /> : null}
                  </View>
                );
              })}
            </ScrollView>

            {viewMode === "week" ? (
              <>
                <View style={styles.selectedDayPanel}>
                  <View style={styles.selectedDayHeaderRow}>
                    {selectedDayBadge}
                    <View style={styles.selectedDayHeaderCopy}>
                      <Text style={styles.selectedDayHeading}>
                        {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}
                      </Text>
                      <Text style={styles.selectedDaySupportLine}>{DAY_SUPPORT_LINES[selectedDate.getDay()]}</Text>
                    </View>
                  </View>

                  <View style={styles.summaryGrid}>
                    <SummaryCard icon="⭐" label="TODAY QUEST" value={selectedQuestTitle} hint="Quest Board • steps by duration" />
                    <SummaryCard icon="📜" label="WEEKLY HABIT" value={selectedWeeklyHabit} hint="Theme only, no steps" />
                    <SummaryCard icon="⏱️" label="NEXT QUEST" value={selectedNextLabel} hint="Next actionable item" />
                    <SummaryCard icon="🌙" label="SLEEP GUIDE" value={expectedSleep} hint="Blue timing guidance" />
                  </View>

                  <Text style={styles.schedulePreviewTitle}>SCHEDULE PREVIEW</Text>
                  {schedulePreviewRows.length === 0 ? (
                    <Text style={styles.emptyPreview}>Nothing scheduled for this day yet.</Text>
                  ) : (
                    schedulePreviewRows.map((event) => (
                      <TouchableOpacity key={event.id} style={styles.previewRow} onPress={() => setSelectedEvent(event)}>
                        <Text style={styles.previewRowTime} numberOfLines={1}>{event.startTime || "—"}</Text>
                        <Text style={styles.previewRowTitle} numberOfLines={1}>{event.title}</Text>
                        <View style={[styles.previewRowPill, getEventToneStyle(event.tone)]}>
                          <Text style={styles.previewRowPillText}>{event.classification}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                  {schedulePreviewMoreCount > 0 ? <Text style={styles.dayCardMore}>+{schedulePreviewMoreCount} more</Text> : null}
                </View>

                <TouchableOpacity style={styles.openDayViewButton} onPress={() => setViewMode("day")}>
                  <Text style={styles.openDayViewButtonText}>OPEN DAY VIEW</Text>
                  <Text style={styles.openDayViewButtonSubtext}>See full schedule for this day</Text>
                </TouchableOpacity>

                <View style={styles.actionGrid}>
                  <ActionButton icon="⏱️" title="Quests" subtitle="Schedule a future quest" onPress={() => router.push("/tomorrow-queue")} />
                  <ActionButton icon="📜" title="Day Plan" subtitle="Set today and weekly roles" onPress={() => router.push("/day-plan")} />
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.returnButton} onPress={() => setViewMode("week")}>
                  <Text style={styles.returnButtonText}>← RETURN TO WEEK VIEW</Text>
                </TouchableOpacity>

                <View style={styles.dayViewHeadingRow}>
                  {selectedDayBadge}
                  <View style={styles.selectedDayHeaderCopy}>
                    <Text style={styles.selectedDayHeading}>
                      {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
                    </Text>
                    <Text style={styles.selectedDaySupportLine}>Tap a task to view or edit details.</Text>
                  </View>
                </View>

                <View style={styles.legendRow}>
                  <Legend tone="blue" label="Sleep guide" /><Legend tone="gold" label="Progress" /><Legend tone="purple" label="Recovery" /><Legend tone="green" label="Weekly Habit" />
                </View>

                <View style={styles.dayViewPanel}>
                  {dayViewFocusEvent ? (
                    <TouchableOpacity
                      style={[styles.dayViewPinnedBanner, getEventToneStyle("green")]}
                      onPress={() => setSelectedEvent(dayViewFocusEvent)}
                    >
                      <Text style={styles.dayViewPinnedBannerIcon}>🌿</Text>
                      <Text style={styles.dayViewPinnedBannerText} numberOfLines={1}>Weekly Habit: {dayViewFocusEvent.title}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {dayViewTodayQuestEvent ? (
                    <TouchableOpacity
                      style={[styles.dayViewPinnedBanner, getEventToneStyle(dayViewTodayQuestEvent.tone)]}
                      onPress={() => setSelectedEvent(dayViewTodayQuestEvent)}
                    >
                      <View style={styles.dayViewPinnedIconBadge}>
                        <Text style={styles.dayViewPinnedBannerIconInBadge}>⭐</Text>
                      </View>
                      <Text style={styles.dayViewPinnedBannerText} numberOfLines={1}>Today Quest: {dayViewTodayQuestEvent.title}</Text>
                    </TouchableOpacity>
                  ) : null}

                  <View style={styles.dayViewTimelineRow}>
                    <View style={styles.dayViewTimeColumn}>
                      {TIME_ROWS.map((row) => (
                        <Text key={row} style={styles.dayViewTimeLabel}>{row}</Text>
                      ))}
                    </View>
                    <View style={styles.dayViewGrid}>
                      {TIME_ROWS.map((row) => (
                        <View key={`bg-${row}`} style={styles.dayViewHourRowBg} />
                      ))}
                      {dayViewPositionedEvents.map((event) => (
                        <TouchableOpacity
                          key={event.classification === "sleepGuide" ? sleepGuideDedupeKey(event) : event.id}
                          style={[
                            styles.dayViewEventBlock,
                            getEventToneStyle(event.tone),
                            { top: event.topPx, height: event.heightPx, left: `${event.leftPct}%`, width: `${event.widthPct}%` },
                          ]}
                          onPress={() => setSelectedEvent(event)}
                        >
                          <Text style={styles.dayViewEventTime} numberOfLines={1}>
                            {classificationIcon(event.classification)} {event.startTime || "—"}
                          </Text>
                          <Text style={styles.dayViewEventTitle} numberOfLines={2}>{event.title}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {dayViewPhoneCutoffEvent ? (
                    <TouchableOpacity
                      style={[styles.dayViewPinnedBanner, styles.dayViewPinnedBannerBottom, getEventToneStyle(dayViewPhoneCutoffEvent.tone)]}
                      onPress={() => setSelectedEvent(dayViewPhoneCutoffEvent)}
                    >
                      <Text style={styles.dayViewPinnedBannerIcon}>{classificationIcon(dayViewPhoneCutoffEvent.classification)}</Text>
                      <Text style={styles.dayViewPinnedBannerText} numberOfLines={1}>
                        {dayViewPhoneCutoffEvent.cellLabel}: {dayViewPhoneCutoffEvent.startTime || "Not set"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            )}
          </ScrollView>
          <BottomNav activeRoute="calendar" bottomOffset={mobile.bottomNavOffset} />

          {selectedEvent ? (
            <EventPopup
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              router={router}
              onMarkComplete={async () => {
                const ok = await setChecklistItemChecked(selectedEvent.id, true);
                if (ok) {
                  setSelectedEvent(null);
                  await loadCalendarData();
                }
              }}
            />
          ) : null}
          {showInfo ? <InfoOverlay onClose={() => setShowInfo(false)} /> : null}
        </View>
      </View>
    </View>
  );
}

function SummaryCard({ icon, label, value, hint }: { icon: string; label: string; value: string; hint: string }) {
  return <View style={styles.summaryCard}><Text style={styles.summaryIcon}>{icon}</Text><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue} numberOfLines={2}>{value}</Text><Text style={styles.summaryHint}>{hint}</Text></View>;
}

function ActionButton({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.actionButton} onPress={onPress}><Text style={styles.actionIcon}>{icon}</Text><View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionSubtitle}>{subtitle}</Text></View><Text style={styles.actionArrow}>›</Text></TouchableOpacity>;
}

function Legend({ tone, label }: { tone: EventTone; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, getEventToneStyle(tone)]} /><Text style={styles.legendText}>{label}</Text></View>;
}

function getEventToneStyle(tone: EventTone) {
  switch (tone) {
    case "blue": return styles.eventBlue;
    case "purple": return styles.eventPurple;
    case "green": return styles.eventGreen;
    case "pinkLight": return styles.eventPinkLight;
    case "pinkDark": return styles.eventPinkDark;
    case "gold": default: return styles.eventGold;
  }
}

function EventPopup({
  event,
  onClose,
  router,
  onMarkComplete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
  onMarkComplete: () => void;
}) {
  const todayKey = getDateKey(new Date());
  const isMissed = event.date < todayKey && event.status !== "completed" && event.classification !== "focus" && event.classification !== "sleepGuide";
  const isChecklistItem = event.source === "Day Plan Checklist";
  const canMarkComplete = isChecklistItem && event.status !== "completed";
  return (
    <View style={styles.popupOverlay}>
      <View style={[styles.popupCard, getPopupBorder(event.tone)]}>
        <Text style={styles.popupTitle}>{event.title}</Text>
        <Text style={styles.popupSource}>{event.source}</Text>
        <PopupRow label="Day" value={event.dayLabel} />
        <PopupRow label="Time" value={event.startTime || "Not set"} />
        {event.duration ? <PopupRow label="Duration" value={event.duration} /> : null}
        {event.steps !== undefined ? <PopupRow label="Steps" value={`+${event.steps}`} /> : null}
        <PopupRow label="Type" value={event.classification === "sleepGuide" ? "Sleep guide — no steps" : event.classification === "focus" ? "Day focus — theme only" : event.classification} />
        {event.status ? <PopupRow label="Status" value={event.status} /> : null}
        {event.note ? <Text style={styles.popupNote}>{event.note}</Text> : null}
        {canMarkComplete ? (
          <TouchableOpacity style={styles.completeButton} onPress={onMarkComplete}>
            <Text style={styles.completeButtonText}>MARK COMPLETE</Text>
          </TouchableOpacity>
        ) : null}
        {isMissed ? (
          <TouchableOpacity style={styles.reflectButton} onPress={() => { onClose(); router.push("/reflection"); }}>
            <Text style={styles.reflectButtonText}>REFLECT ON THIS</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.popupButton} onPress={onClose}><Text style={styles.popupButtonText}>RETURN</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function PopupRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.popupRow}><Text style={styles.popupLabel}>{label}</Text><Text style={styles.popupValue}>{value}</Text></View>;
}

function getPopupBorder(tone: EventTone) {
  if (tone === "blue") return styles.popupBlue;
  if (tone === "purple") return styles.popupPurple;
  if (tone === "green") return styles.popupGreen;
  if (tone === "pinkLight") return styles.popupPinkLight;
  if (tone === "pinkDark") return styles.popupPinkDark;
  return styles.popupGold;
}

function InfoOverlay({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.infoOverlay}>
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>CALENDAR</Text>
        <ScrollView style={styles.infoScroll} showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={styles.infoBullet}>{"• Week View shows a clickable card for each day — tap one to preview it below."}</Text>
          <Text style={styles.infoBullet}>{"• Blue = sleep guide / sleep timing. Gold = progress. Purple = recovery. Green = day focus / no-step focus."}</Text>
          <Text style={styles.infoBullet}>{"• Open Day View for a full hourly schedule of the selected day."}</Text>
          <Text style={styles.infoBullet}>{"• Tap an item to inspect it when supported."}</Text>
          <Text style={styles.infoBullet}>{"• Completed items earn steps only when marked complete."}</Text>
          <Text style={styles.infoBullet}>{"• Missed or reflected items do not award steps unless the app says otherwise."}</Text>
          <Text style={styles.infoBullet}>{"• Recovery blocks may appear after too much continuous progress work."}</Text>
        </ScrollView>
        <TouchableOpacity style={styles.infoClose} onPress={onClose}>
          <Text style={styles.infoCloseText}>RETURN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#140F0A" },
  phoneStage: { alignSelf: "center", backgroundColor: "#1C1410", overflow: "hidden", position: "relative", borderWidth: 2, borderColor: "#FBBF24" },
  phoneStageFullscreen: { borderWidth: 0, maxWidth: undefined, aspectRatio: undefined },
  backgroundLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
  backgroundImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  worldOverlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.58)" },
  screenScroller: { flex: 1 },
  hudContent: { minHeight: "100%", paddingTop: 18, paddingHorizontal: 12, paddingBottom: 104 },

  heroPanel: { marginBottom: 12 },
  heroCopy: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  heroLabel: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, textAlign: "center" },
  heroTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 27, fontWeight: "900", letterSpacing: 1, textAlign: "center" },
  heroSubtitle: { color: "#F8E7A1", fontSize: 12, lineHeight: 17, fontWeight: "800", textAlign: "center" },

  eviePanel: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(46,32,20,0.95)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, padding: 10, marginBottom: 10 },
  evieAvatar: { width: 44, height: 52, marginRight: 10 },
  evieCopy: { flex: 1 },
  evieName: { color: "#FDE047", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  evieText: { color: "#CBD5E1", fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  infoBtn: { width: 28, height: 28, borderWidth: 2, borderColor: "#FBBF24", borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(113,63,18,0.7)", marginLeft: 8 },
  infoBtnText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },

  weekNavPanel: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(46,32,20,0.95)", borderWidth: 2, borderColor: "#5C4425", borderRadius: 8, padding: 8, marginBottom: 10 },
  weekArrow: { width: 42, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.55)" },
  weekArrowText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" },
  weekCenter: { flex: 1, alignItems: "center" },
  weekKicker: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  weekRange: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginTop: 3 },

  // Week View day-card row — horizontally scrollable clickable day icons.
  dayCardRow: { paddingBottom: 6, gap: 8 },
  dayCardWrap: { width: 106, alignItems: "center" },
  todayFlag: { color: "#FDE047", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginBottom: 3, letterSpacing: 0.6 },
  dayCard: { width: "100%", borderRadius: 8, borderWidth: 2, borderColor: "#5C4425", overflow: "hidden", backgroundColor: "#E7D3A9" },
  dayCardToday: { borderColor: "#FBBF24", borderWidth: 3 },
  dayCardSelected: { borderColor: "#FDE047", borderWidth: 3, shadowColor: "#FDE047", shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  dayCardStrip: { backgroundColor: "#B3261E", paddingVertical: 5, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "#5C4425" },
  dayCardStripText: { color: "#FFF7E8", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  dayCardBody: { backgroundColor: "#EAD9B6", paddingHorizontal: 7, paddingVertical: 6, minHeight: 92 },
  dayCardDate: { color: "#4A3620", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginBottom: 4, textAlign: "center" },
  dayCardEmpty: { color: "#8A7554", fontFamily: pixelFont, fontSize: 9, fontStyle: "italic" },
  dayCardPreviewRow: { flexDirection: "row", alignItems: "center", marginBottom: 2, gap: 3 },
  dayCardPreviewIcon: { fontSize: 9 },
  dayCardPreviewLine: { color: "#3D2C18", fontSize: 9, fontWeight: "800", flexShrink: 1 },
  dayCardMore: { color: "#7C5B2B", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 2 },
  // Today Quest gets a white-bordered icon badge — the one category icon called out by
  // design as needing a border, everywhere it appears (Week View preview + Day View).
  todayQuestIconBadge: { width: 14, height: 14, borderRadius: 3, borderWidth: 1.5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(113,63,18,0.9)" },
  todayQuestIconBadgeText: { fontSize: 8, lineHeight: 9 },
  dayCardPointer: { width: 0, height: 0, marginTop: 4, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FDE047" },

  // Shared small day badge used in both the selected-day summary and Day View heading.
  dayBadge: { width: 58, borderRadius: 6, borderWidth: 2, borderColor: "#5C4425", overflow: "hidden", marginRight: 10 },
  dayBadgeStrip: { backgroundColor: "#B3261E", paddingVertical: 4, alignItems: "center" },
  dayBadgeStripText: { color: "#FFF7E8", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  dayBadgeBody: { backgroundColor: "#EAD9B6", paddingVertical: 6, alignItems: "center" },
  dayBadgeDate: { color: "#4A3620", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },

  selectedDayPanel: { backgroundColor: "rgba(46,32,20,0.94)", borderWidth: 2, borderColor: "#5C4425", borderRadius: 8, padding: 12, marginBottom: 10 },
  selectedDayHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  selectedDayHeaderCopy: { flex: 1 },
  selectedDayHeading: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 0.5 },
  selectedDaySupportLine: { color: "#CBD5E1", fontSize: 12, fontWeight: "700", marginTop: 3 },

  summaryGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  summaryCard: { width: "49%", minHeight: 98, backgroundColor: "rgba(46,32,20,0.92)", borderWidth: 2, borderColor: "#5C4425", borderRadius: 8, padding: 9, marginBottom: 8 },
  summaryIcon: { fontSize: 18 }, summaryLabel: { color: "#FDE047", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 2 }, summaryValue: { color: "#F8FAFC", fontSize: 12, lineHeight: 17, fontWeight: "800", marginTop: 4 }, summaryHint: { color: "#94A3B8", fontSize: 10, marginTop: 4 },

  schedulePreviewTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  emptyPreview: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  previewRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#1F2937", paddingVertical: 7, gap: 8 },
  previewRowTime: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", width: 58 },
  previewRowTitle: { color: "#F8FAFC", fontSize: 12, fontWeight: "800", flex: 1 },
  previewRowPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  previewRowPillText: { color: "#F8FAFC", fontSize: 8, fontWeight: "900", textTransform: "uppercase" },

  openDayViewButton: { backgroundColor: "rgba(69,43,8,0.75)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  openDayViewButtonText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  openDayViewButtonSubtext: { color: "#F8E7A1", fontSize: 11, fontWeight: "700", marginTop: 3 },

  actionGrid: { marginBottom: 10 },
  actionButton: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(46,32,20,0.95)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, padding: 10, marginBottom: 8 },
  actionIcon: { fontSize: 22, marginRight: 10 }, actionCopy: { flex: 1 }, actionTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" }, actionSubtitle: { color: "#CBD5E1", fontSize: 11, fontWeight: "700", marginTop: 2 }, actionArrow: { color: "#FBBF24", fontSize: 28, fontWeight: "900" },

  returnButton: { backgroundColor: "rgba(46,32,20,0.95)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, paddingVertical: 12, alignItems: "center", marginBottom: 10 },
  returnButtonText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 0.6 },

  dayViewHeadingRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(46,32,20,0.94)", borderWidth: 2, borderColor: "#5C4425", borderRadius: 8, padding: 10, marginBottom: 10 },

  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 8 }, legendItem: { flexDirection: "row", alignItems: "center" }, legendDot: { width: 12, height: 12, borderRadius: 2, marginRight: 4 }, legendText: { color: "#CBD5E1", fontSize: 10, fontWeight: "800" },
  quickThoughtsBtn: { borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(69,43,8,0.65)", marginBottom: 4 },
  quickThoughtsBtnText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  quickThoughtsNote: { color: "#94A3B8", fontSize: 10, fontWeight: "700", textAlign: "center", marginBottom: 10 },

  // Day View — dark RPG timeline board.
  dayViewPanel: { backgroundColor: "rgba(46,32,20,0.92)", borderWidth: 2, borderColor: "#5C4425", borderRadius: 8, padding: 8, marginBottom: 8 },
  dayViewPinnedBanner: { flexDirection: "row", alignItems: "center", minHeight: 30, borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, marginBottom: 6 },
  // Pinned "final item" variant (phone/blue-screen cutoff) — sits below the timeline
  // instead of above it, so it's always visible as the last item even when its actual
  // time would otherwise place it near the top (e.g. a post-midnight cutoff).
  dayViewPinnedBannerBottom: { marginTop: 4, marginBottom: 0 },
  dayViewPinnedIconBadge: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginRight: 6, backgroundColor: "rgba(0,0,0,0.2)" },
  dayViewPinnedBannerIconInBadge: { fontSize: 12 },
  dayViewPinnedBannerIcon: { fontSize: 13, marginRight: 6 },
  dayViewPinnedBannerText: { color: "#F8FAFC", fontSize: 11, fontWeight: "900", flex: 1 },
  dayViewTimelineRow: { flexDirection: "row" },
  dayViewTimeColumn: { width: 52, borderRightWidth: 1, borderRightColor: "#5C4425" },
  dayViewTimeLabel: { height: HOUR_HEIGHT, color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, textAlign: "center", paddingTop: 4 },
  dayViewGrid: { position: "relative", flex: 1, height: GRID_HEIGHT },
  dayViewHourRowBg: { height: HOUR_HEIGHT, borderTopWidth: 1, borderTopColor: "rgba(51,65,85,0.55)" },
  // Colored left edge (thicker than the rest of the border) so type is readable at a glance,
  // matching Calendar's color-coding legend.
  dayViewEventBlock: { position: "absolute", borderWidth: 1, borderLeftWidth: 4, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4, overflow: "hidden" },
  dayViewEventTime: { color: "#F8FAFC", fontSize: 10, fontWeight: "900" },
  dayViewEventTitle: { color: "#F8FAFC", fontSize: 11, lineHeight: 14, fontWeight: "800", marginTop: 2 },

  eventGold: { backgroundColor: "rgba(113,63,18,0.85)", borderColor: "#FBBF24" }, eventPurple: { backgroundColor: "rgba(88,28,135,0.85)", borderColor: "#A78BFA" }, eventBlue: { backgroundColor: "rgba(14,116,144,0.85)", borderColor: "#67E8F9" }, eventGreen: { backgroundColor: "rgba(20,83,45,0.65)", borderColor: "#86EFAC" }, eventPinkLight: { backgroundColor: "rgba(157,23,77,0.4)", borderColor: "#F9A8D4" }, eventPinkDark: { backgroundColor: "rgba(80,7,36,0.85)", borderColor: "#DB2777" },

  popupOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 18, zIndex: 10 }, popupCard: { backgroundColor: "rgba(46,32,20,0.98)", borderWidth: 3, borderRadius: 12, padding: 16 }, popupGold: { borderColor: "#FBBF24" }, popupPurple: { borderColor: "#A78BFA" }, popupBlue: { borderColor: "#67E8F9" }, popupGreen: { borderColor: "#86EFAC" }, popupPinkLight: { borderColor: "#F9A8D4" }, popupPinkDark: { borderColor: "#DB2777" }, popupTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 20, fontWeight: "900", marginBottom: 4 }, popupSource: { color: "#FDE047", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginBottom: 12 }, popupRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#1F2937", paddingVertical: 6 }, popupLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "800" }, popupValue: { color: "#F8FAFC", fontSize: 12, fontWeight: "900", maxWidth: "60%", textAlign: "right" }, popupNote: { color: "#CBD5E1", fontSize: 13, lineHeight: 19, marginTop: 12 }, popupButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 12, alignItems: "center", marginTop: 14 }, popupButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },

  infoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.82)", justifyContent: "center", alignItems: "center", padding: 20, zIndex: 25 },
  infoCard: { backgroundColor: "rgba(46,32,20,0.99)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 12, padding: 16, width: "100%" },
  infoTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", marginBottom: 10 },
  infoScroll: { maxHeight: 280 },
  infoBullet: { color: "#CBD5E1", fontSize: 13, lineHeight: 20, fontWeight: "700", marginBottom: 6 },
  infoClose: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 11, alignItems: "center", marginTop: 12 },
  infoCloseText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  reflectButton: { backgroundColor: "rgba(88,28,135,0.7)", borderWidth: 2, borderColor: "#A78BFA", paddingVertical: 10, alignItems: "center", marginTop: 10 },
  reflectButtonText: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  completeButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 10, alignItems: "center", marginTop: 12 },
  completeButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
});
