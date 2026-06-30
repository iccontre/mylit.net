import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { useMobileFrame } from "../constants/mobileLayout";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { collectDayPlanScheduledItems, collectQuickThoughtScheduledItems, formatDurationLabel, getDateKey, getQuickThoughtSteps, inferScheduledClassification, parseDurationMinutes, parseSleepGuideTime, parseTimeToMinutes, type ScheduledClassification, type ScheduledQuestLike } from "../lib/scheduling";

type WeekdayName = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
type EventTone = "gold" | "purple" | "blue" | "green";

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
const TIME_ROWS = ["7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM"];

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

function calendarTimeRow(time?: string): string {
  if (!time || time === "All day") return "7 AM";
  const minutes = parseSleepGuideTime(time) ?? parseTimeToMinutes(time);
  if (minutes === null) return "9 AM";

  let bestRow = TIME_ROWS[0];
  let bestDistance = Number.MAX_SAFE_INTEGER;
  for (const row of TIME_ROWS) {
    const rowMinutes = parseTimeToMinutes(row);
    if (rowMinutes === null) continue;
    const distance = Math.abs(minutes - rowMinutes);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRow = row;
    }
  }
  return bestRow;
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

export default function CalendarScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [queueItems, setQueueItems] = useState<unknown[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    void trackEvent(ANALYTICS_EVENTS.calendar_opened);
    loadCalendarData();
  }, []);

  async function loadCalendarData() {
    const [queue, plan, checkIn] = await Promise.all([
      readJson<unknown[]>(TOMORROW_QUEUE_KEY, []),
      readJson<DayPlan | null>(DAY_PLAN_KEY, null),
      readJson<CheckIn | null>(CHECKIN_KEY, null),
    ]);
    setQueueItems(Array.isArray(queue) ? queue : []);
    setDayPlan(plan);
    setLatestCheckIn(checkIn);
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
    if (todayQuest && (todayQuest.date || getDateKey()) === dateKey && todayQuest.title?.trim()) {
      const classification = normalizeClassification(todayQuest.kind);
      events.push({
        id: todayQuest.id || `${dateKey}-today-quest`,
        title: todayQuest.title,
        cellLabel: "Today Quest +2",
        source: "Day Plan / Quest Board",
        date: dateKey,
        dayLabel,
        startTime: todayQuest.startTime || "9:00 AM",
        duration: todayQuest.duration || "1 hr",
        durationMinutes: parseDurationMinutes(todayQuest.durationMinutes ?? todayQuest.duration, 60),
        steps: 2,
        classification,
        tone: eventTone(classification),
        status: todayQuest.status || "scheduled",
        note: "This is the actual Day Plan quest. It appears on Quest Board and earns +2 steps.",
        priority: 1,
      });
    }

    quickThoughtItems.filter((item) => item.date === dateKey).forEach((item: ScheduledQuestLike) => {
      const classification = item.classification || inferScheduledClassification(item);
      events.push({
        id: item.id,
        title: item.title || item.text || "Quick Thought Quest",
        cellLabel: item.classification === "recovery" ? "Recovery quest" : "Progress quest",
        source: "Quick Thoughts",
        date: dateKey,
        dayLabel,
        startTime: item.startTime || item.time,
        duration: item.duration || formatDurationLabel(item.durationMinutes, 30),
        durationMinutes: item.durationMinutes,
        steps: item.steps ?? getQuickThoughtSteps(item.durationMinutes ?? item.duration),
        classification,
        tone: eventTone(classification),
        status: item.status,
        note: item.note || "Scheduled future quest from Quick Thoughts.",
        priority: 2,
      });
    });

    checklistItems.filter((item) => item.date === dateKey).forEach((item: ScheduledQuestLike) => {
      const classification = item.classification || inferScheduledClassification(item);
      events.push({
        id: item.id,
        title: item.title || "Checklist item",
        cellLabel: classification === "recovery" ? "Recovery" : "Progress",
        source: "Day Plan Checklist",
        date: dateKey,
        dayLabel,
        startTime: item.startTime || item.time,
        duration: item.duration || formatDurationLabel(item.durationMinutes, 30),
        durationMinutes: item.durationMinutes,
        steps: item.steps ?? 1,
        classification,
        tone: eventTone(classification),
        status: item.status,
        note: item.checked ? "Checked recurring Day Plan habit." : "Recurring Day Plan habit.",
        priority: 3,
      });
    });

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
  const todayEvents = eventsByDay.flat().filter((event: CalendarEvent) => event.date === todayKey);
  const todayQuestTitle = todayEvents.find((event: CalendarEvent) => event.source.includes("Quest Board"))?.title || "Not set yet";
  const nextQuickThought = quickThoughtItems[0]?.title || quickThoughtItems[0]?.text || "Not set yet";
  const expectedSleep = latestCheckIn?.estimatedSleepWindow || (latestCheckIn?.desiredSleepTime && latestCheckIn?.desiredWakeTime ? `${latestCheckIn.desiredSleepTime} – ${latestCheckIn.desiredWakeTime}` : latestCheckIn?.desiredSleepTime) || "Not set";

  function goToPreviousWeek() {
    setWeekOffset((current: number) => current - 1);
  }

  function goToNextWeek() {
    setWeekOffset((current: number) => current + 1);
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.phoneStageStyle, mobile.isFullscreen && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}><Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" /></View>
        <View style={styles.worldOverlay}>
          <ScrollView style={styles.screenScroller} contentContainerStyle={[styles.hudContent, { paddingBottom: mobile.scrollPaddingBottom }]} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.heroPanel}>
              <View style={styles.bannerIcon}><Text style={styles.bannerIconText}>📖</Text></View>
              <View style={styles.heroCopy}><Text style={styles.heroLabel}>SCHEDULE BOARD</Text><Text style={styles.heroTitle}>CALENDAR</Text><Text style={styles.heroSubtitle}>Sleep guides, quests, roles, and checklist habits.</Text></View>
              <Text style={styles.heroLantern}>🏰</Text>
            </View>

            <View style={styles.eviePanel}>
              <Image source={uiAssets.guides.evie} style={styles.evieAvatar} resizeMode="contain" />
              <View style={styles.evieCopy}>
                <Text style={styles.evieName}>EVIE</Text>
                <Text style={styles.evieText}>Calendar shows quests, habits, sleep guides, and recovery blocks. Tap any item to inspect it.</Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.summaryGrid}>
              <SummaryCard icon="⭐" label="TODAY QUEST" value={todayQuestTitle} hint="Quest Board • +2 steps" />
              <SummaryCard icon="💭" label="NEXT QUICK THOUGHT" value={nextQuickThought} hint="Future scheduled quest" />
              <SummaryCard icon="🌙" label="SLEEP GUIDE" value={expectedSleep} hint="Blue timing guidance" />
              <SummaryCard icon="📜" label="DAY FOCUS" value={dayPlan?.todayFocus || dayPlan?.todayGoal || "Not set"} hint="Theme only, no steps" />
            </View>

            <View style={styles.actionGrid}>
              <ActionButton icon="💭" title="Quick Thoughts" subtitle="Schedule a future quest" onPress={() => router.push("/tomorrow-queue")} />
              <ActionButton icon="📜" title="Day Plan" subtitle="Set today and weekly roles" onPress={() => router.push("/day-plan")} />
            </View>

            <View style={styles.weekNavPanel}>
              <TouchableOpacity style={styles.weekArrow} onPress={goToPreviousWeek}><Text style={styles.weekArrowText}>←</Text></TouchableOpacity>
              <View style={styles.weekCenter}><Text style={styles.weekKicker}>WEEK VIEW</Text><Text style={styles.weekRange}>{formatWeekRange(weekDays)}</Text></View>
              <TouchableOpacity style={styles.weekArrow} onPress={goToNextWeek}><Text style={styles.weekArrowText}>→</Text></TouchableOpacity>
            </View>

            <View style={styles.legendRow}>
              <Legend tone="blue" label="Sleep guide" /><Legend tone="gold" label="Progress" /><Legend tone="purple" label="Recovery" /><Legend tone="green" label="Focus" />
            </View>

            <View style={styles.calendarGrid}>
              <View style={styles.timeColumn}><Text style={styles.gridCorner}>TIME</Text>{TIME_ROWS.map((row) => <Text key={row} style={styles.timeCell}>{row}</Text>)}</View>
              {weekDays.map((date: Date, index: number) => {
                const isToday = getDateKey(date) === todayKey;
                const events = eventsByDay[index];
                const focusEvent = events.find((event: CalendarEvent) => event.classification === "focus");
                return (
                  <View key={date.toISOString()} style={[styles.dayColumn, isToday && styles.todayColumn]}>
                    <Text style={[styles.dayHeader, isToday && styles.dayHeaderToday]}>{WEEKDAY_LABELS[date.getDay()]}</Text>
                    <Text style={[styles.dayNumber, isToday && styles.dayHeaderToday]}>{date.getDate()}</Text>
                    {focusEvent ? (
                      <TouchableOpacity style={[styles.focusTab, getEventToneStyle("green")]} onPress={() => setSelectedEvent(focusEvent)}>
                        <Text style={styles.focusTabText} numberOfLines={1}>Focus: {focusEvent.title}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {TIME_ROWS.map((row) => {
                      const rowEvents = events
                        .filter((event: CalendarEvent) => event.classification !== "focus" && calendarTimeRow(event.startTime) === row)
                        .sort((a, b) => {
                          if (a.classification === "sleepGuide" && b.classification !== "sleepGuide") return 1;
                          if (b.classification === "sleepGuide" && a.classification !== "sleepGuide") return -1;
                          return (parseSleepGuideTime(a.startTime) ?? parseTimeToMinutes(a.startTime) ?? 0) -
                            (parseSleepGuideTime(b.startTime) ?? parseTimeToMinutes(b.startTime) ?? 0);
                        });
                      return (
                        <View key={`${date.toISOString()}-${row}`} style={styles.hourCell}>
                          {rowEvents.map((event) => (
                            <TouchableOpacity
                              key={event.classification === "sleepGuide" ? sleepGuideDedupeKey(event) : event.id}
                              style={[styles.eventBlock, getEventToneStyle(event.tone)]}
                              onPress={() => setSelectedEvent(event)}
                            >
                              <Text style={styles.eventTime} numberOfLines={1}>{event.startTime || "—"}</Text>
                              <Text style={styles.eventText} numberOfLines={2}>{event.cellLabel}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
          <BottomNav router={router} bottomOffset={mobile.bottomNavOffset} />

          {selectedEvent ? <EventPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} router={router} /> : null}
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
    case "gold": default: return styles.eventGold;
  }
}

function EventPopup({ event, onClose, router }: { event: CalendarEvent; onClose: () => void; router: ReturnType<typeof useRouter> }) {
  const todayKey = getDateKey(new Date());
  const isMissed = event.date < todayKey && event.status !== "completed" && event.classification !== "focus" && event.classification !== "sleepGuide";
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
  return styles.popupGold;
}

function InfoOverlay({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.infoOverlay}>
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>CALENDAR</Text>
        <ScrollView style={styles.infoScroll} showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={styles.infoBullet}>{"• Calendar shows sleep guides, quests, checklist habits, Quick Thoughts, recovery blocks, and day focus."}</Text>
          <Text style={styles.infoBullet}>{"• Blue = sleep guide / sleep timing. Gold = progress. Purple = recovery. Green = day focus / no-step focus."}</Text>
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

function BottomNav({ router, bottomOffset }: { router: ReturnType<typeof useRouter>; bottomOffset: number }) {
  return <View style={[styles.bottomNav, { bottom: bottomOffset }]}><TouchableOpacity style={styles.navButton} onPress={() => router.push("/")}><Text style={styles.navIcon}>🏠</Text><Text style={styles.navLabel}>HOME</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/sleep")}><Text style={styles.navIcon}>🌙</Text><Text style={styles.navLabel}>SLEEP</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/mind")}><Text style={styles.navIcon}>🧠</Text><Text style={styles.navLabel}>MIND</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/path")}><Text style={styles.navIcon}>🌲</Text><Text style={styles.navLabel}>PATH</Text></TouchableOpacity><TouchableOpacity style={[styles.navButton, styles.navButtonActive]} onPress={() => router.push("/calendar")}><Text style={styles.navIcon}>📅</Text><Text style={[styles.navLabel, styles.navLabelActive]}>CAL</Text></TouchableOpacity><TouchableOpacity style={styles.navButton} onPress={() => router.push("/stats")}><Text style={styles.navIcon}>🎒</Text><Text style={styles.navLabel}>BAG</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#02040A" },
  phoneStage: { alignSelf: "center", backgroundColor: "#050814", overflow: "hidden", position: "relative", borderWidth: 2, borderColor: "#FBBF24" },
  phoneStageFullscreen: { borderWidth: 0, maxWidth: undefined, aspectRatio: undefined },
  backgroundLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
  backgroundImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  worldOverlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.58)" },
  screenScroller: { flex: 1 },
  hudContent: { minHeight: "100%", paddingTop: 18, paddingHorizontal: 12, paddingBottom: 104 },
  heroPanel: { backgroundColor: "rgba(5, 12, 24, 0.92)", borderWidth: 3, borderColor: "#D99B2B", borderRadius: 8, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center" },
  bannerIcon: { width: 46, height: 66, backgroundColor: "rgba(70, 28, 112, 0.86)", borderWidth: 2, borderColor: "#FDE047", alignItems: "center", justifyContent: "center", marginRight: 12 },
  bannerIconText: { fontSize: 24 }, heroCopy: { flex: 1 }, heroLabel: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, heroTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 27, fontWeight: "900", letterSpacing: 1 }, heroSubtitle: { color: "#F8E7A1", fontSize: 12, lineHeight: 17, fontWeight: "800" }, heroLantern: { fontSize: 25 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 },
  summaryCard: { width: "49%", minHeight: 98, backgroundColor: "rgba(8,13,24,0.92)", borderWidth: 2, borderColor: "#334155", borderRadius: 8, padding: 9, marginBottom: 8 },
  summaryIcon: { fontSize: 18 }, summaryLabel: { color: "#FDE047", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 2 }, summaryValue: { color: "#F8FAFC", fontSize: 12, lineHeight: 17, fontWeight: "800", marginTop: 4 }, summaryHint: { color: "#94A3B8", fontSize: 10, marginTop: 4 },
  actionGrid: { marginBottom: 10 },
  actionButton: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(8,13,24,0.95)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, padding: 10, marginBottom: 8 },
  actionIcon: { fontSize: 22, marginRight: 10 }, actionCopy: { flex: 1 }, actionTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" }, actionSubtitle: { color: "#CBD5E1", fontSize: 11, fontWeight: "700", marginTop: 2 }, actionArrow: { color: "#FBBF24", fontSize: 28, fontWeight: "900" },
  weekNavPanel: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(8,13,24,0.95)", borderWidth: 2, borderColor: "#334155", borderRadius: 8, padding: 8, marginBottom: 8 },
  weekArrow: { width: 42, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.55)" },
  weekArrowText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" }, weekCenter: { flex: 1, alignItems: "center" }, weekKicker: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" }, weekRange: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginTop: 3 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 8 }, legendItem: { flexDirection: "row", alignItems: "center" }, legendDot: { width: 12, height: 12, borderRadius: 2, marginRight: 4 }, legendText: { color: "#CBD5E1", fontSize: 10, fontWeight: "800" },
  calendarGrid: { flexDirection: "row", backgroundColor: "rgba(8,13,24,0.92)", borderWidth: 2, borderColor: "#334155", borderRadius: 8, overflow: "hidden" },
  timeColumn: { width: 42, borderRightWidth: 1, borderRightColor: "#334155" }, gridCorner: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 8, textAlign: "center", paddingVertical: 8 }, timeCell: { color: "#64748B", fontSize: 8, minHeight: 44, textAlign: "center", paddingTop: 4 },
  dayColumn: { flex: 1, borderRightWidth: 1, borderRightColor: "#1F2937", padding: 3 },
  todayColumn: { backgroundColor: "rgba(34,197,94,0.08)", borderColor: "#86EFAC" }, dayHeader: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", textAlign: "center" }, dayHeaderToday: { color: "#FDE68A" }, dayNumber: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", textAlign: "center", marginBottom: 4 },
  hourCell: { minHeight: 44, borderTopWidth: 1, borderTopColor: "rgba(51,65,85,0.55)", paddingTop: 2, paddingBottom: 2, gap: 2, justifyContent: "flex-start" }, focusTab: { minHeight: 24, borderWidth: 1, borderRadius: 4, padding: 2, marginBottom: 2 }, focusTabText: { color: "#F8FAFC", fontSize: 7, lineHeight: 9, fontWeight: "900" }, eventBlock: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 2, paddingVertical: 2, minHeight: 26, marginBottom: 1 }, eventTime: { color: "#F8FAFC", fontSize: 7, fontWeight: "900" }, eventText: { color: "#F8FAFC", fontSize: 7, lineHeight: 9, fontWeight: "800" },
  eventGold: { backgroundColor: "rgba(113,63,18,0.85)", borderColor: "#FBBF24" }, eventPurple: { backgroundColor: "rgba(88,28,135,0.85)", borderColor: "#A78BFA" }, eventBlue: { backgroundColor: "rgba(14,116,144,0.85)", borderColor: "#67E8F9" }, eventGreen: { backgroundColor: "rgba(20,83,45,0.65)", borderColor: "#86EFAC" },
  popupOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 18, zIndex: 10 }, popupCard: { backgroundColor: "rgba(8,13,24,0.98)", borderWidth: 3, borderRadius: 12, padding: 16 }, popupGold: { borderColor: "#FBBF24" }, popupPurple: { borderColor: "#A78BFA" }, popupBlue: { borderColor: "#67E8F9" }, popupGreen: { borderColor: "#86EFAC" }, popupTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 20, fontWeight: "900", marginBottom: 4 }, popupSource: { color: "#FDE047", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginBottom: 12 }, popupRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#1F2937", paddingVertical: 6 }, popupLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "800" }, popupValue: { color: "#F8FAFC", fontSize: 12, fontWeight: "900", maxWidth: "60%", textAlign: "right" }, popupNote: { color: "#CBD5E1", fontSize: 13, lineHeight: 19, marginTop: 12 }, popupButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 12, alignItems: "center", marginTop: 14 }, popupButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  eviePanel: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(8,13,24,0.95)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, padding: 10, marginBottom: 10 },
  evieAvatar: { width: 44, height: 52, marginRight: 10 },
  evieCopy: { flex: 1 },
  evieName: { color: "#FDE047", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  evieText: { color: "#CBD5E1", fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  infoBtn: { width: 28, height: 28, borderWidth: 2, borderColor: "#FBBF24", borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(113,63,18,0.7)", marginLeft: 8 },
  infoBtnText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  infoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.82)", justifyContent: "center", alignItems: "center", padding: 20, zIndex: 25 },
  infoCard: { backgroundColor: "rgba(8,13,24,0.99)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 12, padding: 16, width: "100%" },
  infoTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", marginBottom: 10 },
  infoScroll: { maxHeight: 280 },
  infoBullet: { color: "#CBD5E1", fontSize: 13, lineHeight: 20, fontWeight: "700", marginBottom: 6 },
  infoClose: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 11, alignItems: "center", marginTop: 12 },
  infoCloseText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  reflectButton: { backgroundColor: "rgba(88,28,135,0.7)", borderWidth: 2, borderColor: "#A78BFA", paddingVertical: 10, alignItems: "center", marginTop: 10 },
  reflectButtonText: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  bottomNav: { position: "absolute", bottom: 8, left: 8, right: 8, height: 62, flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(4,8,16,0.98)", borderWidth: 3, borderColor: "#FBBF24", borderRadius: 5, padding: 4 },
  navButton: { flex: 1, backgroundColor: "#111827", borderWidth: 2, borderColor: "#3A4558", borderRadius: 3, paddingVertical: 4, marginHorizontal: 2, alignItems: "center", justifyContent: "center" },
  navButtonActive: { backgroundColor: "#162314", borderColor: "#FBBF24" },
  navIcon: { fontSize: 18 },
  navLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 1 },
  navLabelActive: { color: "#FDE68A" },
});