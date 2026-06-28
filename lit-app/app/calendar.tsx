import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { getQuickThoughtSteps, getRequiredRecoveryBlockForDate, inferScheduledKind, parseDurationMinutes, type ScheduledKind, type ScheduledQuestLike } from "../lib/scheduling";

type QueueItem = {
  text?: string;
  title?: string;
  task?: string;
  note?: string;
  type?: string;
  date?: string;
  weekday?: string;
  time?: string;
  startTime?: string;
  duration?: string;
  durationMinutes?: number;
  steps?: number;
  status?: "scheduled" | "active" | "completed" | "expired" | "needsReflection" | "recoveryRequired";
  kind?: ScheduledKind;
};

type ChecklistItem = {
  id?: string;
  text?: string;
  checked?: boolean;
  steps?: number;
  startTime?: string;
  duration?: string;
  durationMinutes?: number;
  status?: "scheduled" | "active" | "completed" | "expired" | "needsReflection" | "recoveryRequired";
  kind?: ScheduledKind;
};

type DayPlan = {
  todayGoal?: string;
  Monday?: string;
  Tuesday?: string;
  Wednesday?: string;
  Thursday?: string;
  Friday?: string;
  Saturday?: string;
  Sunday?: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
  weekdayRoles?: Partial<Record<WeekdayName, string>>;
  weekdayChecklists?: Partial<Record<WeekdayName, ChecklistItem[]>>;
};


type ActiveTimedQuest = {
  id: string;
  source: "quickThought" | "dayPlanChecklist" | "todayFocus" | "questBoard" | "recoveryBlock";
  kind?: ScheduledKind;
  title: string;
  steps: number;
  durationMinutes: number;
  startedAt: string;
  endsAt: string;
  status: "active" | "completed" | "expired" | "needsReflection" | "recoveryRequired";
  isMandatoryRecovery?: boolean;
};

type CheckIn = {
  wakeTime?: string;
  estimatedSleepWindow?: string;
  caffeineCutoffSuggestion?: string;
  mealCutoffSuggestion?: string;
  windDownGoal?: string;
  createdAt?: string;
};

type WeekdayName = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
type LowercaseWeekdayName = Lowercase<WeekdayName>;

type ScheduleEvent = {
  id: string;
  time: string;
  icon: string;
  title: string;
  detail: string;
  tone: "green" | "gold" | "purple" | "blue";
  kind?: ScheduledKind;
  dayLabel: string;
  typeLabel: string;
  steps?: number;
  duration?: string;
  status?: string;
  description?: string;
};

const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";
const CHECKIN_KEY = "lit_latest_checkin";
const ACTIVE_TIMED_QUEST_KEY = "lit_active_timed_quest";
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;

