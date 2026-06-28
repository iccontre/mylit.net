import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { collectDayPlanScheduledItems, collectQuickThoughtScheduledItems, findScheduleOverlap, getQuickThoughtSteps, parseDurationMinutes, requiresRecoveryBeforeNewProgress, type ScheduledKind } from "../lib/scheduling";

type QueueItem = {
  id?: string;
  source?: "quickThought";
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
  createdAt?: string;
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
  weekdayChecklists?: Partial<Record<string, ChecklistItem[]>>;
};

type QuestDay = {
  date: Date;
  dateKey: string;
  weekday: string;
  label: string;
  dayNumber: number;
};

const STORAGE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;
const DAILY_QUEST_LIMIT = 3;

const TIME_SLOTS = generateTimeSlots();
const DURATIONS = ["30 min", "45 min", "1 hr"];
const QUEST_KINDS: { label: string; value: ScheduledKind }[] = [
  { label: "Progress quest", value: "progress" },
  { label: "Recovery quest", value: "recovery" },
];
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function getDateKey(date: Date) {
  return date.toLocaleDateString("en-CA");
}

function generateTimeSlots() {
  const slots: string[] = [];
  const startMinutes = 7 * 60;
  const endMinutes = 21 * 60;

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    slots.push(`${hour12}:${String(minute).padStart(2, "0")} ${period}`);
  }

  return slots;
}

function isPastDateKey(dateKey: string) {
  return dateKey < getDateKey(new Date());
}

function getQuestText(item: QueueItem) {
  return item.text?.trim() || item.title?.trim() || item.task?.trim() || item.note?.trim() || "Untitled quest";
}

function formatSavedDate(item: QueueItem) {
  if (item.weekday && item.date) {
    const [, month, day] = item.date.split("-");
    return `${item.weekday} ${Number(month)}/${Number(day)}`;
  }

  if (item.weekday) return item.weekday;
  if (item.date) return item.date;

  return "Unscheduled";
}

function generateCurrentWeek(): QuestDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monday = new Date(today);
  const day = today.getDay();
  const distanceFromMonday = day === 0 ? -6 : 1 - day;
  monday.setDate(today.getDate() + distanceFromMonday);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const weekday = WEEKDAY_LABELS[date.getDay()];

    return {
      date,
      dateKey: getDateKey(date),
      weekday,
      label: weekday,
      dayNumber: date.getDate(),
    };
  });
}

function guessType(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("cook") || lower.includes("meal") || lower.includes("recipe") || lower.includes("eat")) {
    return "Meal Quest";
  }

  if (lower.includes("study") || lower.includes("homework") || lower.includes("assignment")) {
    return "Focus Quest";
  }

  if (lower.includes("workout") || lower.includes("gym") || lower.includes("walk")) {
    return "Body Quest";
  }

  if (lower.includes("text") || lower.includes("friend") || lower.includes("call")) {
    return "Connection Quest";
  }

  return "Personal Quest";
}

