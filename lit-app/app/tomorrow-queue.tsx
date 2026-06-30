import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { formatDurationLabel, generateTimeSlots, getDateKey, getQuickThoughtSteps, inferScheduledClassification, parseDurationMinutes, shiftTimeSlot, type ScheduledClassification, type ScheduledStatus } from "../lib/scheduling";

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
};

type QuestDay = { date: Date; dateKey: string; weekday: string; label: string; dayNumber: number };

const STORAGE_KEY = "lit_tomorrow_queue";
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;
const DAILY_QUEST_LIMIT = 3;
const TIME_SLOTS = generateTimeSlots(7, 22, 30);
const DURATIONS = ["30 min", "45 min", "1 hr"];
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

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
    steps: raw.steps ?? getQuickThoughtSteps(durationMinutes),
    status: raw.status || "scheduled",
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function formatSavedDate(item: QueueItem) {
  const [, month, day] = item.date.split("-");
  return `${item.weekday} ${Number(month)}/${Number(day)}`;
}

export default function TomorrowQueueScreen() {
  const router = useRouter();
  const weekDays = useMemo(() => generateCurrentWeek(), []);
  const todayInWeek = weekDays.find((day: QuestDay) => day.dateKey === getDateKey()) || weekDays[0];
  const [request, setRequest] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState(todayInWeek.dateKey);
  const [selectedTime, setSelectedTime] = useState("9:00 AM");
  const [selectedDuration, setSelectedDuration] = useState("30 min");
  const [selectedKind, setSelectedKind] = useState<QuestKind>("progress");
  const [message, setMessage] = useState("");

  const selectedDay = weekDays.find((day: QuestDay) => day.dateKey === selectedDateKey) || todayInWeek;
  const selectedDayIsPast = isPastDateKey(selectedDay.dateKey);
  const selectedDayQuestCount = items.filter((item: QueueItem) => item.date === selectedDateKey).length;
  const selectedSteps = getQuickThoughtSteps(selectedDuration);

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    const saved = await readJson<Partial<QueueItem>[]>(STORAGE_KEY, []);
    setItems(Array.isArray(saved) ? saved.map(normalizeQueueItem) : []);
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
    if (selectedDayQuestCount >= DAILY_QUEST_LIMIT) {
      setMessage("You can only save 3 Quick Thought quests for this day.");
      return;
    }

    const durationMinutes = parseDurationMinutes(selectedDuration, 30);
    const nextItem: QueueItem = {
      id: `quick-${Date.now()}`,
      source: "quickThought",
      text: trimmed,
      title: trimmed,
      type: selectedKind === "recovery" ? "Recovery Quest" : "Progress Quest",
      classification: selectedKind,
      kind: "quickThought",
      date: selectedDay.dateKey,
      weekday: selectedDay.weekday,
      time: selectedTime,
      startTime: selectedTime,
      duration: selectedDuration,
      durationMinutes,
      steps: getQuickThoughtSteps(durationMinutes),
      status: "scheduled",
      createdAt: new Date().toISOString(),
    };

    await saveQueue([nextItem, ...items]);
    setRequest("");
    setMessage(`Saved ${selectedKind} quest to Calendar.`);
  }

  async function deleteItem(id: string) {
    await saveQueue(items.filter((item: QueueItem) => item.id !== id));
    setMessage("Quest deleted.");
  }

  return (
    <View style={styles.pageRoot}>
      <View style={styles.phoneStage}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.default} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView style={styles.screenScroller} contentContainerStyle={styles.hudContent} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.heroPanel}>
              <View style={styles.bannerIcon}><Text style={styles.bannerIconText}>✦</Text></View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>QUEST SCHEDULER</Text>
                <Text style={styles.title}>QUICK THOUGHTS</Text>
                <Text style={styles.summary}>Schedule a future quest. 30–45 min earns +1 step, 1 hr earns +2 steps.</Text>
              </View>
            </View>

            <View style={styles.creationPanel}>
              <Text style={styles.sectionTitle}>1. QUEST TITLE</Text>
              <TextInput style={styles.input} placeholder="Example: finish coding app at coffee shop" placeholderTextColor="#94A3B8" value={request} onChangeText={(text: string) => { setRequest(text); setMessage(""); }} />

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
                    <TouchableOpacity key={day.dateKey} style={[styles.dayButton, selected && !isPast && styles.dayButtonActive, isPast && styles.dayButtonDisabled]} disabled={isPast} onPress={() => { setSelectedDateKey(day.dateKey); setMessage(""); }}>
                      <Text style={[styles.dayLabel, selected && styles.dayLabelActive, isPast && styles.dayTextDisabled]}>{day.label}</Text>
                      <Text style={[styles.dayNumber, selected && styles.dayLabelActive, isPast && styles.dayTextDisabled]}>{day.dayNumber}</Text>
                      {isPast ? <Text style={styles.pastDayLabel}>Past</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.sectionTitle}>4. START TIME</Text>
              <View style={styles.timeStepperRow}>
                <TouchableOpacity style={styles.timeStepButton} onPress={() => setSelectedTime((current: string) => shiftTimeSlot(current, -1, TIME_SLOTS))}><Text style={styles.timeStepText}>←</Text></TouchableOpacity>
                <Text style={styles.timeValue}>{selectedTime}</Text>
                <TouchableOpacity style={styles.timeStepButton} onPress={() => setSelectedTime((current: string) => shiftTimeSlot(current, 1, TIME_SLOTS))}><Text style={styles.timeStepText}>→</Text></TouchableOpacity>
              </View>

              <Text style={styles.sectionTitle}>5. DURATION</Text>
              <View style={styles.durationRow}>
                {DURATIONS.map((duration) => (
                  <TouchableOpacity key={duration} style={[styles.durationButton, selectedDuration === duration && styles.durationButtonActive]} onPress={() => setSelectedDuration(duration)}>
                    <Text style={[styles.durationText, selectedDuration === duration && styles.optionTextActive]}>{duration}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.stepsPreview}>+{selectedSteps} step{selectedSteps === 1 ? "" : "s"}</Text>
              </View>

              {message ? <Text style={message.includes("deleted") || message.includes("Saved") ? styles.statusMessage : styles.errorMessage}>{message}</Text> : null}
              <TouchableOpacity style={[styles.saveButton, (selectedDayQuestCount >= DAILY_QUEST_LIMIT || selectedDayIsPast) && styles.saveButtonDisabled]} onPress={addToQueue}>
                <Text style={styles.saveButtonText}>SAVE +{selectedSteps} STEP{selectedSteps === 1 ? "" : "S"} QUEST</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.savedHeaderRow}>
              <Text style={styles.savedTitle}>🎒 SAVED QUESTS</Text>
              <Text style={styles.savedCount}>{selectedDayQuestCount}/{DAILY_QUEST_LIMIT} selected day</Text>
            </View>

            {items.length === 0 ? (
              <View style={styles.emptyCard}><Text style={styles.emptyIcon}>🪶</Text><Text style={styles.emptyText}>No quick thought quests saved yet. Add one and it will appear on your calendar.</Text></View>
            ) : (
              items.map((item: QueueItem) => (
                <View key={item.id} style={[styles.queueCard, item.classification === "recovery" ? styles.queueRecovery : styles.queueProgress]}>
                  <View style={styles.queueTopRow}>
                    <Text style={styles.questLabel}>+{item.steps} STEP{item.steps === 1 ? "" : "S"}</Text>
                    <TouchableOpacity style={styles.deleteButton} onPress={() => deleteItem(item.id)}><Text style={styles.deleteButtonText}>🗑</Text></TouchableOpacity>
                  </View>
                  <Text style={styles.queueTitle}>{item.title}</Text>
                  <Text style={styles.queueDetail}>{formatSavedDate(item)} • {item.startTime} • {item.duration} • {item.classification}</Text>
                </View>
              ))
            )}

            <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/calendar")}><Text style={styles.homeButtonText}>← Back to Calendar</Text></TouchableOpacity>
          </ScrollView>
          <BottomNav router={router} />
        </View>
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
  worldOverlay: { flex: 1, backgroundColor: "rgba(2, 6, 12, 0.55)" },
  screenScroller: { flex: 1 },
  hudContent: { minHeight: "100%", paddingTop: 18, paddingHorizontal: 14, paddingBottom: 104 },
  heroPanel: { backgroundColor: "rgba(5, 12, 24, 0.9)", borderWidth: 3, borderColor: "#D99B2B", borderRadius: 8, padding: 13, marginBottom: 12, flexDirection: "row", alignItems: "center" },
  bannerIcon: { width: 46, height: 66, backgroundColor: "rgba(70, 28, 112, 0.86)", borderWidth: 2, borderColor: "#FDE047", alignItems: "center", justifyContent: "center", marginRight: 12 },
  bannerIconText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 26, fontWeight: "900" },
  heroCopy: { flex: 1 },
  heroKicker: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 },
  title: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 27, fontWeight: "900", letterSpacing: 1, lineHeight: 32 },
  summary: { color: "#F8E7A1", fontFamily: pixelFont, fontSize: 12, fontWeight: "800", lineHeight: 17, marginTop: 5 },
  creationPanel: { backgroundColor: "rgba(8, 13, 24, 0.95)", borderRadius: 8, padding: 12, marginBottom: 14, borderWidth: 3, borderColor: "#334155" },
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
  timeValue: { minWidth: 140, color: "#F8FAFC", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", textAlign: "center" },
  durationRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  durationButton: { borderWidth: 2, borderColor: "#334155", paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "rgba(2,6,23,0.8)" },
  durationButtonActive: { borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.65)" },
  durationText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  optionTextActive: { color: "#FDE68A" },
  stepsPreview: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  statusMessage: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 12, textAlign: "center", marginTop: 10, fontWeight: "900" },
  errorMessage: { color: "#FCA5A5", fontFamily: pixelFont, fontSize: 12, textAlign: "center", marginTop: 10, fontWeight: "900" },
  saveButton: { backgroundColor: "#14532D", borderWidth: 2, borderColor: "#22C55E", paddingVertical: 13, alignItems: "center", marginTop: 12 },
  saveButtonDisabled: { opacity: 0.45 },
  saveButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  savedHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  savedTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  savedCount: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  emptyCard: { borderWidth: 2, borderColor: "#334155", backgroundColor: "rgba(8,13,24,0.9)", padding: 14, alignItems: "center", marginBottom: 12 },
  emptyIcon: { fontSize: 26 },
  emptyText: { color: "#CBD5E1", fontSize: 13, lineHeight: 19, textAlign: "center" },
  queueCard: { backgroundColor: "rgba(8,13,24,0.95)", borderWidth: 2, borderRadius: 8, padding: 12, marginBottom: 10 },
  queueProgress: { borderColor: "#FBBF24" },
  queueRecovery: { borderColor: "#A78BFA" },
  queueTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  questLabel: { color: "#86EFAC", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  deleteButton: { width: 34, height: 30, borderWidth: 1, borderColor: "#FCA5A5", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(127,29,29,0.45)" },
  deleteButtonText: { fontSize: 15 },
  queueTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", marginBottom: 5 },
  queueDetail: { color: "#CBD5E1", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  homeButton: { borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.6)", paddingVertical: 13, alignItems: "center", marginTop: 4 },
  homeButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  bottomNav: { position: "absolute", bottom: 8, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(8,17,34,0.96)", borderWidth: 2, borderColor: "#334155", borderRadius: 16, padding: 6 },
  navButton: { flex: 1, alignItems: "center", borderRadius: 12, paddingVertical: 6, borderWidth: 1, borderColor: "transparent" },
  navButtonActive: { backgroundColor: "rgba(120, 53, 15, 0.55)", borderColor: "#FBBF24" },
  navIcon: { fontSize: 20 },
  navLabel: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", marginTop: 2 },
  navLabelActive: { color: "#FBBF24" },
});