const WEEKDAY_NAMES: WeekdayName[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const TIME_ROWS = [
  "7 AM",
  "8 AM",
  "9 AM",
  "10 AM",
  "11 AM",
  "12 PM",
  "1 PM",
  "2 PM",
  "3 PM",
  "4 PM",
  "5 PM",
  "6 PM",
  "7 PM",
  "8 PM",
  "9 PM",
  "10 PM",
];

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function formatShortDate(date: Date) {
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatWeekRange(weekDays: Date[]) {
  const first = weekDays[0];
  const last = weekDays[6];
  const sameMonth = first.getMonth() === last.getMonth();

  if (sameMonth) {
    return `${first.toLocaleDateString([], { month: "short" })} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`;
  }

  return `${formatShortDate(first)} – ${formatShortDate(last)}, ${last.getFullYear()}`;
}

function getQueueText(item?: QueueItem) {
  return item?.text?.trim() || item?.title?.trim() || item?.task?.trim() || item?.note?.trim() || "";
}

function getDayPlanValue(dayPlan: DayPlan | null, dayName: WeekdayName) {
  if (!dayPlan) return "";

  const lowercaseDay = dayName.toLowerCase() as LowercaseWeekdayName;
  return dayPlan.weekdayRoles?.[dayName]?.trim() || dayPlan[dayName]?.trim() || dayPlan[lowercaseDay]?.trim() || "";
}

function getDayChecklist(dayPlan: DayPlan | null, dayName: WeekdayName) {
  if (!dayPlan) return [];

  return (dayPlan.weekdayChecklists?.[dayName] || [])
    .filter((item) => item.text?.trim())
    .map((item, index) => ({
      id: item.id || `${dayName}-${index}`,
      text: item.text?.trim() || "Habit action",
      checked: Boolean(item.checked),
      steps: 1,
      startTime: item.startTime || (index === 0 ? "2 PM" : "5 PM"),
      duration: item.duration || "30 min",
      durationMinutes: item.durationMinutes || parseDurationMinutes(item.duration, 30),
      status: item.status || (item.checked ? "completed" : "scheduled"),
      kind: item.kind || inferScheduledKind(item.text),
    }));
}

function getDateKey(date: Date) {
  return date.toLocaleDateString("en-CA");
}

function getQueueGridTime(item?: QueueItem) {
  const time = item?.startTime || item?.time;
  if (!time) return "4 PM";

  const match = time.match(/^(\d{1,2})(?::\d{2})?\s?(AM|PM)$/i);
  if (!match) return "4 PM";

  return `${Number(match[1])} ${match[2].toUpperCase()}`;
}

function getEventToneStyle(tone: ScheduleEvent["tone"]) {
  switch (tone) {
    case "gold":
      return styles.eventGold;
    case "purple":
      return styles.eventPurple;
    case "blue":
      return styles.eventBlue;
    case "green":
    default:
      return styles.eventGreen;
  }
}

export default function CalendarScreen() {
  const router = useRouter();
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [activeTimedQuest, setActiveTimedQuest] = useState<ActiveTimedQuest | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  useEffect(() => {
    loadCalendarData();
  }, []);

  async function loadCalendarData() {
    const [savedQueue, savedPlan, savedCheckIn, savedActiveTimedQuest] = await Promise.all([
      AsyncStorage.getItem(TOMORROW_QUEUE_KEY),
      AsyncStorage.getItem(DAY_PLAN_KEY),
      AsyncStorage.getItem(CHECKIN_KEY),
      AsyncStorage.getItem(ACTIVE_TIMED_QUEST_KEY),
    ]);

    if (savedQueue) {
      try {
        const parsed = JSON.parse(savedQueue);
        setQueueItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        setQueueItems([]);
      }
    } else {
      setQueueItems([]);
    }

    if (savedPlan) {
      try {
        setDayPlan(JSON.parse(savedPlan));
      } catch {
        setDayPlan(null);
      }
    } else {
      setDayPlan(null);
    }

    if (savedCheckIn) {
      try {
        setLatestCheckIn(JSON.parse(savedCheckIn));
      } catch {
        setLatestCheckIn(null);
      }
    } else {
      setLatestCheckIn(null);
    }

    if (savedActiveTimedQuest) {
      try {
        setActiveTimedQuest(JSON.parse(savedActiveTimedQuest));
      } catch {
        setActiveTimedQuest(null);
      }
    } else {
      setActiveTimedQuest(null);
    }
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

  const todayName = WEEKDAY_NAMES[today.getDay()];
  const todayPlanText = dayPlan?.todayGoal?.trim() || getDayPlanValue(dayPlan, todayName);
  const todayQuest = todayPlanText || "Not set yet";
  const nextQuickThought = queueItems[0];
  const quickThought = getQueueText(nextQuickThought) || "Not set yet";
  const expectedSleep = latestCheckIn?.estimatedSleepWindow || latestCheckIn?.windDownGoal || "Not set";
  const lastMeal = latestCheckIn?.mealCutoffSuggestion || "Not set";
  const caffeine = latestCheckIn?.caffeineCutoffSuggestion || "Not set";
  const hasQuickThought = quickThought !== "Not set yet";
  const hasTodayQuest = todayQuest !== "Not set yet";
  const hasSleepData = expectedSleep !== "Not set";

  function buildDayLabel(date: Date) {
    return `${WEEKDAY_LABELS[date.getDay()]} ${formatShortDate(date)}`;
  }

  function getEventsForDay(date: Date): ScheduleEvent[] {
    const dayIndex = date.getDay();
    const dayName = WEEKDAY_NAMES[dayIndex];
    const isToday = date.toDateString() === today.toDateString();
    const dateKey = getDateKey(date);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    const role = getDayPlanValue(dayPlan, dayName);
    const scheduledQuickThoughts = queueItems.filter((item) => item.date === dateKey);
    const legacyQuickThought = !scheduledQuickThoughts.length && isTomorrow ? queueItems.find((item) => !item.date) : undefined;
    const checklist = getDayChecklist(dayPlan, dayName);
    const events: ScheduleEvent[] = [];

    if (isToday && hasTodayQuest) {
      events.push({
        id: `${date.toISOString()}-today-quest`,
        time: "9 AM",
        icon: "⭐",
        title: "Today Quest",
        detail: todayQuest,
        tone: "gold",
        dayLabel: buildDayLabel(date),
        typeLabel: "Today Quest",
        kind: "progress",
        steps: 2,
        duration: "30 min",
        status: "scheduled",
        description: "Today’s main Day Plan focus.",
      });
    }

    if (role) {
      events.push({
        id: `${date.toISOString()}-day-plan`,
        time: isToday ? "1 PM" : "11 AM",
        icon: "📜",
        title: "Day Role",
        detail: role,
        tone: isToday ? "green" : "blue",
        dayLabel: buildDayLabel(date),
        typeLabel: "Day Plan role",
        status: "scheduled",
        description: "Weekly role from Day Plan.",
      });
    }

    checklist.slice(0, 2).forEach((item, index) => {
      const itemKind = item.kind || inferScheduledKind(item.text);
      events.push({
        id: `${date.toISOString()}-habit-${item.id}`,
        time: getQueueGridTime({ time: item.startTime }),
        icon: item.checked ? "✅" : "☐",
        title: item.checked ? "+1 Habit" : "Habit",
        detail: `${item.text} • ${item.startTime || "Time TBD"} • ${item.duration || "30 min"}${item.checked ? " • +1" : ""}`,
        tone: item.checked ? "green" : itemKind === "recovery" ? "purple" : "gold",
        dayLabel: buildDayLabel(date),
        kind: itemKind,
        typeLabel: "Habit checklist item",
        steps: item.checked ? 1 : undefined,
        duration: item.duration || "30 min",
        status: item.status || (item.checked ? "completed" : "scheduled"),
        description: item.checked ? "Checked habit action from Day Plan." : "Habit action from Day Plan.",
      });
    });

    [...scheduledQuickThoughts, ...(legacyQuickThought ? [legacyQuickThought] : [])].slice(0, 2).forEach((item, index) => {
      const itemKind = item.kind || inferScheduledKind(getQueueText(item));
      events.push({
        id: `${date.toISOString()}-quick-thought-${index}`,
        time: getQueueGridTime(item),
        icon: "💭",
        title: `+${typeof item.steps === "number" ? item.steps : getQuickThoughtSteps(item.duration)} Quest`,
        detail: `${getQueueText(item)} • ${item.startTime || item.time || "Time TBD"}${item.duration ? ` • ${item.duration}` : ""}`,
        tone: item.status === "completed" ? "green" : itemKind === "recovery" ? "purple" : "gold",
        dayLabel: buildDayLabel(date),
        kind: itemKind,
        typeLabel: "Quick Thought",
        steps: typeof item.steps === "number" ? item.steps : getQuickThoughtSteps(item.duration),
        duration: item.duration || "30 min",
        status: item.status || "scheduled",
        description: itemKind === "recovery" ? "Recovery quest scheduled from Quick Thoughts." : "Progress quest scheduled from Quick Thoughts.",
      });
    });

    const scheduledItemsForRecovery: ScheduledQuestLike[] = [
      ...checklist.map((item, index) => ({
        id: item.id || `${dateKey}-habit-${index}`,
        source: "dayPlanChecklist" as const,
        title: item.text,
        date: dateKey,
        weekday: dayName,
        startTime: item.startTime,
        duration: item.duration,
        durationMinutes: item.durationMinutes,
        steps: 1,
        kind: item.kind || inferScheduledKind(item.text),
        status: item.status || (item.checked ? "completed" : "scheduled"),
      })),
      ...scheduledQuickThoughts.map((item, index) => ({
        id: item.title || item.text || `${dateKey}-quick-${index}`,
        source: "quickThought" as const,
        title: getQueueText(item) || "Quick Thought",
        date: dateKey,
        weekday: item.weekday,
        startTime: item.startTime || item.time,
        duration: item.duration || "30 min",
        durationMinutes: item.durationMinutes || parseDurationMinutes(item.duration, 30),
        steps: typeof item.steps === "number" ? item.steps : getQuickThoughtSteps(item.duration),
        kind: item.kind || inferScheduledKind(getQueueText(item)),
        status: item.status || "scheduled",
      })),
    ];
    const recoveryBlock = getRequiredRecoveryBlockForDate(scheduledItemsForRecovery, dateKey);
    if (recoveryBlock) {
      events.push({
        id: `${date.toISOString()}-recovery-required`,
        time: getQueueGridTime({ time: recoveryBlock.startTime }),
        icon: "💜",
        title: "Recovery Block",
        detail: "Recovery unlocks your next progress block.",
        tone: "purple",
        dayLabel: buildDayLabel(date),
        typeLabel: "Recovery Block",
        kind: "recovery",
        duration: "1 hr",
        status: "recoveryRequired",
        description: "Recovery unlocks your next progress block.",
      });
    }

    if (activeTimedQuest && getDateKey(new Date(activeTimedQuest.startedAt)) === dateKey) {
      const activeKind = activeTimedQuest.kind || inferScheduledKind(activeTimedQuest.title);
      events.push({
        id: `${date.toISOString()}-active-timed-quest`,
        time: getQueueGridTime({ time: new Date(activeTimedQuest.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }),
        icon: activeKind === "recovery" ? "💜" : "⚔️",
        title: activeTimedQuest.status === "recoveryRequired" ? "Recovery Required" : "Active Quest",
        detail: activeTimedQuest.title,
        tone: activeKind === "recovery" ? "purple" : "gold",
        dayLabel: buildDayLabel(date),
        typeLabel: activeTimedQuest.source === "recoveryBlock" ? "Recovery Block" : "Active timed quest",
        kind: activeKind,
        steps: activeTimedQuest.steps,
        duration: activeTimedQuest.durationMinutes >= 60 ? "1 hr" : activeTimedQuest.durationMinutes === 45 ? "45 min" : "30 min",
        status: activeTimedQuest.status,
        description: activeTimedQuest.status === "recoveryRequired" ? "Recovery unlocks your next progress block." : "Currently active on the Quest Board.",
      });
    }

    if ((isToday || dayIndex === 5) && hasSleepData) {
      events.push({
        id: `${date.toISOString()}-sleep`,
        time: "9 PM",
        icon: "🌙",
        title: "Sleep Plan",
        detail: expectedSleep,
        tone: "purple",
        dayLabel: buildDayLabel(date),
        typeLabel: "Sleep guide",
        status: "scheduled",
        description: "Sleep Calendar timing saved for this week.",
      });
    }

    return events;
  }

  const eventsByDay = weekDays.map((date) => getEventsForDay(date));

  return (
    <View style={styles.pageRoot}>
      <View style={styles.phoneStage}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.default} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView
            style={styles.screenScroller}
            contentContainerStyle={styles.hudContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.heroPanel}>
              <View style={styles.bannerIcon}>
                <Text style={styles.bannerIconText}>📖</Text>
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroLabel}>SCHEDULE BOARD</Text>
                <Text style={styles.heroTitle}>CALENDAR</Text>
                <Text style={styles.heroSubtitle}>Plan your quests. Master your week.</Text>
              </View>
              <Text style={styles.heroLantern}>🏰</Text>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryIcon}>📜</Text>
                <Text style={styles.summaryLabel}>TODAY QUEST</Text>
                <Text style={styles.summaryValue} numberOfLines={2}>{todayQuest}</Text>
                <Text style={styles.summaryHint}>{hasTodayQuest ? "Due today" : "Not set yet"}</Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryIcon}>💭</Text>
                <Text style={styles.summaryLabel}>YESTERDAY QUICK THOUGHT</Text>
                <Text style={styles.summaryValue} numberOfLines={2}>{quickThought}</Text>
                <Text style={styles.summaryTiny}>Saved thoughts become future +2 quests.</Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryIcon}>🌙</Text>
                <Text style={styles.summaryLabel}>EXPECTED SLEEP</Text>
                <Text style={styles.summaryValue}>{expectedSleep}</Text>
                <Text style={styles.summaryHint}>Goal: steady rest</Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryIcon}>☕</Text>
                <Text style={styles.summaryLabel}>LAST MEAL / CAFFEINE</Text>
                <Text style={styles.summaryLine}>Last meal: {lastMeal}</Text>
                <Text style={styles.summaryLine}>Caffeine: {caffeine}</Text>
              </View>
            </View>

            <View style={styles.calendarPanel}>
              <View style={styles.weekHeader}>
                <TouchableOpacity style={styles.arrowButton} onPress={() => setWeekOffset((current) => current - 1)}>
                  <Text style={styles.arrowText}>‹</Text>
                </TouchableOpacity>
                <View style={styles.weekTitleBox}>
                  <Text style={styles.weekTitle}>📅 THIS WEEK</Text>
                  <Text style={styles.weekRange}>{formatWeekRange(weekDays)}</Text>
                </View>
                <TouchableOpacity style={styles.arrowButton} onPress={() => setWeekOffset((current) => current + 1)}>
                  <Text style={styles.arrowText}>›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.gridHeaderRow}>
                <View style={styles.timeHeaderCell} />
                {weekDays.map((date, index) => {
                  const isToday = date.toDateString() === today.toDateString();
                  return (
                    <View key={date.toISOString()} style={[styles.dayHeaderCell, isToday && styles.dayHeaderCellActive]}>
                      <Text style={[styles.dayHeaderText, isToday && styles.dayHeaderTextActive]}>{WEEKDAY_LABELS[index]}</Text>
                      <Text style={[styles.dayNumberText, isToday && styles.dayHeaderTextActive]}>{date.getDate()}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.gridBody}>
                {TIME_ROWS.map((time) => (
                  <View key={time} style={styles.timeRow}>
                    <View style={styles.timeCell}>
                      <Text style={styles.timeText}>{time}</Text>
                    </View>
                    {weekDays.map((date, dayIndex) => {
                      const isToday = date.toDateString() === today.toDateString();
                      const event = eventsByDay[dayIndex].find((item) => item.time === time);

                      return (
                        <View key={`${date.toISOString()}-${time}`} style={[styles.scheduleCell, isToday && styles.scheduleCellToday]}>
                          {event ? (
                            <TouchableOpacity style={[styles.eventBlock, getEventToneStyle(event.tone)]} onPress={() => setSelectedEvent(event)}>
                              <Text style={styles.eventTitle} numberOfLines={1}>{event.icon} {event.title}</Text>
                              <Text style={styles.eventDetail} numberOfLines={2}>{event.detail}</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.actionCard} onPress={() => router.push("/tomorrow-queue")}>
                <Text style={styles.actionIcon}>💭</Text>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>QUICK THOUGHTS</Text>
                  <Text style={styles.actionSubtitle}>Save an idea for tomorrow</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionCard} onPress={() => router.push("/day-plan")}>
                <Text style={styles.actionIcon}>📜</Text>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>DAY PLAN</Text>
                  <Text style={styles.actionSubtitle}>Plan your day</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionCard, styles.actionCardWide]} onPress={() => router.push("/sleep-calendar")}>
                <Text style={styles.actionIcon}>🌙</Text>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>SLEEP CALENDAR</Text>
                  <Text style={styles.actionSubtitle}>Track your sleep timing</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {selectedEvent ? (
            <View style={styles.eventModalBackdrop}>
              <View style={styles.eventModalCard}>
                <Text style={styles.eventModalKicker}>{selectedEvent.typeLabel}</Text>
                <Text style={styles.eventModalTitle}>{selectedEvent.icon} {selectedEvent.title}</Text>
                <Text style={styles.eventModalLine}>Day: {selectedEvent.dayLabel}</Text>
                <Text style={styles.eventModalLine}>Time: {selectedEvent.time}</Text>
                {selectedEvent.duration ? <Text style={styles.eventModalLine}>Duration: {selectedEvent.duration}</Text> : null}
                {selectedEvent.kind ? <Text style={styles.eventModalLine}>Kind: {selectedEvent.kind === "recovery" ? "Recovery" : "Progress"}</Text> : null}
                {selectedEvent.status ? <Text style={styles.eventModalLine}>Status: {selectedEvent.status}</Text> : null}
                <Text style={styles.eventModalBody}>{selectedEvent.detail}</Text>
                {selectedEvent.steps ? <Text style={styles.eventModalSteps}>+{selectedEvent.steps} steps</Text> : null}
                {selectedEvent.description ? <Text style={styles.eventModalDescription}>{selectedEvent.description}</Text> : null}
                <TouchableOpacity style={styles.eventModalButton} onPress={() => setSelectedEvent(null)}>
                  <Text style={styles.eventModalButtonText}>DONE</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}>
              <Text style={styles.navIcon}>🏠</Text>
              <Text style={styles.navLabel}>HOME</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/sleep")}>
              <Text style={styles.navIcon}>🌙</Text>
              <Text style={styles.navLabel}>SLEEP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/mind")}>
              <Text style={styles.navIcon}>🧠</Text>
              <Text style={styles.navLabel}>MIND</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navButton} onPress={() => router.push("/path")}>
              <Text style={styles.navIcon}>🌲</Text>
              <Text style={styles.navLabel}>PATH</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={() => router.push("/calendar")}>
              <Text style={styles.navIcon}>📅</Text>
              <Text style={[styles.navLabel, styles.navLabelActive]}>CAL</Text>
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
    borderColor: "#FBBF24",
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
    backgroundColor: "rgba(2, 6, 12, 0.55)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 92,
  },
  heroPanel: {
    minHeight: 88,
    backgroundColor: "rgba(5, 12, 24, 0.92)",
    borderWidth: 3,
    borderColor: "#D99B2B",
    borderRadius: 8,
    padding: 10,
    marginBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  bannerIcon: {
    width: 44,
    height: 58,
    borderWidth: 2,
    borderColor: "#7C4A17",
    backgroundColor: "rgba(46, 31, 20, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  bannerIconText: {
    fontSize: 28,
  },
  heroCopy: {
    flex: 1,
  },
  heroLabel: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  heroTitle: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1.5,
    lineHeight: 35,
    textShadowColor: "#111827",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  heroSubtitle: {
    color: "#F8E7A1",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 4,
  },
  heroLantern: {
    fontSize: 30,
    marginLeft: 8,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  summaryCard: {
    width: "48.8%",
    minHeight: 82,
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    padding: 7,
  },
  summaryIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  summaryLabel: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    lineHeight: 14,
    marginBottom: 6,
  },
  summaryValue: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  summaryHint: {
    color: "#4ADE80",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 5,
  },
  summaryTiny: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 8,
    fontWeight: "900",
    lineHeight: 11,
    marginTop: 5,
  },
  summaryLine: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 17,
  },
  calendarPanel: {
    backgroundColor: "rgba(3, 10, 23, 0.95)",
    borderWidth: 3,
    borderColor: "#334155",
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 12,
  },
  weekHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#1F2937",
  },
  arrowButton: {
    width: 34,
    height: 34,
    borderWidth: 2,
    borderColor: "#D99B2B",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
  },
  arrowText: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 30,
  },
  weekTitleBox: {
    alignItems: "center",
  },
  weekTitle: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
  weekRange: {
    color: "#4ADE80",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 3,
  },
  gridHeaderRow: {
    flexDirection: "row",
    minHeight: 48,
    borderBottomWidth: 2,
    borderBottomColor: "#273244",
  },
  timeHeaderCell: {
    width: 42,
    borderRightWidth: 2,
    borderRightColor: "#273244",
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#273244",
  },
  dayHeaderCellActive: {
    backgroundColor: "rgba(22, 101, 52, 0.55)",
    borderWidth: 2,
    borderColor: "#4ADE80",
  },
  dayHeaderText: {
    color: "#F8E7A1",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
  },
  dayNumberText: {
    color: "#E5E7EB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
  },
  dayHeaderTextActive: {
    color: "#BBF7D0",
  },
  gridBody: {
    backgroundColor: "rgba(2, 8, 20, 0.72)",
  },
  timeRow: {
    flexDirection: "row",
    minHeight: 43,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(51, 65, 85, 0.45)",
  },
  timeCell: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 2,
    borderRightColor: "#273244",
    backgroundColor: "rgba(8, 13, 24, 0.72)",
  },
  timeText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "900",
  },
  scheduleCell: {
    flex: 1,
    minHeight: 43,
    borderRightWidth: 1,
    borderRightColor: "rgba(51, 65, 85, 0.65)",
    padding: 2,
  },
  scheduleCellToday: {
    backgroundColor: "rgba(22, 101, 52, 0.18)",
  },
  eventBlock: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 2,
    justifyContent: "center",
  },
  eventGreen: {
    backgroundColor: "rgba(20, 83, 45, 0.9)",
    borderColor: "#22C55E",
  },
  eventGold: {
    backgroundColor: "rgba(113, 63, 18, 0.9)",
    borderColor: "#F59E0B",
  },
  eventPurple: {
    backgroundColor: "rgba(59, 30, 91, 0.9)",
    borderColor: "#A78BFA",
  },
  eventBlue: {
    backgroundColor: "rgba(30, 64, 111, 0.9)",
    borderColor: "#38BDF8",
  },
  eventTitle: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 12,
  },
  eventDetail: {
    color: "#F8E7A1",
    fontFamily: pixelFont,
    fontSize: 8,
    fontWeight: "800",
    lineHeight: 11,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  actionCard: {
    width: "48.6%",
    minHeight: 76,
    backgroundColor: "rgba(6, 78, 59, 0.94)",
    borderWidth: 3,
    borderColor: "#D99B2B",
    borderRadius: 6,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  actionCardWide: {
    width: "100%",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
  },
  actionIcon: {
    fontSize: 25,
    marginRight: 8,
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
    lineHeight: 16,
  },
  actionSubtitle: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 15,
    marginTop: 3,
  },
  actionArrow: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 28,
    fontWeight: "900",
    marginLeft: 5,
  },
  eventModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 5,
  },
  eventModalCard: {
    width: "100%",
    backgroundColor: "rgba(8, 13, 24, 0.98)",
    borderWidth: 3,
    borderColor: "#D99B2B",
    borderRadius: 8,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.75,
    shadowRadius: 0,
    shadowOffset: { width: 5, height: 5 },
  },
  eventModalKicker: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
  },
  eventModalTitle: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 26,
    marginBottom: 10,
  },
  eventModalLine: {
    color: "#E5E7EB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 5,
  },
  eventModalBody: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
    marginTop: 6,
  },
  eventModalSteps: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 8,
  },
  eventModalDescription: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 8,
  },
  eventModalButton: {
    backgroundColor: "rgba(109, 40, 217, 0.94)",
    borderWidth: 2,
    borderColor: "#FDE047",
    borderRadius: 5,
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 14,
  },
  eventModalButtonText: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  bottomNav: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(5, 12, 24, 0.96)",
    borderWidth: 3,
    borderColor: "#FBBF24",
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
    backgroundColor: "rgba(20, 83, 45, 0.92)",
    borderColor: "#FDE047",
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
    color: "#FDE047",
  },
});