export default function TomorrowQueueScreen() {
  const router = useRouter();
  const weekDays = useMemo(() => generateCurrentWeek(), []);
  const todayKey = getDateKey(new Date());
  const todayInWeek = weekDays.find((day) => day.dateKey === todayKey) || weekDays[0];

  const [request, setRequest] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState(todayInWeek.dateKey);
  const [selectedTime, setSelectedTime] = useState("9:00 AM");
  const [selectedDuration, setSelectedDuration] = useState("30 min");
  const [selectedKind, setSelectedKind] = useState<ScheduledKind>("progress");
  const [timePage, setTimePage] = useState(0);
  const [message, setMessage] = useState("");

  const selectedDay = weekDays.find((day) => day.dateKey === selectedDateKey) || todayInWeek;
  const selectedDayIsPast = isPastDateKey(selectedDay.dateKey);
  const selectedDayQuestCount = items.filter((item) => item.date === selectedDateKey).length;
  const selectedSteps = getQuickThoughtSteps(selectedDuration);
  const visibleTimeSlots = TIME_SLOTS.slice(timePage, timePage + 5);
  const canRewindTime = timePage > 0;
  const canAdvanceTime = timePage + 5 < TIME_SLOTS.length;

  useEffect(() => {
    loadQueue();
    loadDayPlan();
  }, []);

  async function loadQueue() {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        setItems([]);
      }
    } else {
      setItems([]);
    }
  }


  async function loadDayPlan() {
    const saved = await AsyncStorage.getItem(DAY_PLAN_KEY);
    if (!saved) {
      setDayPlan(null);
      return;
    }

    try {
      setDayPlan(JSON.parse(saved));
    } catch {
      setDayPlan(null);
    }
  }

  async function saveQueue(nextItems: QueueItem[]) {
    setItems(nextItems);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
  }

  async function addToQueue() {
    const trimmed = request.trim();
    if (!trimmed) {
      setMessage("Write the quest first, then choose when it should happen.");
      return;
    }

    if (selectedDayIsPast) {
      setMessage("Past days can’t be edited.");
      return;
    }

    const existingForDay = items.filter((item) => item.date === selectedDateKey).length;
    if (existingForDay >= DAILY_QUEST_LIMIT) {
      setMessage("You can only save 3 Quick Thought quests for this day.");
      return;
    }

    const candidate = {
      id: `quick-${selectedDay.dateKey}-${Date.now()}`,
      source: "quickThought" as const,
      title: trimmed,
      date: selectedDay.dateKey,
      weekday: selectedDay.weekday,
      startTime: selectedTime,
      duration: selectedDuration,
      durationMinutes: parseDurationMinutes(selectedDuration),
      steps: selectedSteps,
      status: "scheduled" as const,
      kind: selectedKind,
      createdAt: new Date().toISOString(),
    };

    const scheduledItems = [
      ...collectQuickThoughtScheduledItems(items),
      ...collectDayPlanScheduledItems(dayPlan, (weekday) => weekDays.find((day) => day.weekday === weekday.slice(0, 3).toUpperCase())?.dateKey),
    ];

    if (findScheduleOverlap(candidate, scheduledItems)) {
      setMessage("This overlaps another scheduled quest. Choose a different time.");
      return;
    }

    if (requiresRecoveryBeforeNewProgress(candidate, scheduledItems)) {
      setMessage("Schedule a 1-hour recovery quest before adding more progress.");
      return;
    }

    const newItem: QueueItem = {
      id: candidate.id,
      source: "quickThought",
      text: trimmed,
      title: trimmed,
      type: guessType(trimmed),
      date: selectedDay.dateKey,
      weekday: selectedDay.weekday,
      time: selectedTime,
      duration: selectedDuration,
      durationMinutes: candidate.durationMinutes,
      steps: selectedSteps,
      status: "scheduled",
      kind: selectedKind,
      createdAt: candidate.createdAt,
    };

    const nextItems = [newItem, ...items];
    await saveQueue(nextItems);
    setRequest("");
    setMessage(`Saved ${selectedKind} quest for ${selectedDay.weekday} at ${selectedTime} as a +${selectedSteps} step${selectedSteps === 1 ? "" : "s"} quest.`);
  }

  async function clearQueue() {
    await saveQueue([]);
    setMessage("Saved quests cleared.");
  }

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
                <Text style={styles.bannerIconText}>✦</Text>
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>QUEST SCHEDULER</Text>
                <Text style={styles.title}>QUICK THOUGHTS</Text>
                <Text style={styles.summary}>Schedule a future quest. 30–45 min earns +1 step, 1 hr earns +2 steps.</Text>
              </View>
            </View>

            <View style={styles.creationPanel}>
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>1. WHAT QUEST DO YOU WANT TO SAVE?</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Example: finish coding app at coffee shop"
                  placeholderTextColor="#94A3B8"
                  value={request}
                  onChangeText={(text) => {
                    setRequest(text);
                    if (message) setMessage("");
                  }}
                />
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>2. IS THIS PROGRESS OR RECOVERY?</Text>
                <View style={styles.kindSelectorRow}>
                  {QUEST_KINDS.map((kind) => {
                    const selected = kind.value === selectedKind;
                    return (
                      <TouchableOpacity
                        key={kind.value}
                        style={[
                          styles.kindButton,
                          kind.value === "progress" ? styles.kindButtonProgress : styles.kindButtonRecovery,
                          selected && (kind.value === "progress" ? styles.kindButtonProgressActive : styles.kindButtonRecoveryActive),
                        ]}
                        onPress={() => {
                          setSelectedKind(kind.value);
                          setMessage("");
                        }}
                      >
                        <Text style={[styles.kindButtonText, selected && styles.kindButtonTextActive]}>{kind.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>3. WHICH DAY?</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
                  {weekDays.map((day) => {
                    const selected = day.dateKey === selectedDateKey;
                    const isPast = isPastDateKey(day.dateKey);
                    return (
                      <TouchableOpacity
                        key={day.dateKey}
                        style={[styles.dayButton, selected && !isPast && styles.dayButtonActive, isPast && styles.dayButtonDisabled]}
                        disabled={isPast}
                        onPress={() => {
                          if (isPast) {
                            setMessage("Past days can’t be edited.");
                            return;
                          }

                          setSelectedDateKey(day.dateKey);
                          setMessage("");
                        }}
                      >
                        <Text style={[styles.dayLabel, selected && !isPast && styles.dayLabelActive, isPast && styles.dayTextDisabled]}>{day.label}</Text>
                        <Text style={[styles.dayNumber, selected && !isPast && styles.dayLabelActive, isPast && styles.dayTextDisabled]}>{day.dayNumber}</Text>
                        {isPast ? <Text style={styles.pastDayLabel}>Past</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.sectionBlock}>
                <View style={styles.timeHeaderRow}>
                  <Text style={styles.sectionTitle}>4. WHEN SHOULD THIS QUEST HAPPEN?</Text>
                  <View style={styles.timeArrowGroup}>
                    <TouchableOpacity
                      style={[styles.timeArrowButton, !canRewindTime && styles.timeArrowButtonDisabled]}
                      onPress={() => {
                        if (canRewindTime) {
                          setTimePage((currentPage) => Math.max(currentPage - 5, 0));
                        }
                      }}
                    >
                      <Text style={styles.timeArrowText}>←</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.timeArrowButton, !canAdvanceTime && styles.timeArrowButtonDisabled]}
                      onPress={() => {
                        if (canAdvanceTime) {
                          setTimePage((currentPage) => Math.min(currentPage + 5, TIME_SLOTS.length - 5));
                        }
                      }}
                    >
                      <Text style={styles.timeArrowText}>→</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.timeStrip}>
                  {visibleTimeSlots.map((slot) => {
                    const selected = slot === selectedTime;
                    return (
                      <TouchableOpacity key={slot} style={[styles.timeButton, selected && styles.timeButtonActive]} onPress={() => setSelectedTime(slot)}>
                        <Text style={[styles.timeButtonText, selected && styles.optionTextActive]}>{slot}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>5. HOW LONG SHOULD THIS TAKE?</Text>
                <View style={styles.durationRow}>
                  {DURATIONS.map((duration) => {
                    const selected = duration === selectedDuration;
                    return (
                      <TouchableOpacity key={duration} style={[styles.durationButton, selected && styles.durationButtonActive]} onPress={() => setSelectedDuration(duration)}>
                        <Text style={[styles.durationText, selected && styles.optionTextActive]}>{duration}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {message ? <Text style={message.includes("only save") || message.includes("overlaps") || message.includes("recovery") ? styles.errorMessage : styles.statusMessage}>{message}</Text> : null}

              <TouchableOpacity style={[styles.saveButton, (selectedDayQuestCount >= DAILY_QUEST_LIMIT || selectedDayIsPast) && styles.saveButtonDisabled]} onPress={addToQueue}>
                <Text style={styles.saveButtonText}>SAVE +{selectedSteps} STEP{selectedSteps === 1 ? "" : "S"} QUEST</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.savedHeaderRow}>
              <Text style={styles.savedTitle}>🎒 SAVED QUESTS</Text>
              <Text style={styles.savedCount}>{selectedDayQuestCount}/{DAILY_QUEST_LIMIT} selected day</Text>
            </View>

            {items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🪶</Text>
                <Text style={styles.emptyText}>No quick thoughts saved yet. Add one and it will appear on your calendar.</Text>
              </View>
            ) : (
              items.map((item, index) => (
                <View key={`${getQuestText(item)}-${item.date || "legacy"}-${index}`} style={styles.queueCard}>
                  <View style={styles.queueTopRow}>
                    <Text style={styles.questLabel}>+{item.steps || getQuickThoughtSteps(item.duration)} STEP{(item.steps || getQuickThoughtSteps(item.duration)) === 1 ? "" : "S"}</Text>
                    <Text style={styles.queueMeta}>{formatSavedDate(item)} • {item.time || "Time not set"}</Text>
                  </View>
                  <Text style={styles.queueTitle}>{getQuestText(item)}</Text>
                  <Text style={styles.queueDetail}>{item.duration || "30 min"} • {item.time || item.startTime || "Time not set"} • {item.type || "Personal Quest"}</Text>
                </View>
              ))
            )}

            {items.length > 0 && (
              <TouchableOpacity style={styles.clearButton} onPress={clearQueue}>
                <Text style={styles.clearButtonText}>Clear Quick Thoughts</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/")}>
              <Text style={styles.homeButtonText}>← Back to Today</Text>
            </TouchableOpacity>
          </ScrollView>
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
    backgroundColor: "rgba(2, 6, 12, 0.48)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  heroPanel: {
    backgroundColor: "rgba(5, 12, 24, 0.9)",
    borderWidth: 3,
    borderColor: "#D99B2B",
    borderRadius: 8,
    padding: 13,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  bannerIcon: {
    width: 46,
    height: 66,
    backgroundColor: "rgba(70, 28, 112, 0.86)",
    borderWidth: 2,
    borderColor: "#FDE047",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  bannerIconText: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 26,
    fontWeight: "900",
  },
  heroCopy: {
    flex: 1,
  },
  heroKicker: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  title: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 1,
    lineHeight: 32,
    textShadowColor: "#111827",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  summary: {
    color: "#F8E7A1",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 5,
  },
  creationPanel: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: "#334155",
  },
  sectionBlock: {
    marginBottom: 13,
  },
  sectionTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    lineHeight: 17,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(2, 6, 23, 0.95)",
    borderRadius: 5,
    padding: 13,
    fontSize: 15,
    color: "#F9FAFB",
    borderWidth: 2,
    borderColor: "#475569",
    fontFamily: pixelFont,
    fontWeight: "800",
  },
  dayStrip: {
    paddingVertical: 2,
    gap: 6,
  },
  dayButton: {
    width: 62,
    minHeight: 70,
    backgroundColor: "rgba(248, 231, 161, 0.9)",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#7C4A17",
    alignItems: "center",
    justifyContent: "center",
  },
  dayButtonActive: {
    backgroundColor: "rgba(91, 33, 182, 0.96)",
    borderColor: "#FDE047",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  dayButtonDisabled: {
    opacity: 0.42,
    backgroundColor: "rgba(51, 65, 85, 0.75)",
    borderColor: "#475569",
  },
  dayLabel: {
    color: "#3F2A12",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 5,
  },
  dayNumber: {
    color: "#1F1308",
    fontFamily: pixelFont,
    fontSize: 24,
    fontWeight: "900",
  },
  dayLabelActive: {
    color: "#FFFFFF",
  },
  dayTextDisabled: {
    color: "#94A3B8",
  },
  pastDayLabel: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 8,
    fontWeight: "900",
    marginTop: 2,
    textTransform: "uppercase",
  },
  timeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  timeArrowGroup: {
    flexDirection: "row",
    gap: 6,
  },
  timeArrowButton: {
    width: 34,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(49, 46, 129, 0.95)",
    borderWidth: 2,
    borderColor: "#FDE047",
    borderRadius: 5,
  },
  timeArrowButtonDisabled: {
    opacity: 0.45,
    borderColor: "#475569",
  },
  timeArrowText: {
    color: "#FFFFFF",
    fontFamily: pixelFont,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 20,
  },
  timeStrip: {
    flexDirection: "row",
    gap: 7,
  },
  timeButton: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 5,
    paddingVertical: 9,
    alignItems: "center",
  },
  timeButtonActive: {
    backgroundColor: "rgba(49, 46, 129, 0.95)",
    borderColor: "#FDE047",
  },
  timeButtonText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
  },
  optionTextActive: {
    color: "#FFFFFF",
  },

  kindSelectorRow: {
    flexDirection: "row",
    gap: 10,
  },
  kindButton: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
  },
  kindButtonProgress: {
    borderColor: "#A16207",
  },
  kindButtonRecovery: {
    borderColor: "#7C3AED",
  },
  kindButtonProgressActive: {
    borderColor: "#FDE047",
    backgroundColor: "rgba(113, 63, 18, 0.92)",
  },
  kindButtonRecoveryActive: {
    borderColor: "#C4B5FD",
    backgroundColor: "rgba(76, 29, 149, 0.92)",
  },
  kindButtonText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
  },
  kindButtonTextActive: {
    color: "#FFFFFF",
  },
  durationRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  durationButton: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 5,
    paddingVertical: 11,
    alignItems: "center",
  },
  durationButtonActive: {
    backgroundColor: "rgba(91, 33, 182, 0.95)",
    borderColor: "#FDE047",
  },
  durationText: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  statusMessage: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
    marginBottom: 10,
  },
  errorMessage: {
    color: "#FCA5A5",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
    marginBottom: 10,
  },
  saveButton: {
    backgroundColor: "#1D4ED8",
    borderWidth: 3,
    borderColor: "#FDE047",
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  saveButtonDisabled: {
    opacity: 0.58,
    borderColor: "#64748B",
  },
  saveButtonText: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  savedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  savedTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 17,
    fontWeight: "900",
  },
  savedCount: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
  },
  emptyCard: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderRadius: 6,
    padding: 13,
    borderWidth: 2,
    borderColor: "#7C3AED",
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  emptyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontWeight: "800",
  },
  queueCard: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  queueTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },

  savedKindTag: {
    alignSelf: "flex-start",
    marginTop: 5,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
  },
  savedKindProgress: {
    color: "#FDE047",
    borderColor: "#FDE047",
    backgroundColor: "rgba(113, 63, 18, 0.65)",
  },
  savedKindRecovery: {
    color: "#C4B5FD",
    borderColor: "#A78BFA",
    backgroundColor: "rgba(76, 29, 149, 0.65)",
  },
  questLabel: {
    color: "#86EFAC",
    fontSize: 11,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
  },
  queueTitle: {
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 6,
    lineHeight: 20,
  },
  queueMeta: {
    fontSize: 10,
    color: "#C4B5FD",
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  queueDetail: {
    fontSize: 12,
    color: "#CBD5E1",
    fontWeight: "800",
    fontFamily: pixelFont,
  },
  clearButton: {
    backgroundColor: "rgba(127, 29, 29, 0.9)",
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 2,
    borderWidth: 2,
    borderColor: "#F87171",
  },
  clearButtonText: {
    color: "#FEE2E2",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  homeButton: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    padding: 13,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 2,
    borderColor: "#64748B",
  },
  homeButtonText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});