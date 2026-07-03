import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { FormScreen } from "../components/FormScreen";
import { BottomNav } from "../components/BottomNav";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { LOCAL_PROFILE_KEY } from "../lib/auth";
import { syncQuickThoughtItems } from "../lib/progressSync";
import {
  COMPLETED_QUESTS_KEY,
  DAY_PLAN_KEY,
  MISSED_QUESTS_KEY,
  TOMORROW_QUEUE_KEY,
  checkUserScheduledQuestCapacity,
  computeUserScheduledMinutesForDay,
  formatPlannedDurationLabel,
  getQuestCapacityMinutes,
  parseCompletions,
  parseMissed,
} from "../lib/questProgress";
import { generateSupplementaryQuest, getActiveSuggestedQuest, getQuestGoalAnchor, type GeneratedQuest, type QuestProfileContext } from "../lib/questGeneration";
import { persistProgressKeys } from "../lib/progressStore";
import {
  collectDayPlanScheduledItems,
  findScheduleOverlap,
  formatDurationLabel,
  formatEnergyDelta,
  generateTimeSlots,
  getDateKey,
  getEnergyDelta,
  getNapEnergyRestore,
  getStepsForItem,
  inferScheduledClassification,
  parseDurationMinutes,
  shiftTimeSlot,
  wouldTriggerRecoveryLock,
  type ScheduledClassification,
  type ScheduledQuestLike,
  type ScheduledStatus,
  type WeekdayName,
} from "../lib/scheduling";

type QuestKind = "progress" | "recovery";

type QueueItem = {
  id: string;
  source: "quickThought";
  text: string;
  title: string;
  type: string;
  classification: QuestKind;
  kind: "quickThought";
  date: string;
  weekday: string;
  time: string;
  startTime: string;
  duration: string;
  durationMinutes: number;
  steps: number;
  status: ScheduledStatus;
  createdAt: string;
  completedAt?: string;
};

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

type QuestDay = { date: Date; dateKey: string; weekday: string; label: string; dayNumber: number };

const STORAGE_KEY = TOMORROW_QUEUE_KEY;
const CHECKIN_KEY = "lit_latest_checkin";
const TIME_SLOTS = generateTimeSlots(7, 22, 30);
const DURATIONS = ["15 min", "30 min", "45 min", "1 hr"];
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
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

function normalizeKind(value: ScheduledClassification): QuestKind {
  return value === "recovery" ? "recovery" : "progress";
}

function isPastDateKey(dateKey: string) {
  return dateKey < getDateKey(new Date());
}

function generateCurrentWeek(): QuestDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  const day = today.getDay();
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { date, dateKey: getDateKey(date), weekday: date.toLocaleDateString([], { weekday: "long" }), label: WEEKDAY_LABELS[date.getDay()], dayNumber: date.getDate() };
  });
}

function normalizeQueueItem(raw: Partial<QueueItem>, index: number): QueueItem {
  const text = raw.text?.trim() || raw.title?.trim() || "Untitled quest";
  const durationMinutes = parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
  const classification = raw.classification || normalizeKind(inferScheduledClassification(raw));
  return {
    id: raw.id || `quick-${Date.now()}-${index}`,
    source: "quickThought",
    text,
    title: text,
    type: raw.type || (classification === "recovery" ? "Recovery Quest" : "Progress Quest"),
    classification,
    kind: "quickThought",
    date: raw.date || getDateKey(new Date()),
    weekday: raw.weekday || new Date(raw.date || Date.now()).toLocaleDateString([], { weekday: "long" }),
    time: raw.time || raw.startTime || "9:00 AM",
    startTime: raw.startTime || raw.time || "9:00 AM",
    duration: raw.duration || formatDurationLabel(durationMinutes),
    durationMinutes,
    steps: raw.steps ?? getStepsForItem(durationMinutes, classification),
    status: raw.status || (raw.completedAt ? "completed" : "scheduled"),
    createdAt: raw.createdAt || new Date().toISOString(),
    completedAt: raw.completedAt,
  };
}

function formatSavedDate(item: QueueItem) {
  const [, month, day] = item.date.split("-");
  return `${item.weekday} ${Number(month)}/${Number(day)}`;
}

type CheckIn = {
  mode?: "Recovery" | "Progress";
  energy?: number;
};

type LocalProfile = {
  dreamCategory?: string;
  supplementaryCategory?: string;
  specificGoal?: string;
  progressMeaning?: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  goalOne?: string;
  goalTwo?: string;
  goalThree?: string;
};

