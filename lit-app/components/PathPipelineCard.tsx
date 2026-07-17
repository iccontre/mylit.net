import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { loadUserLifeProfile, loadLearningMemory, buildStatsInsightSnapshot } from "../lib/mylitAgents";
import { generatePathPipelineFromLifeProfile, saveWeeklyHabitSuggestion, saveDailyQuestSuggestion } from "../lib/pathPipeline";
import { LATEST_CHECKIN_KEY } from "../lib/storageKeys";
import type { PathPipeline, DailyQuestSuggestion } from "../lib/agentTypes";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

/**
 * Evie's Path Pipeline: dream/goal -> 3-month direction -> 1-month milestone -> 2-week
 * sprint -> weekly habit -> daily quests -> reflection loop. Purely deterministic template
 * logic over the user's own Life Profile text (see lib/pathPipeline.ts) — no AI call.
 * Nothing here auto-saves anything; every Save button is an explicit user action.
 */
export function PathPipelineCard() {
  const router = useRouter();
  const [pipeline, setPipeline] = useState<PathPipeline | null>(null);
  const [boardMode, setBoardMode] = useState<"Progress" | "Recovery">("Progress");
  const [habitStatus, setHabitStatus] = useState<string>("");
  const [questStatus, setQuestStatus] = useState<Record<string, string>>({});

  const loadPipeline = useCallback(async () => {
    const [profile, memory, insights, checkInRaw] = await Promise.all([
      loadUserLifeProfile(),
      loadLearningMemory(),
      buildStatsInsightSnapshot(),
      AsyncStorage.getItem(LATEST_CHECKIN_KEY),
    ]);
    setPipeline(generatePathPipelineFromLifeProfile(profile, memory, insights));
    try {
      const checkIn = checkInRaw ? JSON.parse(checkInRaw) : null;
      setBoardMode(checkIn?.mode === "Recovery" ? "Recovery" : "Progress");
    } catch {
      setBoardMode("Progress");
    }
    setHabitStatus("");
    setQuestStatus({});
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPipeline();
    }, [loadPipeline])
  );

  if (!pipeline) return null;

  if (!pipeline.dreamGoal) {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>✦ GUIDE SUGGESTIONS</Text>
        <Text style={styles.emptyText}>
          Tell Evie what you're building toward in your Life Profile, and she'll turn it into a 3-month direction, a
          2-week sprint, and daily quests you can actually keep up with.
        </Text>
        <TouchableOpacity style={styles.editButton} onPress={() => router.push("/life-profile")}>
          <Text style={styles.editButtonText}>✎ SET YOUR LIFE PROFILE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function handleSaveHabit() {
    if (!pipeline?.weeklyHabit) return;
    const result = await saveWeeklyHabitSuggestion(pipeline.weeklyHabit);
    if (result.savedDays.length && result.skippedDays.length) {
      setHabitStatus(`Saved to ${result.savedDays.join(", ")} — ${result.skippedDays.join(", ")} already had a role set.`);
    } else if (result.savedDays.length) {
      setHabitStatus(`Saved to ${result.savedDays.join(", ")}.`);
    } else {
      setHabitStatus("Those days already have a Weekly Habit set — edit them in Day Plan.");
    }
  }

  async function handleSaveQuest(quest: DailyQuestSuggestion) {
    const result = await saveDailyQuestSuggestion(quest, boardMode);
    setQuestStatus((prev) => ({ ...prev, [quest.id]: result.ok ? "Saved to today's Quest Board." : result.reason ?? "Could not save." }));
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={[styles.panelTitle, styles.panelTitleInRow]}>✦ GUIDE SUGGESTIONS</Text>
        <TouchableOpacity style={styles.regenButton} onPress={() => void loadPipeline()}>
          <Text style={styles.regenButtonText}>↻</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.row, { borderLeftColor: "#FBBF24" }]}>
        <Text style={[styles.rowLabel, { color: "#92610A" }]}>3-MONTH DIRECTION</Text>
        <Text style={styles.rowText}>{pipeline.threeMonth?.headline}</Text>
        {pipeline.threeMonth?.focusAreas.map((line, index) => (
          <Text key={index} style={styles.rowSubText}>· {line}</Text>
        ))}
      </View>

      <View style={[styles.row, { borderLeftColor: "#38BDF8" }]}>
        <Text style={[styles.rowLabel, { color: "#0369A1" }]}>1-MONTH MILESTONE</Text>
        <Text style={styles.rowText}>{pipeline.oneMonth?.headline}</Text>
        <Text style={styles.rowSubText}>· {pipeline.oneMonth?.concreteStep}</Text>
      </View>

      <View style={[styles.row, { borderLeftColor: "#22C55E" }]}>
        <Text style={[styles.rowLabel, { color: "#166534" }]}>2-WEEK SPRINT</Text>
        <Text style={styles.rowText}>{pipeline.twoWeek?.headline}</Text>
        <Text style={styles.rowSubText}>· {pipeline.twoWeek?.focus}</Text>
      </View>

      {pipeline.weeklyHabit ? (
        <View style={[styles.row, { borderLeftColor: "#A78BFA" }]}>
          <Text style={[styles.rowLabel, { color: "#5B21B6" }]}>SUGGESTED WEEKLY HABIT</Text>
          <Text style={styles.rowText}>{pipeline.weeklyHabit.title}</Text>
          <Text style={styles.rowSubText}>
            · {pipeline.weeklyHabit.suggestedDays.join(", ")} · {pipeline.weeklyHabit.durationMinutes} min
          </Text>
          {pipeline.weeklyHabit.rationale ? <Text style={styles.rowSubText}>· {pipeline.weeklyHabit.rationale}</Text> : null}
          <TouchableOpacity style={styles.saveButton} onPress={() => void handleSaveHabit()}>
            <Text style={styles.saveButtonText}>SAVE WEEKLY HABIT</Text>
          </TouchableOpacity>
          {habitStatus ? <Text style={styles.statusText}>{habitStatus}</Text> : null}
        </View>
      ) : null}

      {pipeline.dailyQuests.length ? (
        <View style={[styles.row, { borderLeftColor: "#F472B6" }]}>
          <Text style={[styles.rowLabel, { color: "#9D174D" }]}>SUGGESTED DAILY QUESTS</Text>
          {pipeline.dailyQuests.map((quest) => (
            <View key={quest.id} style={styles.questItem}>
              <Text style={styles.rowText}>{quest.title}</Text>
              <Text style={styles.rowSubText}>
                · {quest.category} · {quest.durationMinutes} min · {quest.kind === "recovery" ? "Recovery" : "Progress"}
              </Text>
              <TouchableOpacity style={styles.saveButtonSmall} onPress={() => void handleSaveQuest(quest)}>
                <Text style={styles.saveButtonText}>SAVE TO TODAY'S QUESTS</Text>
              </TouchableOpacity>
              {questStatus[quest.id] ? <Text style={styles.statusText}>{questStatus[quest.id]}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {pipeline.reflectionPrompt ? (
        <View style={[styles.row, { borderLeftColor: "#475569" }]}>
          <Text style={[styles.rowLabel, { color: "#5C4425" }]}>REFLECTION PROMPT</Text>
          <Text style={styles.rowText}>{pipeline.reflectionPrompt.prompt}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#3E2A1A",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#5C4425",
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  panelTitle: {
    color: "#4ADE80",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 10,
  },
  panelTitleInRow: { flex: 1, marginBottom: 0 },
  regenButton: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2A1D12",
  },
  regenButtonText: { color: "#D8C9A3", fontSize: 16, fontWeight: "900" },
  emptyText: { color: "#D8C9A3", fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  row: {
    borderWidth: 2,
    borderColor: "#5C4425",
    borderLeftWidth: 6,
    borderRadius: 6,
    padding: 9,
    marginBottom: 8,
    backgroundColor: "#F4E8CE",
  },
  rowLabel: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  rowText: { color: "#4A3620", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  rowSubText: { color: "#7C5B2B", fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 4 },
  questItem: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#5C4425" },
  saveButton: {
    marginTop: 8,
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "#1B6A39",
  },
  saveButtonSmall: {
    marginTop: 6,
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#1B6A39",
  },
  saveButtonText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  statusText: { color: "#FDE68A", fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 5 },
  editButton: {
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#1B6A39",
  },
  editButtonText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
});
