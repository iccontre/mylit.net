import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { collectDayPlanScheduledItems, collectQuickThoughtScheduledItems, findScheduleOverlap, formatDurationLabel, getDateKey, parseDurationMinutes, requiresRecoveryBeforeNewProgress, type ScheduledKind } from "../lib/scheduling";

type WeekdayName = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
  steps: number;
  startTime: string;
  duration: string;
  durationMinutes: number;
  status?: "scheduled" | "active" | "completed" | "expired" | "needsReflection" | "recoveryRequired";
  kind: ScheduledKind;
};

type QueueItem = {
  id?: string;
  text?: string;
  title?: string;
  task?: string;
  note?: string;
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

type DayPlan = {
  todayGoal?: string;
  Monday?: string;
  Tuesday?: string;
  Wednesday?: string;
  Thursday?: string;
  Friday?: string;
  Saturday?: string;
  Sunday?: string;
  weekdayRoles?: Partial<Record<WeekdayName, string>>;
  weekdayChecklists?: Partial<Record<WeekdayName, ChecklistItem[]>>;
};

const DAY_PLAN_KEY = "lit_day_plan";
const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const CHECKIN_KEY = "lit_latest_checkin";
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;

const weekdays: WeekdayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const dayIcons: Record<WeekdayName, string> = {
  Monday: "⚔️",
  Tuesday: "📖",
  Wednesday: "🏋️",
  Thursday: "💻",
  Friday: "👥",
  Saturday: "⛰️",
  Sunday: "💚",
};

const defaultRoles: Record<WeekdayName, string> = {
  Monday: "Focus",
  Tuesday: "School",
  Wednesday: "Gym",
  Thursday: "Coding",
  Friday: "Social",
  Saturday: "Adventure",
  Sunday: "Recovery",
};

const defaultChecklistText = ["Coding session", "Gym", "Read", "Water plants", "Journaling", "Meal prep"];
const checklistTimeSlots = ["7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM"];
const checklistDurations = ["30 min", "45 min", "1 hr"];

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function getWeekdayName(): WeekdayName {
  const days: WeekdayName[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date().getDay()] as WeekdayName;
}

function createChecklist(day: WeekdayName, saved?: ChecklistItem[]) {
  if (Array.isArray(saved) && saved.length > 0) {
    return saved.map((item, index) => {
      const itemText = item.text || defaultChecklistText[index] || "Habit action";

      return {
        id: item.id || `${day}-${index}`,
        text: itemText,
        checked: Boolean(item.checked),
        steps: 1,
        startTime: item.startTime || checklistTimeSlots[index % checklistTimeSlots.length],
        duration: item.duration || formatDurationLabel(item.durationMinutes || 30),
        durationMinutes: item.durationMinutes || parseDurationMinutes(item.duration, 30),
        status: item.status || (item.checked ? "completed" : "scheduled"),
        kind: item.kind || (itemText.toLowerCase().match(/eat|meal|relax|rest|nap|social|walk|journal|stretch|shower|break/) ? "recovery" : "progress"),
      };
    });
  }

  return defaultChecklistText.map((text, index) => ({
    id: `${day}-${index}`,
    text,
    checked: index < 2,
    steps: 1,
    startTime: checklistTimeSlots[index % checklistTimeSlots.length],
    duration: "30 min",
    durationMinutes: 30,
    status: index < 2 ? ("completed" as const) : ("scheduled" as const),
    kind: text.toLowerCase().match(/eat|meal|relax|rest|nap|social|walk|journal|stretch|shower|break/) ? ("recovery" as const) : ("progress" as const),
  }));
}

function createDefaultPlan(): DayPlan {
  return {
    todayGoal: "",
    Monday: defaultRoles.Monday,
    Tuesday: defaultRoles.Tuesday,
    Wednesday: defaultRoles.Wednesday,
    Thursday: defaultRoles.Thursday,
    Friday: defaultRoles.Friday,
    Saturday: defaultRoles.Saturday,
    Sunday: defaultRoles.Sunday,
    weekdayRoles: { ...defaultRoles },
    weekdayChecklists: weekdays.reduce((acc, day) => ({ ...acc, [day]: createChecklist(day) }), {} as Record<WeekdayName, ChecklistItem[]>),
  };
}

function normalizePlan(parsed: Partial<DayPlan>): DayPlan {
  const roles = weekdays.reduce((acc, day) => {
    acc[day] = parsed.weekdayRoles?.[day] || parsed[day] || defaultRoles[day];
    return acc;
  }, {} as Record<WeekdayName, string>);

  const checklists = weekdays.reduce((acc, day) => {
    acc[day] = createChecklist(day, parsed.weekdayChecklists?.[day]);
    return acc;
  }, {} as Record<WeekdayName, ChecklistItem[]>);

  return {
    todayGoal: parsed.todayGoal || "",
    Monday: roles.Monday,
    Tuesday: roles.Tuesday,
    Wednesday: roles.Wednesday,
    Thursday: roles.Thursday,
    Friday: roles.Friday,
    Saturday: roles.Saturday,
    Sunday: roles.Sunday,
    weekdayRoles: roles,
    weekdayChecklists: checklists,
  };
}

function getDayRole(dayPlan: DayPlan, day: WeekdayName) {
  return dayPlan.weekdayRoles?.[day]?.trim() || dayPlan[day]?.trim() || defaultRoles[day];
}

function getDayChecklist(dayPlan: DayPlan, day: WeekdayName) {
  return dayPlan.weekdayChecklists?.[day] || createChecklist(day);
}

export default function DayPlanScreen() {
  const router = useRouter();
  const todayName = getWeekdayName();
  const [dayPlan, setDayPlan] = useState<DayPlan>(() => createDefaultPlan());
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLowEnergy, setIsLowEnergy] = useState(false);
  const [selectedDay, setSelectedDay] = useState<WeekdayName>(todayName);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    loadDayPlan();
    loadQuickThoughts();
    loadLatestCheckIn();
  }, []);

  async function loadDayPlan() {
    const saved = await AsyncStorage.getItem(DAY_PLAN_KEY);
    if (!saved) return;

    try {
      setDayPlan(normalizePlan(JSON.parse(saved)));
    } catch {
      // Keep defaults if saved data cannot be parsed.
    }
  }


  async function loadQuickThoughts() {
    const saved = await AsyncStorage.getItem(TOMORROW_QUEUE_KEY);
    if (!saved) {
      setQueueItems([]);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      setQueueItems(Array.isArray(parsed) ? parsed : []);
    } catch {
      setQueueItems([]);
    }
  }


  async function loadLatestCheckIn() {
    const saved = await AsyncStorage.getItem(CHECKIN_KEY);
    if (!saved) {
      setIsLowEnergy(false);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      setIsLowEnergy(parsed?.mode === "Recovery" || Number(parsed?.energy) <= 60);
    } catch {
      setIsLowEnergy(false);
    }
  }

  function updateTodayGoal(value: string) {
    setSavedMessage("");
    setDayPlan((current) => ({ ...current, todayGoal: value }));
  }

  function updateSelectedRole(value: string) {
    setSavedMessage("");
    setDayPlan((current) => ({
      ...current,
      [selectedDay]: value,
      weekdayRoles: {
        ...(current.weekdayRoles || {}),
        [selectedDay]: value,
      },
    }));
  }

  function updateChecklistItem(id: string, changes: Partial<ChecklistItem>) {
    setSavedMessage("");
    setDayPlan((current) => {
      const checklist = getDayChecklist(current, selectedDay).map((item) => (item.id === id ? { ...item, ...changes } : item));
      return {
        ...current,
        weekdayChecklists: {
          ...(current.weekdayChecklists || {}),
          [selectedDay]: checklist,
        },
      };
    });
  }

  function addChecklistItem() {
    setSavedMessage("");
    setDayPlan((current) => {
      const checklist = getDayChecklist(current, selectedDay);
      const nextItem: ChecklistItem = {
        id: `${selectedDay}-${Date.now()}`,
        text: "New habit action",
        checked: false,
        steps: 1,
        startTime: checklistTimeSlots[0],
        duration: "30 min",
        durationMinutes: 30,
        status: "scheduled",
        kind: "progress",
      };

      return {
        ...current,
        weekdayChecklists: {
          ...(current.weekdayChecklists || {}),
          [selectedDay]: [...checklist, nextItem],
        },
      };
    });
  }

  function removeChecklistItem(id: string) {
    setSavedMessage("");
    setDayPlan((current) => {
      const checklist = getDayChecklist(current, selectedDay).filter((item) => item.id !== id);
      return {
        ...current,
        weekdayChecklists: {
          ...(current.weekdayChecklists || {}),
          [selectedDay]: checklist.length ? checklist : createChecklist(selectedDay).slice(0, 1),
        },
      };
    });
  }


  function cycleChecklistTime(item: ChecklistItem, direction: 1 | -1) {
    const currentIndex = Math.max(0, checklistTimeSlots.indexOf(item.startTime));
    const nextIndex = (currentIndex + direction + checklistTimeSlots.length) % checklistTimeSlots.length;
    updateChecklistItem(item.id, { startTime: checklistTimeSlots[nextIndex] });
  }

  function cycleChecklistDuration(item: ChecklistItem) {
    const currentIndex = Math.max(0, checklistDurations.indexOf(item.duration));
    const nextDuration = checklistDurations[(currentIndex + 1) % checklistDurations.length];
    updateChecklistItem(item.id, { duration: nextDuration, durationMinutes: parseDurationMinutes(nextDuration), steps: 1 });
  }

  function toggleChecklistKind(item: ChecklistItem) {
    updateChecklistItem(item.id, { kind: item.kind === "recovery" ? "progress" : "recovery" });
  }

  function getSelectedDayDateKey(day: WeekdayName) {
    const today = new Date();
    const targetIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(day);
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() + ((targetIndex - today.getDay() + 7) % 7));
    return getDateKey(date);
  }

  function findDayPlanOverlap(plan: DayPlan) {
    const scheduledDayPlanItems = collectDayPlanScheduledItems(plan, (weekday: WeekdayName) => getSelectedDayDateKey(weekday as WeekdayName))
    const scheduledQuickThoughts = collectQuickThoughtScheduledItems(queueItems);

    for (const item of scheduledDayPlanItems) {
      const overlap = findScheduleOverlap(item, [...scheduledQuickThoughts, ...scheduledDayPlanItems], item.id);
      if (overlap) return { item, overlap };
    }

    return null;
  }

  function findDayPlanRecoveryViolation(plan: DayPlan) {
    const scheduledDayPlanItems = collectDayPlanScheduledItems(plan, (weekday: WeekdayName) => getSelectedDayDateKey(weekday as WeekdayName))
    const scheduledQuickThoughts = collectQuickThoughtScheduledItems(queueItems);
    const allScheduledItems = [...scheduledQuickThoughts, ...scheduledDayPlanItems];

    for (const item of scheduledDayPlanItems) {
      if (requiresRecoveryBeforeNewProgress(item, allScheduledItems)) return item;
    }

    return null;
  }

  function todayHasRecoveryItem(plan: DayPlan) {
    return getDayChecklist(plan, todayName).some((item) => item.kind === "recovery" && item.text.trim());
  }

  async function saveDayPlan() {
    const normalized = normalizePlan(dayPlan);
    const overlap = findDayPlanOverlap(normalized);
    if (overlap) {
      setSavedMessage("This habit overlaps another scheduled item. Choose another time.");
      return;
    }

    if (isLowEnergy && !todayHasRecoveryItem(normalized)) {
      setSavedMessage("Low energy today — add one recovery item before stacking more progress.");
      return;
    }

    if (findDayPlanRecoveryViolation(normalized)) {
      setSavedMessage("Add a 1-hour recovery item before scheduling more progress.");
      return;
    }

    await AsyncStorage.setItem(DAY_PLAN_KEY, JSON.stringify(normalized));
    setDayPlan(normalized);
    setSavedMessage("Saved. Weekly roles and habits can now appear in Calendar.");
  }

  const selectedRole = getDayRole(dayPlan, selectedDay);
  const selectedChecklist = getDayChecklist(dayPlan, selectedDay);
  const checkedCount = selectedChecklist.filter((item) => item.checked).length;
  const todayGoal = dayPlan.todayGoal?.trim() || "";
  const todayRole = getDayRole(dayPlan, todayName);
  const todayQuest = todayGoal || todayRole;

  const previewChecklist = useMemo(() => selectedChecklist.filter((item) => item.text.trim()).slice(0, 4), [selectedChecklist]);

  return (
    <View style={styles.pageRoot}>
      <View style={styles.phoneStage}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.default} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView style={styles.screenScroller} contentContainerStyle={styles.hudContent} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.heroPanel}>
              <View style={styles.heroShield}>
                <Text style={styles.heroShieldIcon}>🛡️</Text>
              </View>
              <View style={styles.heroTextBox}>
                <Text style={styles.heroLabel}>DAY BOARD</Text>
                <Text style={styles.title}>DAY PLAN</Text>
                <Text style={styles.subtitle}>Give each day a role — coding day, gym day, social day, study day, or reset day — so habits repeat with less friction.</Text>
              </View>
              <Text style={styles.heroCrystal}>✦</Text>
            </View>

            <View style={styles.focusPanel}>
              <View style={styles.focusInputSide}>
                <Text style={styles.sectionTitle}>◎ TODAY’S FOCUS</Text>
                <Text style={styles.label}>What do you want to get done today?</Text>
                <TextInput
                  style={styles.input}
                  value={dayPlan.todayGoal || ""}
                  onChangeText={updateTodayGoal}
                  placeholder="Example: finish coding task, catch up on homework, clean my room"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={styles.todayQuestBox}>
                <Text style={styles.todayQuestLabel}>TODAY’S QUEST</Text>
                <Text style={styles.todayQuestText} numberOfLines={3}>{todayQuest || "Not set yet"}</Text>
                <Text style={styles.todayQuestSteps}>+2 STEPS</Text>
              </View>
            </View>

            <View style={styles.weekPanel}>
              <View style={styles.panelHeaderRow}>
                <Text style={styles.sectionTitle}>🗓️ WEEKLY HABIT ROLES</Text>
                <Text style={styles.microNote}>Tap a day to edit.</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekdayStrip}>
                {weekdays.map((day) => {
                  const selected = day === selectedDay;
                  const role = getDayRole(dayPlan, day);
                  return (
                    <TouchableOpacity key={day} style={[styles.dayCard, selected && styles.dayCardActive]} onPress={() => setSelectedDay(day)}>
                      <Text style={[styles.dayAbbrev, selected && styles.dayAbbrevActive]}>{day.slice(0, 3).toUpperCase()}</Text>
                      <View style={[styles.dayIconBadge, selected && styles.dayIconBadgeActive]}><Text style={styles.dayIcon}>{dayIcons[day]}</Text></View>
                      <Text style={[styles.dayRole, selected && styles.dayRoleActive]} numberOfLines={1}>{role || defaultRoles[day]}</Text>
                      {selected ? <View style={styles.dayPointer} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.editorPanel}>
              <View style={styles.editorMainColumn}>
                <Text style={styles.editingTitle}>🪶 EDITING: {selectedDay.toUpperCase()}</Text>
                <Text style={styles.label}>DAY THEME / TITLE</Text>
                <TextInput
                  style={styles.input}
                  value={selectedRole}
                  onChangeText={updateSelectedRole}
                  placeholder="Example: Coding Day"
                  placeholderTextColor="#94A3B8"
                />

                <View style={styles.checklistHeaderRow}>
                  <Text style={styles.label}>HABIT CHECKLIST</Text>
                  <TouchableOpacity style={styles.smallAddButton} onPress={addChecklistItem}>
                    <Text style={styles.smallAddButtonText}>+ ADD</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.ruleText}>Each checked action = +1 step. Recovery items reset your 2-hour progress streak.</Text>
                {isLowEnergy ? <Text style={styles.recoveryNote}>Low energy today — include at least one recovery item for {todayName}.</Text> : null}

                <View style={styles.checklistBox}>
                  {selectedChecklist.map((item) => (
                    <View key={item.id} style={styles.checklistRow}>
                      <TouchableOpacity
                        style={[styles.checkbox, item.checked && styles.checkboxChecked]}
                        onPress={() => updateChecklistItem(item.id, { checked: !item.checked, status: !item.checked ? "completed" : "scheduled" })}
                      >
                        <Text style={styles.checkboxMark}>{item.checked ? "✓" : ""}</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.checklistInput}
                        value={item.text}
                        onChangeText={(value) => updateChecklistItem(item.id, { text: value })}
                        placeholder="Habit action"
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        style={[styles.kindTag, item.kind === "recovery" ? styles.kindTagRecovery : styles.kindTagProgress]}
                        onPress={() => toggleChecklistKind(item)}
                      >
                        <Text style={styles.kindTagText}>{item.kind === "recovery" ? "Recovery" : "Progress"}</Text>
                      </TouchableOpacity>
                      <View style={styles.scheduleMiniControls}>
                        <TouchableOpacity style={styles.scheduleMiniButton} onPress={() => cycleChecklistTime(item, -1)}><Text style={styles.scheduleMiniText}>‹</Text></TouchableOpacity>
                        <Text style={styles.scheduleMiniValue}>{item.startTime}</Text>
                        <TouchableOpacity style={styles.scheduleMiniButton} onPress={() => cycleChecklistTime(item, 1)}><Text style={styles.scheduleMiniText}>›</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.durationMiniButton} onPress={() => cycleChecklistDuration(item)}><Text style={styles.durationMiniText}>{item.duration}</Text></TouchableOpacity>
                      </View>
                      <Text style={styles.plusOne}>+1 ✦</Text>
                      <TouchableOpacity style={styles.removeButton} onPress={() => removeChecklistItem(item.id)}>
                        <Text style={styles.removeButtonText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                <Text style={styles.statsNote}>ⓘ Checked habits are saved for future Stats tracking.</Text>
              </View>

              <View style={styles.previewColumn}>
                <View style={styles.stepRuleCard}>
                  <Text style={styles.ruleCardIcon}>🧙</Text>
                  <Text style={styles.ruleCardText}>Checked habits earn <Text style={styles.greenText}>+1 step</Text> each.</Text>
                </View>

                <View style={styles.calendarPreviewCard}>
                  <Text style={styles.calendarPreviewTitle}>CALENDAR VIEW</Text>
                  <Text style={styles.calendarPreviewDay}>{selectedDay.slice(0, 3).toUpperCase()} • {selectedRole || "Day Role"}</Text>
                  {previewChecklist.map((item) => (
                    <View key={item.id} style={styles.previewHabitRow}>
                      <Text style={styles.previewCheck}>{item.checked ? "☑" : "☐"}</Text>
                      <Text style={styles.previewHabitText} numberOfLines={1}>{item.startTime} • {item.kind === "recovery" ? "Recovery" : "Progress"} • {item.text || "Habit action"}</Text>
                      <Text style={styles.previewPlus}>+1</Text>
                    </View>
                  ))}
                  <View style={styles.previewDivider} />
                  <Text style={styles.previewTotal}>+{checkedCount} steps total</Text>
                  <Text style={styles.previewNote}>Your day theme and checklist appear in Calendar.</Text>
                </View>
              </View>
            </View>

            {savedMessage ? <Text style={styles.savedMessage}>{savedMessage}</Text> : null}

            <TouchableOpacity style={styles.saveButton} onPress={saveDayPlan}>
              <Text style={styles.saveButtonText}>⚔️ SAVE WEEKLY ROLES</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/calendar")}>
              <Text style={styles.backButtonText}>← BACK TO CALENDAR</Text>
            </TouchableOpacity>
          </ScrollView>

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
    backgroundColor: "rgba(4, 8, 16, 0.48)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 112,
  },
  heroPanel: {
    backgroundColor: "rgba(7, 14, 28, 0.94)",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  heroShield: {
    width: 58,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(21, 94, 56, 0.72)",
    borderWidth: 2,
    borderColor: "#FBBF24",
    marginRight: 12,
  },
  heroShieldIcon: {
    fontSize: 34,
  },
  heroTextBox: {
    flex: 1,
  },
  heroLabel: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
    lineHeight: 33,
  },
  subtitle: {
    color: "#F8E7A1",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 4,
  },
  heroCrystal: {
    fontSize: 24,
    marginLeft: 8,
  },
  focusPanel: {
    backgroundColor: "rgba(9, 17, 32, 0.95)",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    gap: 10,
  },
  focusInputSide: {
    flex: 1.35,
  },
  sectionTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.6,
    lineHeight: 18,
    marginBottom: 8,
  },
  label: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "rgba(6, 12, 24, 0.96)",
    borderWidth: 2,
    borderColor: "#94A3B8",
    borderRadius: 5,
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "800",
    paddingVertical: 10,
    paddingHorizontal: 11,
    marginBottom: 8,
  },
  todayQuestBox: {
    flex: 1,
    backgroundColor: "rgba(6, 78, 59, 0.9)",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 6,
    padding: 10,
    justifyContent: "center",
  },
  todayQuestLabel: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  todayQuestText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  todayQuestSteps: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 7,
  },
  weekPanel: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 2,
    borderColor: "#D99B2B",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  panelHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  microNote: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
  },
  weekdayStrip: {
    gap: 8,
    paddingBottom: 5,
  },
  dayCard: {
    width: 74,
    minHeight: 88,
    backgroundColor: "rgba(15, 23, 42, 0.97)",
    borderWidth: 2,
    borderColor: "#64748B",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    padding: 7,
    position: "relative",
  },
  dayCardActive: {
    borderColor: "#FDE047",
    backgroundColor: "rgba(67, 56, 202, 0.96)",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  dayAbbrev: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
  },
  dayAbbrevActive: {
    color: "#FDE047",
  },
  dayIconBadge: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 6, 23, 0.55)",
    marginBottom: 5,
  },
  dayIconBadgeActive: {
    borderColor: "#FDE047",
    backgroundColor: "rgba(91, 33, 182, 0.55)",
  },
  dayIcon: {
    fontSize: 18,
  },
  dayRole: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  dayRoleActive: {
    color: "#FFFFFF",
  },
  dayPointer: {
    position: "absolute",
    bottom: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FDE047",
  },
  editorPanel: {
    backgroundColor: "rgba(9, 17, 32, 0.96)",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    gap: 12,
  },
  editorMainColumn: {
    flex: 1.55,
  },
  previewColumn: {
    flex: 0.95,
    gap: 10,
  },
  editingTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  checklistHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  smallAddButton: {
    borderWidth: 2,
    borderColor: "#22C55E",
    backgroundColor: "rgba(20, 83, 45, 0.85)",
    borderRadius: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  smallAddButtonText: {
    color: "#DCFCE7",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
  },
  recoveryNote: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 15,
    marginBottom: 8,
  },
  ruleText: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 7,
  },
  checklistBox: {
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 8,
  },
  checklistRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.86)",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingHorizontal: 7,
    gap: 5,
  },
  checkbox: {
    width: 25,
    height: 25,
    borderWidth: 2,
    borderColor: "#64748B",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: "#86EFAC",
    backgroundColor: "rgba(22, 101, 52, 0.9)",
  },
  checkboxMark: {
    color: "#BBF7D0",
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
  },
  checklistInput: {
    flex: 1,
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    paddingVertical: 7,
  },

  kindTag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 5,
    minWidth: 68,
    alignItems: "center",
  },
  kindTagProgress: {
    borderColor: "#FDE047",
    backgroundColor: "rgba(113, 63, 18, 0.75)",
  },
  kindTagRecovery: {
    borderColor: "#A78BFA",
    backgroundColor: "rgba(76, 29, 149, 0.75)",
  },
  kindTagText: {
    color: "#FFFFFF",
    fontFamily: pixelFont,
    fontSize: 8,
    fontWeight: "900",
  },
  scheduleMiniControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  scheduleMiniButton: {
    width: 20,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#7C3AED",
    borderRadius: 3,
    backgroundColor: "rgba(49, 46, 129, 0.8)",
  },
  scheduleMiniText: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  scheduleMiniValue: {
    color: "#F8E7A1",
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "900",
    minWidth: 48,
    textAlign: "center",
  },
  durationMiniButton: {
    borderWidth: 1,
    borderColor: "#FDE047",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 3,
    backgroundColor: "rgba(20, 83, 45, 0.75)",
  },
  durationMiniText: {
    color: "#DCFCE7",
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "900",
  },
  plusOne: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
  },
  removeButton: {
    width: 22,
    height: 22,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(127, 29, 29, 0.75)",
  },
  removeButtonText: {
    color: "#FEE2E2",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
  },
  statsNote: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  stepRuleCard: {
    backgroundColor: "rgba(19, 30, 48, 0.94)",
    borderWidth: 2,
    borderColor: "#B7791F",
    borderRadius: 5,
    padding: 9,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  ruleCardIcon: {
    fontSize: 24,
  },
  ruleCardText: {
    flex: 1,
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  greenText: {
    color: "#86EFAC",
    fontWeight: "900",
  },
  calendarPreviewCard: {
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderWidth: 2,
    borderColor: "#7C4A17",
    borderRadius: 5,
    padding: 10,
  },
  calendarPreviewTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },
  calendarPreviewDay: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 8,
  },
  previewHabitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 5,
  },
  previewCheck: {
    color: "#86EFAC",
    fontSize: 12,
  },
  previewHabitText: {
    flex: 1,
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
  },
  previewPlus: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
  },
  previewDivider: {
    height: 1,
    backgroundColor: "#334155",
    marginVertical: 6,
  },
  previewTotal: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 6,
  },
  previewNote: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 15,
  },
  savedMessage: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 9,
  },
  saveButton: {
    backgroundColor: "#15803D",
    borderWidth: 3,
    borderColor: "#FDE047",
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 9,
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  backButton: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 2,
    borderColor: "#64748B",
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: "center",
  },
  backButtonText: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
  },
  bottomNav: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(8, 13, 24, 0.96)",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 6,
    padding: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navButton: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 4,
    marginHorizontal: 2,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
  },
  navButtonActive: {
    backgroundColor: "rgba(20, 83, 45, 0.85)",
    borderColor: "#FDE047",
  },
  navIcon: {
    fontSize: 17,
    marginBottom: 2,
  },
  navLabel: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "900",
  },
  navLabelActive: {
    color: "#FDE047",
  },
});