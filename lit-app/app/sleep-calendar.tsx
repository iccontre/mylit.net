import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { uiAssets } from "../constants/uiAssets";

type CheckIn = {
  wakeTime?: string;
  estimatedSleepWindow?: string;
  caffeineCutoffSuggestion?: string;
  mealCutoffSuggestion?: string;
  windDownGoal?: string;
  energy?: number;
  mode?: "Recovery" | "Progress";
  createdAt?: string;
};

type QueueItem = {
  text?: string;
  title?: string;
  task?: string;
  note?: string;
};

type DayPlan = {
  Monday: string;
  Tuesday: string;
  Wednesday: string;
  Thursday: string;
  Friday: string;
  Saturday: string;
  Sunday: string;
};

type ModeState = "Recovery" | "Progress" | "Neutral";

const CHECKIN_KEY = "lit_latest_checkin";
const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
const DAY_PLAN_KEY = "lit_day_plan";
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;

const DAY_ORDER: Array<keyof DayPlan> = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function getTodayLabel(): keyof DayPlan {
  const map: Array<keyof DayPlan> = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[new Date().getDay()];
}

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export default function SleepCalendarScreen() {
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [thoughts, setThoughts] = useState<QueueItem[]>([]);
  const [currentMode, setCurrentMode] = useState<ModeState>("Neutral");
  const [dayPlan, setDayPlan] = useState<DayPlan>({
    Monday: "",
    Tuesday: "",
    Wednesday: "",
    Thursday: "",
    Friday: "",
    Saturday: "",
    Sunday: "",
  });

  const safeViewportWidth = Math.max(0, viewportWidth - 24);
  const safeViewportHeight = Math.max(0, viewportHeight - 24);
  const frameWidth = Math.min(MAX_FRAME_WIDTH, safeViewportWidth, safeViewportHeight * APP_FRAME_ASPECT_RATIO);
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

  const isProgress = currentMode === "Progress";
  const isRecovery = currentMode === "Recovery";
  const currentBackground = isRecovery
    ? uiAssets.backgrounds.recovery
    : isProgress
      ? uiAssets.backgrounds.progress
      : uiAssets.backgrounds.neutral;
  const theme = isProgress
    ? { accent: "#FBBF24", glow: "#FEF3C7", panel: "rgba(18, 16, 12, 0.94)", soft: "#FDE68A" }
    : { accent: "#C4A7FF", glow: "#E9D5FF", panel: "rgba(18, 16, 34, 0.94)", soft: "#DDD6FE" };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const [checkinSaved, thoughtsSaved, dayPlanSaved] = await Promise.all([
      AsyncStorage.getItem(CHECKIN_KEY),
      AsyncStorage.getItem(TOMORROW_QUEUE_KEY),
      AsyncStorage.getItem(DAY_PLAN_KEY),
    ]);

    if (checkinSaved) {
      try {
        const parsed = JSON.parse(checkinSaved) as CheckIn;
        const checkInDay = parsed.createdAt ? new Date(parsed.createdAt).toLocaleDateString("en-CA") : null;
        setLatestCheckIn(parsed);
        setCurrentMode((parsed.mode === "Recovery" || parsed.mode === "Progress") && checkInDay === getTodayKey() ? parsed.mode : "Neutral");
      } catch {
        setLatestCheckIn(null);
        setCurrentMode("Neutral");
      }
    } else {
      setLatestCheckIn(null);
      setCurrentMode("Neutral");
    }

    if (thoughtsSaved) {
      try {
        const parsed = JSON.parse(thoughtsSaved);
        setThoughts(Array.isArray(parsed) ? parsed : []);
      } catch {
        setThoughts([]);
      }
    } else {
      setThoughts([]);
    }

    if (dayPlanSaved) {
      try {
        const parsed = JSON.parse(dayPlanSaved);
        setDayPlan({
          Monday: parsed.Monday || "",
          Tuesday: parsed.Tuesday || "",
          Wednesday: parsed.Wednesday || "",
          Thursday: parsed.Thursday || "",
          Friday: parsed.Friday || "",
          Saturday: parsed.Saturday || "",
          Sunday: parsed.Sunday || "",
        });
      } catch {
        setDayPlan({ Monday: "", Tuesday: "", Wednesday: "", Thursday: "", Friday: "", Saturday: "", Sunday: "" });
      }
    }
  }

  const today = useMemo(() => getTodayLabel(), []);
  const todayRole = dayPlan[today];

  return (
    <View style={styles.pageRoot}>
      <View style={[styles.phoneStage, { width: frameWidth, height: frameHeight, borderColor: theme.accent }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={currentBackground} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView style={styles.screenScroller} contentContainerStyle={styles.hudContent} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={[styles.headerCard, { borderColor: theme.accent, backgroundColor: theme.panel }]}>
              <Text style={[styles.kicker, { color: theme.glow }]}>SLEEP PLANNER</Text>
              <Text style={styles.title}>SLEEP CALENDAR</Text>
              <Text style={[styles.subtitle, { color: theme.soft }]}>Plan food, caffeine, wind-down, and tomorrow’s signals.</Text>
            </View>

            <View style={[styles.panel, { borderColor: theme.accent }]}>
              <Text style={[styles.panelTitle, { color: theme.glow }]}>TODAY’S SLEEP GUIDE</Text>
              {!latestCheckIn ? (
                <Text style={styles.itemText}>Complete a Morning Check-In to generate today’s sleep guide.</Text>
              ) : (
                <>
                  <Text style={styles.itemText}>Caffeine cutoff guide: {latestCheckIn.caffeineCutoffSuggestion || "No guide yet"}</Text>
                  <Text style={styles.itemText}>Meal cutoff guide: {latestCheckIn.mealCutoffSuggestion || "No guide yet"}</Text>
                  <Text style={styles.itemText}>Wind-down goal: {latestCheckIn.windDownGoal || "No goal set yet"}</Text>
                  <Text style={styles.itemText}>Estimated sleep window: {latestCheckIn.estimatedSleepWindow || "No window yet"}</Text>
                </>
              )}
            </View>

            <View style={[styles.panel, { borderColor: theme.accent }]}>
              <Text style={[styles.panelTitle, { color: theme.glow }]}>TOMORROW’S QUICK THOUGHTS</Text>
              <Text style={styles.smallInfo}>These are already saved for your next planning session.</Text>
              {thoughts.length === 0 ? (
                <Text style={styles.itemText}>No Quick Thoughts saved yet.</Text>
              ) : (
                thoughts.map((item, index) => {
                  const text = item.text || item.title || item.task || item.note || "";
                  return <Text key={index} style={styles.itemText}>Quick thought: {text}</Text>;
                })
              )}
            </View>

            <View style={[styles.panel, { borderColor: theme.accent }]}>
              <Text style={[styles.panelTitle, { color: theme.glow }]}>TODAY’S DAY PLAN</Text>
              {todayRole ? <Text style={styles.itemText}>Today is: {todayRole}</Text> : <Text style={styles.itemText}>No role set for today yet.</Text>}
            </View>

            <View style={[styles.panel, { borderColor: theme.accent }]}>
              <Text style={[styles.panelTitle, { color: theme.glow }]}>WEEKLY DAY ROLES</Text>
              {DAY_ORDER.map((day) => (
                <Text key={day} style={styles.itemText}>{day}: {dayPlan[day] || "No role set"}</Text>
              ))}
            </View>

            <TouchableOpacity style={[styles.primaryBtn, { borderColor: theme.accent }]} onPress={() => router.push("/day-plan")}>
              <Text style={styles.primaryBtnText}>Edit Day Plan</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push("/")}>
              <Text style={styles.secondaryBtnText}>Back to Today</Text>
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
    alignSelf: "center",
    backgroundColor: "#050814",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
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
    backgroundColor: "rgba(2, 6, 12, 0.14)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  headerCard: {
    borderWidth: 4,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  kicker: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 5,
    lineHeight: 19,
  },
  panel: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderWidth: 3,
    borderRadius: 6,
    padding: 13,
    marginBottom: 10,
  },
  panelTitle: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  itemText: {
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 18,
  },
  smallInfo: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  primaryBtn: {
    backgroundColor: "#312E81",
    borderWidth: 3,
    borderRadius: 4,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontFamily: pixelFont,
    fontWeight: "900",
    fontSize: 13,
    textTransform: "uppercase",
  },
  secondaryBtn: {
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderColor: "#334155",
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontWeight: "900",
    fontSize: 13,
  },
});