export default function TomorrowQueueScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const weekDays = useMemo(() => generateCurrentWeek(), []);
  const todayInWeek = weekDays.find((day: QuestDay) => day.dateKey === getDateKey()) || weekDays[0];
  const [request, setRequest] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dayPlan, setDayPlan] = useState<Record<string, unknown> | null>(null);
  const [boardMode, setBoardMode] = useState<"Progress" | "Recovery">("Progress");
  const [selectedDateKey, setSelectedDateKey] = useState(todayInWeek.dateKey);
  const [selectedTime, setSelectedTime] = useState("9:00 AM");
  const [selectedDuration, setSelectedDuration] = useState("30 min");
  const [selectedKind, setSelectedKind] = useState<QuestKind>("progress");
  const [message, setMessage] = useState("");
  const [conflictMessage, setConflictMessage] = useState("");
  const [recoveryWarning, setRecoveryWarning] = useState("");
  const [pendingRecoveryConfirm, setPendingRecoveryConfirm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [timeInputDraft, setTimeInputDraft] = useState("9:00 AM");
  const [timeInputError, setTimeInputError] = useState("");
  const [suggestedQuest, setSuggestedQuest] = useState<GeneratedQuest | null>(null);
  const [supplementaryQuest, setSupplementaryQuest] = useState<GeneratedQuest | null>(null);
  const hasInitializedTime = useRef(false);

  const selectedDay = weekDays.find((day: QuestDay) => day.dateKey === selectedDateKey) || todayInWeek;
  const selectedDayIsPast = isPastDateKey(selectedDay.dateKey);
  const selectedSteps = getStepsForItem(selectedDuration, selectedKind);
  const selectedEnergyDelta = getEnergyDelta({ kind: selectedKind, durationMinutes: parseDurationMinutes(selectedDuration, 30) });
  const selectedDayPlannedMinutes = computeUserScheduledMinutesForDay({
    dateKey: selectedDay.dateKey,
    weekday: selectedDay.weekday as WeekdayName,
    quickThoughts: items,
    dayPlan,
  });
  const selectedDayCapacityMinutes = getQuestCapacityMinutes(boardMode);
  const selectedDayRemainingMinutes = Math.max(0, selectedDayCapacityMinutes - selectedDayPlannedMinutes);
  const selectedDayAtCapacity = selectedDayRemainingMinutes <= 0;
  const savedItemsForSelectedDay = items.filter((item: QueueItem) => item.date === selectedDateKey);

  function resolveDateForWeekday(weekday: string): string | undefined {
    return weekDays.find((day: QuestDay) => day.weekday === weekday)?.dateKey;
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadQueue();
    }, [])
  );

  // Any change to the pending quest invalidates a previously shown recovery-lock confirmation.
  useEffect(() => {
    setConflictMessage("");
    setRecoveryWarning("");
    setPendingRecoveryConfirm(false);
  }, [request, selectedKind, selectedDateKey, selectedTime, selectedDuration]);

  async function loadQueue() {
    const [saved, plan, checkIn, profileRaw, completedRaw, missedRaw] = await Promise.all([
      readJson<Partial<QueueItem>[]>(STORAGE_KEY, []),
      readJson<Record<string, unknown> | null>(DAY_PLAN_KEY, null),
      readJson<CheckIn | null>(CHECKIN_KEY, null),
      readJson<LocalProfile | null>(LOCAL_PROFILE_KEY, null),
      readJson<unknown>(COMPLETED_QUESTS_KEY, []),
      readJson<unknown>(MISSED_QUESTS_KEY, []),
    ]);
    const mappedItems = Array.isArray(saved) ? saved.map(normalizeQueueItem) : [];
    setItems(mappedItems);
    setDayPlan(plan);
    const mode: "Progress" | "Recovery" = checkIn?.mode === "Recovery" ? "Recovery" : "Progress";
    setBoardMode(mode);

    // On first open, default the start time to the first free slot for today so a new
    // quest doesn't collide with an existing item at the default time and silently fail.
    if (!hasInitializedTime.current) {
      hasInitializedTime.current = true;
      applyDefaultStartTime(todayInWeek.dateKey, mappedItems, plan);
    }

    const context: QuestProfileContext = {
      category: profileRaw?.dreamCategory?.trim() || "Purpose",
      specificGoal: profileRaw?.specificGoal?.trim() || "",
      progressMeaning: profileRaw?.progressMeaning?.trim() || "",
      shortTermBenchmark: profileRaw?.shortTermGoal?.trim() || profileRaw?.goalOne?.trim() || "",
      midTermBenchmark: profileRaw?.midTermGoal?.trim() || profileRaw?.goalTwo?.trim() || "",
      longTermBenchmark: profileRaw?.longTermGoal?.trim() || profileRaw?.goalThree?.trim() || "",
    };
    const completedTitles = new Set(parseCompletions(completedRaw).map((entry) => entry.title));
    const missedTitles = new Set(parseMissed(missedRaw).map((entry) => entry.title));
    const boardModeForSuggestions = mode === "Recovery" ? "recovery" : "progress";
    setSuggestedQuest(getActiveSuggestedQuest(context, boardModeForSuggestions, completedTitles, missedTitles));
    setSupplementaryQuest(
      generateSupplementaryQuest(profileRaw?.supplementaryCategory, boardModeForSuggestions, getQuestGoalAnchor(context))
    );
  }

  async function saveQueue(nextItems: QueueItem[]) {
    setItems(nextItems);
    await persistProgressKeys({ [STORAGE_KEY]: JSON.stringify(nextItems) });
  }

  /** Day Plan checklist/Today's Quest + every other saved Quest, as date-based items for conflict/recovery checks. */
  function existingScheduledItemsExcluding(excludeId: string): Partial<ScheduledQuestLike>[] {
    const dayPlanItems = collectDayPlanScheduledItems(dayPlan, resolveDateForWeekday);
    const questItems = items
      .filter((item) => item.id !== excludeId)
      .map((item) => ({ id: item.id, title: item.title, date: item.date, startTime: item.startTime, durationMinutes: item.durationMinutes }));
    return [...dayPlanItems, ...questItems];
  }

  /** First TIME_SLOT on `dateKey` that doesn't overlap an existing quest/Day Plan item, so a newly
   *  created quest doesn't silently collide with the default 9:00 AM slot (and fail to save). */
  function computeFreeStartTime(
    itemsList: QueueItem[],
    planArg: Record<string, unknown> | null,
    dateKey: string,
    durationMinutes: number,
    excludeId: string
  ): string {
    const dayPlanItems = collectDayPlanScheduledItems(planArg, resolveDateForWeekday);
    const questItems = itemsList
      .filter((item) => item.id !== excludeId)
      .map((item) => ({ id: item.id, title: item.title, date: item.date, startTime: item.startTime, durationMinutes: item.durationMinutes }));
    const existing = [...dayPlanItems, ...questItems];
    for (const slot of TIME_SLOTS) {
      const candidate = { id: "__probe__", date: dateKey, startTime: slot, durationMinutes };
      if (!findScheduleOverlap(candidate, existing, "__probe__")) return slot;
    }
    return TIME_SLOTS[0] ?? "9:00 AM";
  }

  function applyDefaultStartTime(dateKey: string, itemsList: QueueItem[], planArg: Record<string, unknown> | null) {
    const free = computeFreeStartTime(itemsList, planArg, dateKey, parseDurationMinutes(selectedDuration, 30), "");
    setSelectedTime(free);
    setTimeInputDraft(free);
  }

  async function saveQuest() {
    const trimmed = request.trim();
    if (!trimmed) {
      setMessage("Write the quest first, then choose when it should happen.");
      return;
    }
    if (selectedDayIsPast) {
      setMessage("Past days can’t be edited.");
      return;
    }

    const durationMinutes = parseDurationMinutes(selectedDuration, 30);
    const otherItems = editingId ? items.filter((item) => item.id !== editingId) : items;
    const capacity = checkUserScheduledQuestCapacity({
      dateKey: selectedDay.dateKey,
      weekday: selectedDay.weekday as WeekdayName,
      quickThoughts: otherItems,
      dayPlan,
      additionalMinutes: durationMinutes,
      boardMode,
    });

    if (!capacity.allowed) {
      const capLabel = formatPlannedDurationLabel(capacity.capacityMinutes);
      setMessage(
        `Quest Board limit reached for this day — your ${capacity.modeLabel} check-in allows up to ${capLabel} of planned quests (${formatPlannedDurationLabel(capacity.remainingMinutes)} left).`
      );
      return;
    }
    setMessage("");

    const candidateId = editingId ?? `quick-${Date.now()}`;
    const existing = existingScheduledItemsExcluding(editingId ?? "");
    const candidate = { id: candidateId, date: selectedDay.dateKey, startTime: selectedTime, durationMinutes };

    // Editing only the kind/title (same day/time/duration) must never be blocked by a
    // conflict or recovery check — otherwise the edit silently fails and nothing updates.
    const originalItem = editingId ? items.find((item) => item.id === editingId) : null;
    const scheduleUnchanged =
      !!originalItem &&
      originalItem.date === selectedDay.dateKey &&
      originalItem.startTime === selectedTime &&
      originalItem.durationMinutes === durationMinutes;

    if (!scheduleUnchanged) {
      const conflict = findScheduleOverlap(candidate, existing, candidateId);
      if (conflict) {
        const conflictTitle = (conflict as { title?: string }).title || "another scheduled item";
        setConflictMessage(`This time interferes with "${conflictTitle}" — change the time.`);
        setRecoveryWarning("");
        setPendingRecoveryConfirm(false);
        return;
      }
    }
    setConflictMessage("");

    if (!scheduleUnchanged && !pendingRecoveryConfirm && wouldTriggerRecoveryLock(candidate, existing, selectedDay.dateKey)) {
      setRecoveryWarning(RECOVERY_LOCK_WARNING);
      setPendingRecoveryConfirm(true);
      return;
    }
    setRecoveryWarning("");
    setPendingRecoveryConfirm(false);

    const steps = getStepsForItem(durationMinutes, selectedKind);

    if (editingId) {
      const nextItems = items.map((item) =>
        item.id === editingId
          ? {
              ...item,
              text: trimmed,
              title: trimmed,
              type: selectedKind === "recovery" ? "Recovery Quest" : "Progress Quest",
              classification: selectedKind,
              date: selectedDay.dateKey,
              weekday: selectedDay.weekday as WeekdayName,
              time: selectedTime,
              startTime: selectedTime,
              duration: selectedDuration,
              durationMinutes,
              steps,
            }
          : item
      );
      await saveQueue(nextItems);
      setMessage("Quest updated.");
      void trackEvent(ANALYTICS_EVENTS.quick_thought_saved, { id: editingId, kind: selectedKind, edited: true });
    } else {
      const nextItem: QueueItem = {
        id: candidateId,
        source: "quickThought",
        text: trimmed,
        title: trimmed,
        type: selectedKind === "recovery" ? "Recovery Quest" : "Progress Quest",
        classification: selectedKind,
        kind: "quickThought",
        date: selectedDay.dateKey,
        weekday: selectedDay.weekday as WeekdayName,
        time: selectedTime,
        startTime: selectedTime,
        duration: selectedDuration,
        durationMinutes,
        steps,
        status: "scheduled",
        createdAt: new Date().toISOString(),
      };
      const nextList = [nextItem, ...items];
      await saveQueue(nextList);
      setMessage(`Saved ${selectedKind} quest to Calendar.`);
      void trackEvent(ANALYTICS_EVENTS.quick_thought_saved, { id: nextItem.id, kind: selectedKind });
      // Advance the default time past the quest just added so the next new quest
      // lands on a free slot instead of colliding at the same time.
      applyDefaultStartTime(selectedDay.dateKey, nextList, dayPlan);
    }

    setRequest("");
    setEditingId(null);
    void syncQuickThoughtItems();
  }

  // A nap is a recovery quest that restores energy on completion (30 min = +5, 1 hr = +10).
  // It saves like any other quest — appears on Calendar + Home Quest Board, completed via the
  // timer flow. Saving does NOT restore energy; only completing it does.
  async function addNap(minutes: number) {
    if (selectedDayIsPast) {
      setMessage("Past days can’t be edited.");
      return;
    }
    const capacity = checkUserScheduledQuestCapacity({
      dateKey: selectedDay.dateKey,
      weekday: selectedDay.weekday as WeekdayName,
      quickThoughts: items,
      dayPlan,
      additionalMinutes: minutes,
      boardMode,
    });
    if (!capacity.allowed) {
      const capLabel = formatPlannedDurationLabel(capacity.capacityMinutes);
      setMessage(`Quest Board limit reached for this day — up to ${capLabel} of planned quests (${formatPlannedDurationLabel(capacity.remainingMinutes)} left).`);
      return;
    }
    const durationLabel = minutes >= 60 ? "1 hr" : `${minutes} min`;
    const startTime = computeFreeStartTime(items, dayPlan, selectedDay.dateKey, minutes, "");
    const napItem: QueueItem = {
      id: `nap-${Date.now()}`,
      source: "quickThought",
      text: `Nap (${durationLabel})`,
      title: `Nap (${durationLabel})`,
      type: "Nap",
      classification: "recovery",
      kind: "quickThought",
      date: selectedDay.dateKey,
      weekday: selectedDay.weekday as WeekdayName,
      time: startTime,
      startTime,
      duration: durationLabel,
      durationMinutes: minutes,
      steps: getStepsForItem(minutes, "recovery"),
      status: "scheduled",
      createdAt: new Date().toISOString(),
    };
    setConflictMessage("");
    setRecoveryWarning("");
    setPendingRecoveryConfirm(false);
    await saveQueue([napItem, ...items]);
    setMessage(`Saved nap to Calendar. ${formatEnergyDelta(getNapEnergyRestore(minutes))} when completed.`);
    void trackEvent(ANALYTICS_EVENTS.quick_thought_saved, { id: napItem.id, kind: "recovery" });
    void syncQuickThoughtItems();
  }

  function startEditItem(item: QueueItem) {
    setEditingId(item.id);
    setRequest(item.text);
    setSelectedKind(item.classification);
    setSelectedDateKey(item.date);
    setSelectedTime(item.startTime);
    setTimeInputDraft(item.startTime);
    setSelectedDuration(item.duration);
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setRequest("");
    setMessage("");
  }

  async function deleteItem(id: string) {
    await saveQueue(items.filter((item: QueueItem) => item.id !== id));
    setMessage("Quest deleted.");
    if (editingId === id) cancelEdit();
  }

  function commitTimeInput() {
    const parsed = parseTimeInput(timeInputDraft);
    if (parsed) {
      setSelectedTime(parsed);
      setTimeInputDraft(parsed);
      setTimeInputError("");
    } else {
      setTimeInputError("Try: 9 AM, 2:30 PM, or 14:00");
    }
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <View style={styles.heroPanel}>
              <View style={styles.bannerIcon}><Text style={styles.bannerIconText}>✦</Text></View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>QUEST SCHEDULER</Text>
                <Text style={styles.title}>QUESTS</Text>
                <Text style={styles.summary}>15 min earns +1 step, 30 min earns +2, 45 min earns +3, 1 hr earns +4. Quests are timed — start them from the Home Quest Board.</Text>
              </View>
            </View>

            <View style={styles.eviePanel}>
              <Image source={uiAssets.guides.evie} style={styles.evieAvatar} resizeMode="contain" />
              <View style={styles.evieCopy}>
                <Text style={styles.evieName}>EVIE</Text>
                <Text style={styles.evieText}>See what MYLIT suggests for direction, or create your own. Your check-in mode sets the daily cap — 8h in Progress, 5h in Recovery.</Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.appQuestPanel}>
              <Text style={styles.sectionTitle}>⏱️ APP QUESTS FOR YOUR PATH</Text>
              <Text style={styles.helperText}>
                For direction only — optional, not required in one day. Start and complete these from the Home Quest Board.
              </Text>
              {suggestedQuest ? (
                <View style={styles.appQuestCard}>
                  <Text style={styles.appQuestTitle}>{suggestedQuest.title}</Text>
                  <Text style={styles.appQuestMeta}>
                    {formatDurationLabel(suggestedQuest.durationMinutes ?? 30)} • +{suggestedQuest.steps} step{suggestedQuest.steps === 1 ? "" : "s"} • {boardMode}
                  </Text>
                </View>
              ) : (
                <Text style={styles.emptyPreviewText}>No app quest suggested right now — check Home after your next check-in.</Text>
              )}
              {supplementaryQuest ? (
                <View style={[styles.appQuestCard, styles.supplementaryQuestCard]}>
                  <Text style={styles.supplementaryQuestLabel}>SUPPLEMENTARY PATH</Text>
                  <Text style={styles.appQuestTitle}>{supplementaryQuest.title}</Text>
                  <Text style={styles.appQuestMeta}>
                    {formatDurationLabel(supplementaryQuest.durationMinutes ?? 15)} • +{supplementaryQuest.steps} step{supplementaryQuest.steps === 1 ? "" : "s"} • a smaller goal alongside your Main Path
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.creationPanel}>
              <View style={styles.rowBetween}>
                <Text style={styles.panelHeading}>{editingId ? "EDIT QUEST" : "CREATE A QUEST"}</Text>
                {editingId ? (
                  <TouchableOpacity onPress={cancelEdit}>
                    <Text style={styles.cancelEditText}>CANCEL</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.sectionTitle}>1. QUEST TITLE</Text>
              <TextInput style={styles.input} placeholder="Ex: Email professor tomorrow" placeholderTextColor="#94A3B8" value={request} onChangeText={(text: string) => { setRequest(text); setMessage(""); }} />

              <Text style={styles.sectionTitle}>2. PROGRESS OR RECOVERY?</Text>
              <View style={styles.kindSelectorRow}>
                <TouchableOpacity style={[styles.kindButton, styles.kindProgress, selectedKind === "progress" && styles.kindProgressActive]} onPress={() => setSelectedKind("progress")}><Text style={styles.kindButtonText}>PROGRESS</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.kindButton, styles.kindRecovery, selectedKind === "recovery" && styles.kindRecoveryActive]} onPress={() => setSelectedKind("recovery")}><Text style={styles.kindButtonText}>RECOVERY</Text></TouchableOpacity>
              </View>

              <Text style={styles.sectionTitle}>3. DAY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
                {weekDays.map((day: QuestDay) => {
                  const selected = day.dateKey === selectedDateKey;
                  const isPast = isPastDateKey(day.dateKey);
                  return (
                    <TouchableOpacity key={day.dateKey} style={[styles.dayButton, selected && !isPast && styles.dayButtonActive, isPast && styles.dayButtonDisabled]} disabled={isPast} onPress={() => { setSelectedDateKey(day.dateKey); setMessage(""); if (!editingId) applyDefaultStartTime(day.dateKey, items, dayPlan); }}>
                      <Text style={[styles.dayLabel, selected && styles.dayLabelActive, isPast && styles.dayTextDisabled]}>{day.label}</Text>
                      <Text style={[styles.dayNumber, selected && styles.dayLabelActive, isPast && styles.dayTextDisabled]}>{day.dayNumber}</Text>
                      {isPast ? <Text style={styles.pastDayLabel}>Past</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.sectionTitle}>4. START TIME</Text>
              <View style={styles.timeStepperRow}>
                <TouchableOpacity style={styles.timeStepButton} onPress={() => { const next = shiftTimeSlot(selectedTime, -1, TIME_SLOTS); setSelectedTime(next); setTimeInputDraft(next); }}><Text style={styles.timeStepText}>←</Text></TouchableOpacity>
                <TextInput
                  style={styles.timeInputEditable}
                  value={timeInputDraft}
                  onChangeText={(t) => { setTimeInputDraft(t); setTimeInputError(""); }}
                  onBlur={commitTimeInput}
                  onSubmitEditing={commitTimeInput}
                  returnKeyType="done"
                  placeholder="9:00 AM"
                  placeholderTextColor="#64748B"
                />
                <TouchableOpacity style={styles.timeStepButton} onPress={() => { const next = shiftTimeSlot(selectedTime, 1, TIME_SLOTS); setSelectedTime(next); setTimeInputDraft(next); }}><Text style={styles.timeStepText}>→</Text></TouchableOpacity>
              </View>
              {timeInputError ? <Text style={styles.timeInputError}>{timeInputError}</Text> : null}

              <Text style={styles.sectionTitle}>5. DURATION</Text>
              <View style={styles.durationRow}>
                {DURATIONS.map((duration) => (
                  <TouchableOpacity key={duration} style={[styles.durationButton, selectedDuration === duration && styles.durationButtonActive]} onPress={() => setSelectedDuration(duration)}>
                    <Text style={[styles.durationText, selectedDuration === duration && styles.optionTextActive]}>{duration}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.stepsPreview}>+{selectedSteps} step{selectedSteps === 1 ? "" : "s"}</Text>
                <Text style={styles.energyPreview}>{formatEnergyDelta(selectedEnergyDelta)}</Text>
              </View>

              {message ? <Text style={message.includes("deleted") || message.includes("Saved") || message.includes("updated") ? styles.statusMessage : styles.errorMessage}>{message}</Text> : null}
              {conflictMessage ? <Text style={styles.errorMessage}>{conflictMessage}</Text> : null}
              {recoveryWarning ? <Text style={styles.recoveryWarning}>{recoveryWarning}</Text> : null}
              <TouchableOpacity
                style={[styles.saveButton, (selectedDayIsPast || selectedDayAtCapacity || !request.trim()) && styles.saveButtonDisabled]}
                disabled={selectedDayIsPast || selectedDayAtCapacity || !request.trim()}
                onPress={saveQuest}
              >
                <Text style={styles.saveButtonText}>
                  {pendingRecoveryConfirm ? "CONFIRM & SAVE" : editingId ? "SAVE CHANGES" : "SAVE QUEST"} · +{selectedSteps} STEP{selectedSteps === 1 ? "" : "S"}
                </Text>
              </TouchableOpacity>

              {!editingId ? (
                <View style={styles.napPanel}>
                  <Text style={styles.napTitle}>😴 ADD NAP TIME</Text>
                  <Text style={styles.napHelper}>A nap is a recovery quest. It restores energy when you complete it — not when you save it.</Text>
                  <View style={styles.napRow}>
                    <TouchableOpacity
                      style={[styles.napButton, (selectedDayIsPast || selectedDayAtCapacity) && styles.saveButtonDisabled]}
                      disabled={selectedDayIsPast || selectedDayAtCapacity}
                      onPress={() => void addNap(30)}
                    >
                      <Text style={styles.napButtonText}>30 min nap</Text>
                      <Text style={styles.napButtonEnergy}>Energy: +5</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.napButton, (selectedDayIsPast || selectedDayAtCapacity) && styles.saveButtonDisabled]}
                      disabled={selectedDayIsPast || selectedDayAtCapacity}
                      onPress={() => void addNap(60)}
                    >
                      <Text style={styles.napButtonText}>1 hr nap</Text>
                      <Text style={styles.napButtonEnergy}>Energy: +10</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.savedHeaderRow}>
              <Text style={styles.savedTitle}>🎒 SAVED QUESTS</Text>
              <Text style={styles.savedCount}>
                {formatPlannedDurationLabel(selectedDayRemainingMinutes)} left · {boardMode} ({boardMode === "Recovery" ? "5h" : "8h"} limit)
              </Text>
            </View>

            {savedItemsForSelectedDay.length === 0 ? (
              <View style={styles.emptyCard}><Text style={styles.emptyIcon}>🪶</Text><Text style={styles.emptyText}>No quests saved for {selectedDay.label} yet. Add one and it will appear on your calendar.</Text></View>
            ) : (
              savedItemsForSelectedDay.map((item: QueueItem) => {
                const isCompleted = Boolean(item.completedAt);
                const isMissed = isPastDateKey(item.date) && !isCompleted;
                const statusLabel = isCompleted ? "✓ COMPLETED" : isMissed ? "MISSED" : "SCHEDULED";
                return (
                  <View key={item.id} style={[styles.queueCard, item.classification === "recovery" ? styles.queueRecovery : styles.queueProgress, isCompleted && styles.queueCompleted, editingId === item.id && styles.queueEditing]}>
                    <View style={styles.queueTopRow}>
                      <Text style={styles.statusPill}>{statusLabel}</Text>
                      <Text style={styles.questLabel}>+{item.steps} STEP{item.steps === 1 ? "" : "S"}</Text>
                      <View style={styles.queueActions}>
                        {!isCompleted ? (
                          <TouchableOpacity style={styles.editButton} onPress={() => startEditItem(item)}><Text style={styles.editButtonText}>✎</Text></TouchableOpacity>
                        ) : null}
                        <TouchableOpacity style={styles.deleteButton} onPress={() => deleteItem(item.id)}><Text style={styles.deleteButtonText}>🗑</Text></TouchableOpacity>
                      </View>
                    </View>
                    <Text style={[styles.queueTitle, isCompleted && styles.queueTitleDone]}>{item.title}</Text>
                    <Text style={styles.queueDetail}>{formatSavedDate(item)} • {item.startTime} • {item.duration} • {item.classification}</Text>
                    <Text style={styles.queueEnergy}>{formatEnergyDelta(getEnergyDelta({ kind: item.classification, durationMinutes: item.durationMinutes, title: item.title }))}</Text>
                    {isMissed ? (
                      <TouchableOpacity style={styles.reflectButton} onPress={() => router.push("/reflection")}>
                        <Text style={styles.reflectButtonText}>REFLECT ON THIS</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })
            )}

            <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/calendar")}><Text style={styles.homeButtonText}>← Back to Calendar</Text></TouchableOpacity>
          </FormScreen>
          <BottomNav activeRoute="calendar" bottomOffset={mobile.bottomNavOffset} />
          {showInfo ? <InfoOverlay onClose={() => setShowInfo(false)} /> : null}
        </View>
      </View>
    </View>
  );
}

function InfoOverlay({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.infoOverlay}>
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>QUESTS</Text>
        <ScrollView style={styles.infoScroll} showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={styles.infoBody}>
            App Quests are suggested by MYLIT based on your path — optional, for direction, not required in one day. Create your own Quest for anything you want to schedule for a future day; it can appear on Home and Calendar when it&apos;s time. Quests are timed — start and complete them from the Home Quest Board, not here. Saving a quest does not give steps; completing it does. Use the pencil to edit a saved quest instead of deleting and recreating it.
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
  worldOverlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.55)" },
  screenScroller: { flex: 1 },
  hudContent: { flexGrow: 1, width: "100%", paddingTop: 18, paddingHorizontal: 14 },
  heroPanel: { backgroundColor: "rgba(5, 12, 24, 0.9)", borderWidth: 3, borderColor: "#D99B2B", borderRadius: 8, padding: 13, marginBottom: 12, flexDirection: "row", alignItems: "center" },
  bannerIcon: { width: 46, height: 66, backgroundColor: "rgba(70, 28, 112, 0.86)", borderWidth: 2, borderColor: "#FDE047", alignItems: "center", justifyContent: "center", marginRight: 12 },
  bannerIconText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 26, fontWeight: "900" },
  heroCopy: { flex: 1 },
  heroKicker: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 },
  title: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 27, fontWeight: "900", letterSpacing: 1, lineHeight: 32 },
  summary: { color: "#F8E7A1", fontFamily: pixelFont, fontSize: 12, fontWeight: "800", lineHeight: 17, marginTop: 5 },
  appQuestPanel: { backgroundColor: "rgba(8, 13, 24, 0.95)", borderRadius: 8, padding: 12, marginBottom: 14, borderWidth: 3, borderColor: "#FBBF24" },
  helperText: { color: "#CBD5E1", fontSize: 12, lineHeight: 17, fontWeight: "700", marginBottom: 8 },
  appQuestCard: { borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(30, 41, 59, 0.88)", borderRadius: 6, padding: 10 },
  appQuestTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", marginBottom: 4 },
  appQuestMeta: { color: "#FBBF24", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  supplementaryQuestCard: { marginTop: 8, borderColor: "#86EFAC" },
  supplementaryQuestLabel: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginBottom: 4 },
  emptyPreviewText: { color: "#94A3B8", fontSize: 12, lineHeight: 17, fontWeight: "700", fontStyle: "italic" },
  creationPanel: { backgroundColor: "rgba(8, 13, 24, 0.95)", borderRadius: 8, padding: 12, marginBottom: 14, borderWidth: 3, borderColor: "#334155" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  panelHeading: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  cancelEditText: { color: "#FCA5A5", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  sectionTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 0.5, lineHeight: 17, marginTop: 10, marginBottom: 8 },
  input: { backgroundColor: "rgba(2, 6, 23, 0.95)", borderRadius: 5, padding: 13, fontSize: 15, color: "#F9FAFB", borderWidth: 2, borderColor: "#475569", fontWeight: "800" },
  kindSelectorRow: { flexDirection: "row", gap: 10 },
  kindButton: { flex: 1, borderWidth: 2, paddingVertical: 11, alignItems: "center" },
  kindProgress: { borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.35)" },
  kindRecovery: { borderColor: "#A78BFA", backgroundColor: "rgba(88,28,135,0.35)" },
  kindProgressActive: { backgroundColor: "rgba(113,63,18,0.9)" },
  kindRecoveryActive: { backgroundColor: "rgba(88,28,135,0.9)" },
  kindButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  dayStrip: { gap: 8, paddingBottom: 8 },
  dayButton: { width: 58, backgroundColor: "rgba(15,23,42,0.92)", borderWidth: 2, borderColor: "#334155", borderRadius: 8, alignItems: "center", paddingVertical: 8 },
  dayButtonActive: { borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.7)" },
  dayButtonDisabled: { opacity: 0.45 },
  dayLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  dayNumber: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 18, fontWeight: "900", marginTop: 3 },
  dayLabelActive: { color: "#FDE68A" },
  dayTextDisabled: { color: "#64748B" },
  pastDayLabel: { color: "#94A3B8", fontSize: 8, marginTop: 2 },
  timeStepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  timeStepButton: { width: 44, height: 38, borderWidth: 2, borderColor: "#FBBF24", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(69,43,8,0.6)" },
  timeStepText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" },
  timeInputEditable: { flex: 1, color: "#F8FAFC", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", textAlign: "center", borderBottomWidth: 1, borderBottomColor: "#475569", paddingVertical: 4 },
  timeInputError: { color: "#FCA5A5", fontFamily: pixelFont, fontSize: 10, textAlign: "center", marginTop: 4 },
  timeValue: { minWidth: 140, color: "#F8FAFC", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", textAlign: "center" },
  durationRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  durationButton: { borderWidth: 2, borderColor: "#334155", paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "rgba(30, 41, 59, 0.88)" },
  durationButtonActive: { borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.65)" },
  durationText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  optionTextActive: { color: "#FDE68A" },
  stepsPreview: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  energyPreview: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  napPanel: { marginTop: 14, borderTopWidth: 2, borderTopColor: "#334155", paddingTop: 12 },
  napTitle: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 0.5, marginBottom: 6 },
  napHelper: { color: "#CBD5E1", fontSize: 11, lineHeight: 16, fontWeight: "700", marginBottom: 10 },
  napRow: { flexDirection: "row", gap: 10 },
  napButton: { flex: 1, borderWidth: 2, borderColor: "#A78BFA", backgroundColor: "rgba(88,28,135,0.45)", borderRadius: 6, paddingVertical: 11, alignItems: "center" },
  napButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  napButtonEnergy: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 3 },
  queueEnergy: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 4 },
  statusMessage: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 12, textAlign: "center", marginTop: 10, fontWeight: "900" },
  errorMessage: { color: "#FCA5A5", fontFamily: pixelFont, fontSize: 12, textAlign: "center", marginTop: 10, fontWeight: "900" },
  saveButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 13, alignItems: "center", marginTop: 12 },
  saveButtonDisabled: { opacity: 0.45 },
  saveButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  recoveryWarning: { color: "#FDBA74", fontFamily: pixelFont, fontSize: 12, textAlign: "center", marginTop: 10, fontWeight: "800", lineHeight: 17 },
  savedHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  savedTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  savedCount: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  emptyCard: { borderWidth: 2, borderColor: "#334155", backgroundColor: "rgba(8,13,24,0.9)", padding: 14, alignItems: "center", marginBottom: 12 },
  emptyIcon: { fontSize: 26 },
  emptyText: { color: "#CBD5E1", fontSize: 13, lineHeight: 19, textAlign: "center" },
  queueCard: { backgroundColor: "rgba(8,13,24,0.95)", borderWidth: 2, borderRadius: 8, padding: 12, marginBottom: 10 },
  queueProgress: { borderColor: "#FBBF24" },
  queueRecovery: { borderColor: "#A78BFA" },
  queueEditing: { borderColor: "#FBBF24", borderWidth: 3 },
  queueTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  questLabel: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  statusPill: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  queueActions: { flexDirection: "row", gap: 6 },
  editButton: { width: 34, height: 30, borderWidth: 1, borderColor: "#FBBF24", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(69, 43, 8, 0.55)" },
  editButtonText: { fontSize: 15 },
  deleteButton: { width: 34, height: 30, borderWidth: 1, borderColor: "#FCA5A5", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(127,29,29,0.45)" },
  deleteButtonText: { fontSize: 15 },
  queueTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", marginBottom: 5 },
  queueDetail: { color: "#CBD5E1", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  homeButton: { borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.6)", paddingVertical: 13, alignItems: "center", marginTop: 4 },
  homeButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  eviePanel: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(8,13,24,0.95)", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, padding: 10, marginBottom: 12 },
  evieAvatar: { width: 44, height: 52, marginRight: 10 },
  evieCopy: { flex: 1 },
  evieName: { color: "#FDE047", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  evieText: { color: "#CBD5E1", fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  infoBtn: { width: 28, height: 28, borderWidth: 2, borderColor: "#FBBF24", borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(113,63,18,0.7)", marginLeft: 8 },
  infoBtnText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  queueCompleted: { opacity: 0.65 },
  queueTitleDone: { textDecorationLine: "line-through", color: "#86EFAC" },
  reflectButton: { borderWidth: 1, borderColor: "#A78BFA", paddingVertical: 7, paddingHorizontal: 12, backgroundColor: "rgba(88,28,135,0.45)", marginTop: 8, alignSelf: "flex-start" },
  reflectButtonText: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
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