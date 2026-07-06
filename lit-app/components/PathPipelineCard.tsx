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
        <Text style={styles.panelTitle}>✦ EVIE'S PATH PIPELINE</Text>
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
        <Text style={[styles.panelTitle, styles.panelTitleInRow]}>✦ EVIE'S PATH PIPELINE</Text>
        <TouchableOpacity style={styles.regenButton} onPress={() => void loadPipeline()}>
          <Text style={styles.regenButtonText}>↻</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.row, { borderColor: "#FBBF24" }]}>
        <Text style={[styles.rowLabel, { color: "#FDE68A" }]}>3-MONTH DIRECTION</Text>
        <Text style={styles.rowText}>{pipeline.threeMonth?.headline}</Text>
        {pipeline.threeMonth?.focusAreas.map((line, index) => (
          <Text key={index} style={styles.rowSubText}>· {line}</Text>
        ))}
      </View>

      <View style={[styles.row, { borderColor: "#38BDF8" }]}>
        <Text style={[styles.rowLabel, { color: "#BAE6FD" }]}>1-MONTH MILESTONE</Text>
        <Text style={styles.rowText}>{pipeline.oneMonth?.headline}</Text>
        <Text style={styles.rowSubText}>· {pipeline.oneMonth?.concreteStep}</Text>
      </View>

      <View style={[styles.row, { borderColor: "#22C55E" }]}>
        <Text style={[styles.rowLabel, { color: "#86EFAC" }]}>2-WEEK SPRINT</Text>
        <Text style={styles.rowText}>{pipeline.twoWeek?.headline}</Text>
        <Text style={styles.rowSubText}>· {pipeline.twoWeek?.focus}</Text>
      </View>

      {pipeline.weeklyHabit ? (
        <View style={[styles.row, { borderColor: "#A78BFA" }]}>
          <Text style={[styles.rowLabel, { color: "#E9D5FF" }]}>SUGGESTED WEEKLY HABIT</Text>
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
        <View style={[styles.row, { borderColor: "#F472B6" }]}>
          <Text style={[styles.rowLabel, { color: "#FBCFE8" }]}>SUGGESTED DAILY QUESTS</Text>
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
        <View style={[styles.row, { borderColor: "#475569" }]}>
          <Text style={[styles.rowLabel, { color: "#CBD5E1" }]}>REFLECTION PROMPT</Text>
          <Text style={styles.rowText}>{pipeline.reflectionPrompt.prompt}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#334155",
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  panelTitle: {
    color: "#FDE047",
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
    borderColor: "#334155",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.9)",
  },
  regenButtonText: { color: "#CBD5E1", fontSize: 16, fontWeight: "900" },
  emptyText: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  row: {
    borderWidth: 2,
    borderRadius: 6,
    padding: 9,
    marginBottom: 8,
    backgroundColor: "rgba(15,23,42,0.7)",
  },
  rowLabel: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  rowText: { color: "#F1F5F9", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  rowSubText: { color: "#94A3B8", fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 4 },
  questItem: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#334155" },
  saveButton: {
    marginTop: 8,
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "rgba(88,28,135,0.35)",
  },
  saveButtonSmall: {
    marginTop: 6,
    borderWidth: 2,
    borderColor: "#F472B6",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "rgba(131,24,67,0.35)",
  },
  saveButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  statusText: { color: "#FDE68A", fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 5 },
  editButton: {
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(69,43,8,0.4)",
  },
  editButtonText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
});
